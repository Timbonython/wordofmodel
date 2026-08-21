/**
 * Is this proposed competitor a company, or the category wearing a name?
 *
 * WHY THIS EXISTS. The first real subscriber's competitor set contained "GlobaleSIM" for a
 * business selling "global eSIM data and phone numbers". It appeared as a bare token in
 * ONE of fifty-one real answers, while "global eSIM" as two words - the category - appeared
 * in thirty-two. It is the category with the spaces taken out, and it sat in the
 * leaderboard next to Airalo and Holafly looking like a peer.
 *
 * A leaderboard is a comparison. A comparison with a category term in it is wrong in a way
 * the subscriber notices before we do, and no amount of matcher accuracy fixes it: the
 * matcher was right, the input was not.
 *
 * Deliberately NOT server-only. The wizard re-checks as the subscriber types their own
 * replacements, so a hand-typed category term gets the same warning as a proposed one.
 *
 * NOTHING HERE DROPS ANYTHING. It returns a concern to show, and the subscriber decides -
 * the same mechanic as the market selector, which is the one that worked. A competitor we
 * silently removed would be a competitor they never got to disagree about.
 */

/** Strip to comparable letters and digits: "GlobaleSIM" and "global eSIM" both -> globalesim. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Words that describe a thing being sold rather than a company selling it. A proposed
 * "competitor" made only of these is a category, whatever it is capitalised like.
 */
const GENERIC = new Set([
  'global', 'international', 'worldwide', 'local', 'national', 'regional',
  'best', 'top', 'cheap', 'cheapest', 'budget', 'premium', 'pro', 'plus',
  'provider', 'providers', 'company', 'companies', 'agency', 'agencies',
  'service', 'services', 'solution', 'solutions', 'platform', 'platforms',
  'software', 'app', 'apps', 'tool', 'tools', 'system', 'systems',
  'online', 'digital', 'mobile', 'data', 'plan', 'plans', 'card', 'cards',
  'store', 'shop', 'marketplace', 'directory', 'comparison', 'reviews',
  'other', 'others', 'various', 'general', 'generic', 'alternative', 'alternatives',
]);

export interface CompetitorConcern {
  /** Plain language, written to be shown to the subscriber rather than logged. */
  message: string;
  kind: 'category' | 'generic' | 'no_domain' | 'unreachable';
}

/**
 * The category test.
 *
 * Two ways a name fails. It squashes to something contained in - or containing - the
 * subscriber's own category or product description, which is what caught GlobaleSIM. Or
 * every word in it is a generic descriptor, which catches "Global Providers" and
 * "Budget eSIM Solutions" without needing to know the category at all.
 *
 * The containment test is deliberately two-directional and length-guarded. "eSIM" inside
 * "global eSIM data" would match on containment alone and flag a real brand called eSIM,
 * so a name shorter than five squashed characters is only ever flagged by the generic test.
 */
export function categoryConcern(
  name: string,
  category: string,
  whatTheySell: string,
): CompetitorConcern | null {
  const n = squash(name);
  if (!n) return null;

  if (n.length >= 5) {
    for (const field of [category, whatTheySell]) {
      const f = squash(field || '');
      if (!f) continue;
      if (f.includes(n) || n.includes(f)) {
        return {
          kind: 'category',
          message: `"${name}" looks like a description of what you sell rather than a company.`,
        };
      }
    }
  }

  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length && words.every((w) => GENERIC.has(w))) {
    return {
      kind: 'generic',
      message: `"${name}" reads as a category rather than a company name.`,
    };
  }

  return null;
}
