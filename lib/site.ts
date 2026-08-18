import 'server-only';
import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * A normal browser string, because a self identifying bot string gets refused.
 * zapme.co is the case that proved it: the same URL is a 403 from the origin CDN
 * with a bot UA and a 200 with 26,000 characters of text with this one.
 *
 * This is not crawling. It is one fetch of one page, made because the owner of
 * that site typed its address into our form and asked us to read it.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** ~4,000 tokens, per the spec's cap. Roughly four characters to a token. */
const MAX_CHARS = 16_000;

/**
 * Why a read failed, because the answers are different things.
 *
 *   not_found   the hostname does not resolve. That is a typo, and the visitor
 *               fixing the address is the fastest way out. Stays an error.
 *   unreachable it resolves but will not give us a page: refused, timed out,
 *               not HTML.
 *   thin        we got a page and there is nothing on it we can use.
 *
 * The last two are our problem, not the visitor's, and they route to the manual
 * form instead of an error. Never dead end somebody at step 2.
 */
export type SiteReadFailure = 'not_found' | 'unreachable' | 'thin';

export class SiteReadError extends Error {
  constructor(
    message: string,
    readonly kind: SiteReadFailure,
  ) {
    super(message);
    this.name = 'SiteReadError';
  }
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    return false;
  }
  const low = ip.toLowerCase();
  return low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80');
}

/**
 * The visitor supplies this hostname and the server then fetches it, so refuse
 * anything pointing inside the network before making the request.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new SiteReadError('That address is not reachable.', 'not_found');
  }
  let addrs: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addrs = result.map((a) => a.address);
  } catch {
    throw new SiteReadError(`We could not find a site at ${hostname}.`, 'not_found');
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) {
    throw new SiteReadError('That address is not reachable.', 'not_found');
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/**
 * Redirects are followed, which is what gets www.example.com to the apex and
 * http to https without spending one of the candidates below on it.
 */
async function fetchOne(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || '';
    if (!type.includes('html') && !type.includes('text')) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The head of the document, for sites that render their body in JavaScript or
 * put nothing readable in it. A title and an og:description are usually enough
 * for the detect call to name the category, and it is a great deal better than
 * refusing to scan somebody with a React homepage.
 */
function metaText(html: string): string {
  const head = html.slice(0, 60_000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];

  const meta = (attr: string, name: string) =>
    new RegExp(
      `<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']*)["']` +
        `|<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${name}["']`,
      'i',
    ).exec(head);

  // Decoded, because meta content carries entities and "Kane &amp; Co" going
  // into the detect prompt is noise the model has to see past.
  const pick = (m: RegExpExecArray | null) => (m ? htmlToText(m[1] ?? m[2] ?? '') : '');

  const description =
    pick(meta('property', 'og:description')) ||
    pick(meta('name', 'description')) ||
    pick(meta('name', 'twitter:description'));
  const siteName = pick(meta('property', 'og:site_name'));
  const ogTitle = pick(meta('property', 'og:title'));

  return [siteName, title ? htmlToText(title) : '', ogTitle, description]
    .map((v) => v.trim())
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join('\n');
}

/** Titles that identify nothing. A page called "Home" tells us as much as no page. */
const EMPTY_TITLES = new Set([
  'home',
  'homepage',
  'welcome',
  'index',
  'untitled',
  'untitled document',
  'new page',
  'site',
  'website',
  'coming soon',
]);

/**
 * Worth spending a detect call on? The bar is deliberately low. "Hartwell
 * Orthodontics Perth" is 27 characters and names the brand, the category and the
 * market, which is more than some homepages manage. The real safety net is
 * downstream: if the model still cannot name a brand or a category it returns
 * nulls, and the visitor gets the manual form anyway. All this has to do is
 * avoid paying for a call on the word "Home".
 */
function usableMeta(meta: string): boolean {
  const flat = meta.replace(/\s+/g, ' ').trim();
  if (flat.length < 20) return false;
  if (EMPTY_TITLES.has(flat.toLowerCase())) return false;
  return true;
}

/**
 * Step 2's input: the homepage plus /about if it exists, stripped to text and
 * capped. Tries https then http, and www as a fallback, because plenty of small
 * business sites only answer on one of them.
 */
export async function readSite(domain: string): Promise<{ text: string; urls: string[] }> {
  await assertPublicHost(domain);

  let home: string | null = null;
  let base = '';
  for (const candidate of [`https://${domain}`, `https://www.${domain}`, `http://${domain}`]) {
    home = await fetchOne(candidate);
    if (home) {
      base = candidate;
      break;
    }
  }
  if (!home) {
    throw new SiteReadError(`We could not read ${domain}.`, 'unreachable');
  }

  const urls = [base];
  let text = htmlToText(home);

  // /about only if the homepage links to something that looks like it.
  const aboutPath = /href=["']([^"']*\babout[^"']*)["']/i.exec(home)?.[1];
  if (aboutPath) {
    try {
      const aboutUrl = new URL(aboutPath, base + '/').toString();
      if (new URL(aboutUrl).hostname.replace(/^www\./, '') === domain) {
        const about = await fetchOne(aboutUrl);
        if (about) {
          urls.push(aboutUrl);
          text += `\n\n--- ${aboutUrl} ---\n\n${htmlToText(about)}`;
        }
      }
    } catch {
      /* a malformed href is not worth failing the scan over */
    }
  }

  // A page with no usable body: a single page app, a splash screen, an image.
  // The head is the last thing to try before giving up on it.
  if (text.length < 120) {
    const meta = metaText(home);
    if (usableMeta(meta)) {
      text = meta;
    } else {
      throw new SiteReadError(
        `There is not enough text on ${domain} for us to tell what you sell.`,
        'thin',
      );
    }
  }

  return { text: text.slice(0, MAX_CHARS), urls };
}
