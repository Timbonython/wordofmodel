import { iso2, normaliseDomain } from '@/lib/domain';
import { writeQuestion } from '@/lib/detect';
import { completeScan, createScan, failScan, findCachedScan } from '@/lib/db';
import { recordFunnel, touchFrom } from '@/lib/funnel';
import { askChatGpt } from '@/lib/openai';
import { askPerplexity } from '@/lib/perplexity';
import {
  CAPS,
  checkGlobalScanCap,
  checkRateLimit,
  clientIp,
  hashIp,
  noteGlobalCapTripped,
  recordAttempt,
} from '@/lib/ratelimit';
import { sendOpsAlert } from '@/lib/billing-mail';
import { notifyScanCompleted } from '@/lib/notify';
import { scoreAnswer } from '@/lib/score';
import { ndjson } from '@/lib/stream';
import { buildVerdict } from '@/lib/verdict';
import { ENGINE_LABEL, type Capture, type ConfirmedProfile, type FreeResult } from '@/lib/types';

export const runtime = 'nodejs';
/** Two web search calls at 10 to 30 seconds each, plus scoring. */
export const maxDuration = 300;

interface ScanBody {
  /** The question already written in /api/detect. Absent when the visitor corrected a fact. */
  question?: string;
  domain?: string;
  profile?: Partial<ConfirmedProfile>;
  edited?: boolean;
  /** utm_* and fbclid, read off the landing URL by the client and stored on the row. */
  touch?: Record<string, unknown>;
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
  /*
   * NOTHING IS DEFAULTED HERE ANY MORE, AND THAT IS THE FIX.
   *
   * This function used to read:
   *
   *   buyer:   (p?.buyer?.trim()   || 'buyers in this category').slice(0, 200),
   *   country: (p?.country?.trim() || 'Australia').slice(0, 80),
   *
   * A country the model could not determine became Australia, in the same shape as a found
   * fact, and questionPrompt then instructed the model to "include the country or region" - so
   * it chose one. On 1 Sep 2026 that put an Adelaide pub in metro Melbourne and regional
   * Victoria. Principle §5: a failed read and a genuine answer, identical downstream.
   *
   * Null now reaches the profile as null, renders on the confirm card as visibly empty, and
   * produces a question with no geography rather than a question about the wrong place.
   */
  const trimmed = (v: string | null | undefined, max: number) => {
    const t = v?.trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    brand_name: brand.slice(0, 120),
    what_they_sell: sells.slice(0, 200),
    buyer: trimmed(p?.buyer, 200),
    country: trimmed(p?.country, 80),
    location: trimmed(p?.location, 200),
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
    /*
     * THE CACHE IS KEYED ON THE DOMAIN, AND FROM 1 SEP 2026 THE QUESTION IS THE VISITOR'S.
     *
     * findCachedScan asks one thing: was this domain scanned in the last 24 hours. That was
     * sound while the question was written from the domain and could not be anything else. Now
     * that the card lets somebody rewrite the question, a domain hit would answer their new
     * question with yesterday's answer to a different one - and the screen would show the
     * question they typed above a result that was never asked it. Principle §5, in the most
     * expensive place it could appear: the result is the product.
     *
     * So the cache is used only when the question matches. Whitespace and case are not a
     * difference; anything else is.
     */
    const asked = (body.question ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    const cachedRaw = await findCachedScan(domain);
    const sameQuestion =
      !asked || (cachedRaw?.question ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === asked;
    const cached = sameQuestion ? cachedRaw : null;
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

    // THE GLOBAL CEILING FIRST, and before any provider is called. Per-IP limits shape one
    // visitor's behaviour; this is the one that bounds the bill, because an IP is free and a
    // script can have thousands. It fails closed - see checkGlobalScanCap.
    const global = await checkGlobalScanCap();
    if (!global.ok) {
      if (await noteGlobalCapTripped()) {
        await sendOpsAlert({
          subject: 'The free scan daily cap has tripped',
          lines: [
            'No further scans will start today. Visitors are being told so plainly and offered',
            'the waitlist; nothing is erroring.',
            '',
            `Cap:      ${CAPS.scanPerDay} scans per UTC day`,
            'Change:   SCAN_CAP_GLOBAL_DAY in Vercel, no deploy needed',
            '',
            'Worth knowing which this is before raising it: a real surge from the campaign, or',
            'somebody looping an unauthenticated endpoint that costs us money per call.',
            'funnel_events by utm_content, and rate_events by ip_hash, separate the two.',
          ],
        });
      }
      emit({ type: 'error', message: global.message ?? 'We cannot start new scans just now.' });
      return;
    }

    const limit = await checkRateLimit(ipHash, 'scan');
    if (!limit.ok) {
      emit({ type: 'error', message: limit.message ?? 'Too many scans for now.' });
      return;
    }
    await recordAttempt(ipHash, 'scan');

    /*
     * ---- step 3: the question ----
     *
     * WRITTEN IN /api/detect NOW, so the confirm card can sit between it and the engines - see
     * §5 of the grounding brief. The client hands the question back with the profile it was
     * shown alongside.
     *
     * It hands back NOTHING if the visitor edited any of the three facts, which is the only
     * case that needs a rewrite and the only case that pays for one. A question written from
     * facts the visitor has since corrected is exactly the wrong question to ask.
     */
    let question = body.question?.trim() || '';
    if (!question) {
      emit({ type: 'stage', stage: 'writing', label: 'Writing the question a buyer would ask' });
      question = await writeQuestion(profile);
    }
    emit({ type: 'question', question });

    // First touch, from the URL the visitor landed on, passed up by the client. Stored on the
    // row because it has to survive a cleared browser and a hop to another device.
    const touch = touchFrom((body.touch ?? {}) as Record<string, unknown>);

    const scanId = await createScan({
      domain,
      profile,
      profileEdited: body.edited === true,
      question,
      ipHash,
      userAgent,
      touch,
    });
    await recordFunnel({ event: 'scan_started', scanId, touch, userAgent });

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
        usage: Awaited<ReturnType<typeof askChatGpt>>['usage'] | null;
      }

      const ask = async (
        engine: 'chatgpt' | 'perplexity',
        run: () => Promise<{
          text: string;
          citations: Answer['citations'];
          model: string;
          cost?: number | null;
          usage?: Answer['usage'];
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
            usage: a.usage ?? null,
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
              usage: a.usage,
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
      // ONLY HERE. Not on page load, not on an errored scan, not on an empty one: the two
      // failure paths above call failScan and record nothing. A scan that failed is not a scan
      // that happened, and counting it would flatter the ad that produced it.
      await recordFunnel({ event: 'scan_completed', scanId, touch, userAgent });

      // Same branch, same reasoning: a completed scan is a prospect worth seeing the morning
      // it arrives. Behind NOTIFY_SCAN_COMPLETED because this one scales with traffic, and it
      // never throws, so it cannot cost the visitor the result they are waiting on.
      await notifyScanCompleted({
        scanId,
        domain,
        brandName: profile.brand_name,
        categoryTerm: profile.category_term,
        country: profile.country,
        verdictKind: free.kind,
        competitorCount: free.competitor_count,
        topRecommendation: free.top_recommendation,
        utmSource: touch.utm_source,
        utmCampaign: touch.utm_campaign,
        utmContent: touch.utm_content,
      });

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
