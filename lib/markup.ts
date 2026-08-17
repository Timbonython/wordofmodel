/**
 * The signature device from the report template: highlighter on every competitor,
 * a different highlighter on you, red pen where you should be and aren't.
 *
 * Engines answer in markdown. The words are reproduced exactly; only the
 * formatting characters (**, ###, bullet dashes) are dropped, because the report
 * shows captured answers as plain text in a mono block.
 */

export type SegmentKind = 'plain' | 'you' | 'competitor';

export interface Segment {
  text: string;
  kind: SegmentKind;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split text into highlighted segments. Longest names first, so "Solgen Energy
 * Group" wins over "Solgen" and a name is never marked up twice.
 */
export function highlight(text: string, you: string, competitors: string[]): Segment[] {
  const names: Array<{ name: string; kind: SegmentKind }> = [
    ...(you ? [{ name: you, kind: 'you' as SegmentKind }] : []),
    ...competitors.map((c) => ({ name: c, kind: 'competitor' as SegmentKind })),
  ]
    .filter((n) => n.name.trim().length > 1)
    .sort((a, b) => b.name.length - a.name.length);

  if (!names.length) return [{ text, kind: 'plain' }];

  const pattern = new RegExp(`(${names.map((n) => escapeRegExp(n.name.trim())).join('|')})`, 'gi');
  const lookup = new Map(names.map((n) => [n.name.trim().toLowerCase(), n.kind]));

  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const found = match[0];
    if (index > last) segments.push({ text: text.slice(last, index), kind: 'plain' });
    segments.push({ text: found, kind: lookup.get(found.toLowerCase()) ?? 'competitor' });
    last = index + found.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), kind: 'plain' });
  return segments;
}

/** `**bold**` inside verdict copy. Kept minimal on purpose. */
export function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index), bold: false });
    out.push({ text: match[1] ?? '', bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}
