import 'server-only';
import dns from 'node:dns/promises';
import net from 'node:net';

const UA =
  'Mozilla/5.0 (compatible; WordOfModelBot/1.0; +https://wordofmodel.ai/about-the-scan) AppleWebKit/537.36';

/** ~4,000 tokens, per the spec's cap. Roughly four characters to a token. */
const MAX_CHARS = 16_000;

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
    throw new Error('That address is not reachable.');
  }
  let addrs: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addrs = result.map((a) => a.address);
  } catch {
    throw new Error(`We could not find a site at ${hostname}.`);
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) {
    throw new Error('That address is not reachable.');
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

async function fetchOne(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
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
  if (!home) throw new Error(`We could not read ${domain}. Check the address and try again.`);

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

  if (text.length < 120) {
    throw new Error(`There is not enough text on ${domain} for us to tell what you sell.`);
  }
  return { text: text.slice(0, MAX_CHARS), urls };
}
