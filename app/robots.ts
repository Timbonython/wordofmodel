import type { MetadataRoute } from 'next';

/**
 * robots.txt, and the one thing a company selling AI visibility cannot afford to get wrong.
 *
 * Production served a 404 here until 26 Aug 2026. A 404 is not a refusal and every crawler
 * treats it as "no restrictions", so nothing was actually being blocked - but a business whose
 * entire product is what AI assistants say about you, serving nothing at the file where you
 * state your position on AI crawlers, is the kind of detail a sceptical buyer checks. They are
 * exactly the sort of person who types the URL.
 *
 * THE TRAP, AND IT IS THE WHOLE REASON THIS FILE IS CAREFUL. robots.txt matching is
 * MOST-SPECIFIC-GROUP-WINS, not additive. A crawler that finds a group naming its own token
 * obeys that group and IGNORES the `*` group completely. So naming GPTBot to welcome it, and
 * writing only `Allow: /` under it, would hand GPTBot the run of /scan/ and /report/ while the
 * `*` group that protects them sits right there being ignored. Every named group below
 * therefore repeats the same disallow list, and PRIVATE is the single array both groups use so
 * they cannot drift apart.
 *
 * WHY NAME THEM AT ALL, given `*` already allows everything not listed as private. Two
 * reasons, and neither is that it changes what a crawler may fetch today:
 *
 *   It is a statement. Publishers are blocking these agents in large numbers. We are not, on
 *   purpose, and the file is where that is said out loud. "We measure what AI says about
 *   companies, and we let AI read us" is a position, and it is checkable in ten seconds.
 *
 *   It is insurance. The day somebody adds a blanket `Disallow: /` under `*` in a hurry - a
 *   staging mistake, a scraper panic - these groups keep the assistants reading us. Which is
 *   the one thing this business must never accidentally switch off.
 *
 * AN OMISSION COSTS NOTHING, which is why this list is only tokens the operators have actually
 * published. A crawler that is not named falls into `*`, which allows everything except the
 * private paths. So there is no incentive to guess at a token, and guessing is how a file like
 * this ends up asserting the existence of a bot that does not exist.
 */

/**
 * Not for anyone, human or machine, and identical in both groups.
 *
 * `/scan/` and `/report/` are here because the indexing question is OPEN. A scan result is
 * somebody's brand being judged by a machine at a URL they were emailed, and a report is paid
 * subscriber content; both already carry noindex. Deciding to index scan results later is a
 * real growth argument and a real privacy argument, and it is Tim's decision to make rather
 * than one that gets made by default because nobody wrote this file. Until then: not crawled.
 *
 * `/start` is deliberately ABSENT. It is noindex, and a page you want kept out of search has
 * to be crawlable for the noindex to be read at all - disallowing it instead leaves a URL that
 * can still be listed from an external link, with no content and no way to see the directive
 * telling search engines to drop it. Crawl it, read the noindex, obey the noindex.
 */
const PRIVATE = ['/api/', '/auth/', '/account', '/scan/', '/report/'];

/**
 * The assistants and the crawlers that feed them, by their published tokens.
 *
 * Grouped by who runs them, because the interesting fact about this list is how many separate
 * agents one company runs for different purposes: OpenAI alone has a training crawler, a search
 * indexer and a fetcher that runs when a person asks ChatGPT about you right now. Blocking the
 * first and keeping the third is a coherent position for a publisher. Ours is simpler: all of
 * them, everywhere except the private paths.
 *
 * Google-Extended and Applebot-Extended are not crawlers and fetch nothing. They are permission
 * tokens: they control whether content already crawled by Googlebot and Applebot may be used
 * for AI answers and training. They belong here precisely because they are the ones that decide
 * whether we can appear in the surfaces we sell measurement of.
 */
const AI_AGENTS = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google. Google-Extended is the AI permission token, not a crawler.
  'Googlebot',
  'Google-Extended',
  // Microsoft, whose index is what Copilot answers from.
  'bingbot',
  // Apple
  'Applebot',
  'Applebot-Extended',
  // Meta
  'meta-externalagent',
  'meta-externalfetcher',
  // Amazon
  'Amazonbot',
  // DuckDuckGo's assistant
  'DuckAssistBot',
  // ByteDance
  'Bytespider',
  // Cohere
  'cohere-ai',
  'cohere-training-data-crawler',
  // Mistral
  'MistralAI-User',
  // Common Crawl, which is an input to a great many models rather than a product itself.
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE,
      },
      {
        userAgent: AI_AGENTS,
        allow: '/',
        // The same list, and it has to be. See the trap in the header: a named group is read
        // INSTEAD OF the `*` group, never in addition to it.
        disallow: PRIVATE,
      },
    ],
  };
}
