import { iso2, normaliseDomain } from '@/lib/domain';
import { writeQuestion } from '@/lib/detect';
import { completeScan, createScan, failScan, findCachedScan } from '@/lib/db';
import { askChatGpt } from '@/lib/openai';
import { askPerplexity } from '@/lib/perplexity';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';
import { scoreAnswer } from '@/lib/score';
import { ndjson } from '@/lib/stream';
import { buildVerdict } from '@/lib/verdict';
import { ENGINE_LABEL, type Capture, type ConfirmedProfile, type FreeResult } from '@/lib/types';

export const runtime = 'nodejs';
/** Two web search calls at 10 to 30 seconds each, plus scoring. */
export const maxDuration = 300;

interface ScanBody {
  domain?: string;
  profile?: Partial<ConfirmedProfile>;
  edited?: boolean;
}

/**
 * The manual fallback asks for two things: what you sell and who buys it. So
 * what_they_sell and category_term each stand in for the other when only one of
 * them is filled, rather than refusing a form we ourselves only asked two
 * questions on. Rejecting that submission would put the dead end back one screen
 * further along.
 */
function confirmProfile(p: Partial<ConfirmedProfile> | undefined): ConfirmedProfile | null {
  const brand = p?.brand_name?.trim();
  const sold = p?.what_they_sell?.trim();
  const term = p?.category_term?.trim();
  const sells = sold || term;
  const category = term || sold;
  if (!brand || !category || !sells) return null;
  return {
    brand_name: brand.slice(0, 120),
    what_they_sell: sells.slice(0, 200),
    buyer: (p?.buyer?.trim() || 'buyers in this category').slice(0, 200),
    country: (p?.country?.trim() || 'Australia').slice(0, 80),
    category_term: category.slice(0, 120),
  };
}

/** Steps 3 to 5. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ScanBody;
  const domain = normaliseDomain(body.domain ?? '');
  const profile = confirmProfile(body.profile);

  if (!domain) return Response.json({ error: 'That does not look like a website address.' }, { status: 400 });
  if (!profile) {
    return Response.json({ error: 'We need a brand name and what you sell before we can run this.' }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request.headers));
  const userAgent = request.headers.get('user-agent');

  return ndjson(async (emit) => {
    const cached = await findCachedScan(domain);
    if (cached?.result && cached.question) {
      emit({ type: 'question', question: cached.question });
      emit({
        type: 'result',
        scanId: cached.id,
        question: cached.question,
        free: cached.result as FreeResult,
        cached: true,
        run_at: cached.created_at,
      });
      return;
    }

    const limit = await checkRateLimit(ipHash, 'scan');
    if (!limit.ok) {
      emit({ type: 'error', message: limit.message ?? 'Too many scans for now.' });
      return;
    }
    await recordAttempt(ipHash, 'scan');

    // ---- step 3: the question, on screen before anything is asked ----
    emit({ type: 'stage', stage: 'writing', label: 'Writing the question a buyer would ask' });
    const question = await writeQuestion(profile);
    emit({ type: 'question', question });

    const scanId = await createScan({
      domain,
      profile,
      profileEdited: body.edited === true,
      question,
      ipHash,
      userAgent,
    });

    try {
      // ---- step 4: both engines at once ----
      const country = iso2(profile.country);
      emit({ type: 'stage', stage: 'running', label: 'Asking the engines' });

      interface Answer {
        engine: 'chatgpt' | 'perplexity';
        model: string;
        text: string;
        citations: Awaited<ReturnType<typeof askChatGpt>>['citations'];
        ms: number;
        cost: number | null;
        tokens: number | null;
      }

      const ask = async (
        engine: 'chatgpt' | 'perplexity',
        run: () => Promise<{
          text: string;
          citations: Answer['citations'];
          model: string;
          cost?: number | null;
          tokens?: number | null;
        }>,
      ): Promise<Answer | null> => {
        emit({ type: 'engine_started', engine, label: ENGINE_LABEL[engine] });
        const started = Date.now();
        try {
          const a = await run();
          const ms = Date.now() - started;
          emit({
            type: 'engine_done',
            engine,
            label: ENGINE_LABEL[engine],
            ms,
            model: a.model,
            citations: a.citations.length,
          });
          return {
            engine,
            model: a.model,
            text: a.text,
            citations: a.citations,
            ms,
            cost: a.cost ?? null,
            tokens: a.tokens ?? null,
          };
        } catch (err) {
          emit({
            type: 'engine_failed',
            engine,
            label: ENGINE_LABEL[engine],
            message: err instanceof Error ? err.message : 'failed',
          });
          return null;
        }
      };

      const answers = (
        await Promise.all([
          ask('chatgpt', () => askChatGpt(question, country)),
          ask('perplexity', () => askPerplexity(question, country)),
        ])
      ).filter((a): a is Answer => a !== null);

      if (!answers.length) {
        await failScan(scanId, 'both engines failed');
        emit({ type: 'error', message: 'Both engines refused to answer just now. Try again in a few minutes.' });
        return;
      }

      emit({ type: 'scoring' });
      const captures = (
        await Promise.all(
          answers.map((a) =>
            scoreAnswer({
              engine: a.engine,
              model: a.model,
              brand_name: profile.brand_name,
              question,
              answer: a.text,
              citations: a.citations,
              ms: a.ms,
              cost: a.cost,
              tokens: a.tokens,
            }).catch(() => null),
          ),
        )
      ).filter((c): c is Capture => c !== null);

      if (!captures.length) {
        await failScan(scanId, 'scoring failed on every answer');
        emit({ type: 'error', message: 'We got the answers but could not score them. Try again in a few minutes.' });
        return;
      }

      // ---- step 5 ----
      const free = buildVerdict(profile.brand_name, captures);
      const costUsd = captures.reduce<number | null>(
        (sum, c) => (c.cost_usd === null ? sum : (sum ?? 0) + c.cost_usd),
        null,
      );
      await completeScan(scanId, { captures, result: free, costUsd });

      emit({
        type: 'result',
        scanId,
        question,
        free,
        cached: false,
        run_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The scan failed.';
      await failScan(scanId, message);
      emit({ type: 'error', message });
    }
  });
}
