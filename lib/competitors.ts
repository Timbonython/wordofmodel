/**
 * Does this proposed competitor actually exist?
 *
 * The third of three layers on competitor quality, and the only one that touches the
 * network. The prompt (lib/wizard-prompts.ts) refuses categories and demands a domain; the
 * deterministic check (lib/competitor-check.ts) catches a category that got through anyway;
 * this asks the web whether the domain is real.
 *
 * THE BAR IS DELIBERATELY LOW, and that is the important design decision. zapme.co - a real
 * company, the subscriber's own site - returns 403 to our reader. So a 403, a 401, a 503 or
 * a redirect all count as EXISTS. Only a domain that does not resolve at all, or refuses the
 * connection outright, is flagged.
 *
 * A stricter test would flag real companies with bot protection, which is most of them, and
 * a warning that fires on good input is a warning people learn to click past. Narrow and
 * reliable beats broad and noisy.
 *
 * NOTHING IS EVER DROPPED. This returns a concern to show the subscriber, who decides. Same
 * mechanic as the market selector.
 */

import 'server-only';
import { normaliseDomain } from './domain';
import { categoryConcern, type CompetitorConcern } from './competitor-check';

export interface ProposedCompetitor {
  name: string;
  domain: string | null;
  concern: CompetitorConcern | null;
}

/** Head first, then a ranged GET: some hosts refuse HEAD but answer GET perfectly well. */
async function resolves(domain: string): Promise<boolean> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(`https://${domain}/`, {
        method,
        redirect: 'follow',
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : {},
        signal: AbortSignal.timeout(6_000),
      });
      // Any HTTP answer at all means something is there. A 403 is a real company with a
      // bot filter, which is the common case and must not be called nonexistent.
      if (res.status > 0) return true;
    } catch {
      // DNS failure, refused connection, SSL failure or timeout. Try the other method
      // before deciding: some hosts refuse HEAD and answer GET perfectly well.
    }
  }
  return false;
}

/**
 * Run all three layers over a proposed set.
 *
 * Domain checks run in parallel and are individually tolerant: a check that throws leaves
 * the competitor unflagged rather than flagged, because a failure of ours is not evidence
 * about them.
 */
export async function checkCompetitors(
  proposed: Array<{ name: string; domain?: string | null }>,
  profile: { category_term: string; what_they_sell: string },
): Promise<ProposedCompetitor[]> {
  return Promise.all(
    proposed.map(async (c) => {
      const name = c.name.trim();
      const domain = normaliseDomain(c.domain ?? '');

      // Cheapest and most certain first: a category term is wrong whatever its domain says.
      const category = categoryConcern(name, profile.category_term, profile.what_they_sell);
      if (category) return { name, domain, concern: category };

      if (!domain) {
        return {
          name,
          domain: null,
          concern: {
            kind: 'no_domain' as const,
            message: `We could not find a website for "${name}". Check it is a real company.`,
          },
        };
      }

      let live = true;
      try {
        live = await resolves(domain);
      } catch {
        live = true; // our failure, not theirs
      }

      return {
        name,
        domain,
        concern: live
          ? null
          : {
              kind: 'unreachable' as const,
              // TWO CAUSES, AND THE MESSAGE MUST NOT PICK ONE. Measured 21 Aug 2026: the
              // proposal returned "Nomad" at nomad.com, which fails SSL outright, while the
              // real Nomad eSIM brand is at getnomad.app. The company is real and the
              // domain was invented. Saying "may not be a real company" would have sent the
              // subscriber to delete a genuine competitor.
              message:
                `We could not reach ${domain}. Either that is the wrong domain for ` +
                `"${name}", or it is not a real company. Worth a look either way.`,
            },
      };
    }),
  );
}
