/**
 * The report, rendered.
 *
 * SECTION ORDER, AND WHY IT IS NOT THE OFFER SHEET'S. The offer sheet leads with the number
 * and files the branded question at the bottom as a control condition. Zapme's first run
 * showed that backwards: a blended Share of Model of 9.3% reads as "do more marketing",
 * while the branded question says five surfaces know them and one will recommend them.
 * Those are different diagnoses with different fixes, and the second one is the finding.
 *
 *   1  the diagnosis          what is true, then what it means
 *   2  presence and endorsement, side by side, neither blended into the other
 *   3  what they said when asked about you by name
 *   4  what to do about it    their stated reasons, quoted, with what would change them
 *   5  what changed           omitted in month one rather than apologised for
 *   6  the leaderboard
 *   7  question by question
 *   8  where the answers came from
 *   9  the evidence, verbatim
 *  10  how this was measured
 *
 * FOUR SITS WHERE IT DOES BECAUSE THE READER IS READY FOR IT THERE: problem, proof, what to
 * do, then the supporting data. The branded section is where a subscriber learns that four
 * surfaces stopped short of recommending them, and the next thing they want is why. Putting
 * the actions after the leaderboard would make them read as a footnote to a chart; putting
 * them before the proof would make them read as advice.
 *
 * Everything is inline: one self-contained document that renders the same in an email
 * client, a browser and a PDF, and keeps working when the subscriber forwards it to
 * somebody with no login. The offer sheet's whole distribution model is that they forward
 * it internally.
 */

import 'server-only';
import { REPORT_CSS } from './report-css';
import { SLOT_LABEL } from './scope';
import type { GridState, ReportData } from './report';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

/** A whole number where it is one, one decimal where it is not. 1.6667 pairs reads badly. */
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const monthName = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * THE EMAIL IS THE SAME DOCUMENT WITH ITS EVIDENCE LINKED RATHER THAN INLINED.
 *
 * Not a second template. A summary email written separately would drift from the report
 * within two months, and the subscriber would have two documents disagreeing about their
 * month. So there is one renderer and one option.
 *
 * The reason the option exists is Gmail: it clips a message at about 102KB and hides the
 * rest behind "View entire message". Zapme's report is 218KB, and 190KB of that is 51
 * verbatim answers. Clipped, the method note and half the evidence vanish behind a link
 * that looks like a Gmail control rather than part of the product. Everything the report
 * concludes travels in the email; the raw answers, which are the part nobody reads in an
 * inbox and everybody wants when they are checking us, are one click away and behind a
 * login.
 */
export interface RenderOptions {
  /** Drop the verbatim answers and link to them instead. The email variant. */
  omitEvidence?: boolean;
  /** Absolute URL of the hosted report. Required when omitting the evidence. */
  viewUrl?: string;
}

export function renderReport(r: ReportData, opts: RenderOptions = {}): string {
  const period = monthName(r.run.periodStart);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Word of Model - ${esc(r.scope.brandName)} - ${esc(period)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
</head>
<body>
<header class="masthead"><div class="wrap">
  <div class="wordmark">Word of Model<span>.ai</span></div>
  <div class="issue">${esc(r.scope.brandName)} &middot; ${esc(r.scope.market)} &middot; ${esc(period)}</div>
</div></header>

<main class="wrap">
${sectionDiagnosis(r)}
${sectionPair(r)}
${sectionBranded(r)}
${sectionActions(r)}
${sectionDelta(r)}
${sectionLeaderboard(r)}
${sectionGrid(r)}
${sectionSources(r)}
${sectionEvidence(r, opts)}
${sectionMethod(r)}
</main>

<footer><div class="wrap note">
  Word of Model &middot; ${esc(period)} &middot; run ${esc(r.run.id.slice(0, 8))} &middot;
  thresholds v${r.versions.threshold} &middot; reading v${r.versions.extraction}
</div></footer>
</body>
</html>`;
}

// 1 ------------------------------------------------------------------ the diagnosis
function sectionDiagnosis(r: ReportData): string {
  return `  <section>
    <div class="eyebrow">What the models make of you</div>
    <div class="verdict">${esc(r.diagnosis.label)}</div>
    <h1>${esc(r.diagnosis.headline)}</h1>
    <p class="lede">${esc(r.diagnosis.meaning)}</p>
  </section>`;
}

// 2 ------------------------------------------- presence and endorsement, never blended
function sectionPair(r: ReportData): string {
  const p = r.presence;
  const e = r.endorsement;
  return `  <section>
    <div class="eyebrow">Where you stand</div>
    <div class="pair">
      <div class="half">
        <div class="k">Presence &middot; Share of Model</div>
        <div class="v">${pct(p.shareOfModel)}</div>
        <div class="sub">named in ${num(p.numerator)} of ${p.pairs} readings. A reading is one surface answering one of your four unbranded questions; where we ask three times, it counts as the share of those that named you, which is why this can be a fraction.</div>
      </div>
      <div class="half">
        <div class="k">Endorsement</div>
        <div class="v">${e.endorsed} <span style="font-size:26px;color:var(--ink-faint)">of ${e.askedDirectly}</span></div>
        <div class="sub">surfaces that recommend you when asked about you by name. ${e.recognised} of ${e.askedDirectly} could describe you.</div>
      </div>
    </div>
    <p class="note" style="margin-top:14px">Endorsement is a count, not a percentage. Five readings cannot carry one: a single engine changing its mind would move a percentage twenty points with nothing behind it.</p>
  </section>`;
}

// 3 --------------------------------- what they said when asked about you by name
function sectionBranded(r: ReportData): string {
  if (!r.branded.length) return '';
  const yes = r.branded.filter((b) => b.recommended).length;
  const items = r.branded
    .map(
      (b) => `      <li>
        <div class="who">${esc(b.label)} &middot; <span class="${b.recommended ? 'yes' : 'no'}">${b.recommended ? 'recommends you' : 'stops short of recommending you'}</span></div>
        ${b.excerpt ? `<p class="quote">${esc(b.excerpt)}</p>` : ''}
      </li>`,
    )
    .join('\n');
  return `  <section>
    <div class="eyebrow">Asked about you by name</div>
    <h2>${yes === 1 ? 'One of them will recommend you' : `${yes} of ${r.branded.length} will recommend you`}</h2>
    <p class="lede">Every surface was asked directly whether you are any good. This is the question they are most likely to answer, and what they say here is what a buyer sees the moment somebody passes on your name.</p>
    <ul class="said-list">
${items}
    </ul>
  </section>`;
}

// 4 ------------------------------------------------------------ what to do about it
/**
 * The actions, and the reason this section can be trusted is that we did not write it.
 *
 * Every heading names a surface, every quote is that surface's own sentence - verbatim,
 * checked against the answer at extraction time, and printed again in full in the evidence
 * section so the subscriber can go and read it in context. Only the line after "What would
 * change it" is ours, and it is fixed copy per reason rather than anything a model wrote.
 *
 * Empty when no surface stated a reason: no heading, no apology, nothing. A generated
 * recommendation is exactly what this section exists instead of.
 */
function sectionActions(r: ReportData): string {
  if (!r.actions.length) return '';
  const n = r.actions.length;
  const items = r.actions
    .map(
      (a) => `      <li>
        <div class="who">${esc(a.label)}</div>
        <p class="quote">${esc(a.quote)}</p>
        <p class="fix">${esc(a.whatWouldChangeIt)}</p>
      </li>`,
    )
    .join('\n');
  return `  <section>
    <div class="eyebrow">What to do about it</div>
    <h2>${n === 1 ? 'One of them told you what is wrong' : `${countWord(n)} of them told you what is wrong`}</h2>
    <p class="lede">None of this is our advice. Each line below is the reason a surface gave, unprompted and in its own words, for naming you without putting you forward, quoted from the answers printed in full further down this report. The only part we have added is what would change it.</p>
    <ul class="said-list actions">
${items}
    </ul>
  </section>`;
}

/** Small counts read as words in a heading. Nine is where that stops being natural. */
function countWord(n: number): string {
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  return words[n] ?? String(n);
}

// 5 -------------------------------------------------------------- what changed
function sectionDelta(r: ReportData): string {
  const d = r.delta;
  // Month one. No section at all rather than a heading explaining an absence: a first
  // report should read as a first report, not as a report with a piece missing.
  if (!d) return '';

  const suppressed = d.overall.comparable ? '' : `    <p class="suppressed">${esc(d.overall.reason ?? '')}</p>`;
  const headline = d.overall.comparable
    ? `<h2>${d.overall.change! >= 0 ? 'Up' : 'Down'} ${num(Math.abs(d.overall.change!))} readings since ${esc(monthName(d.previousPeriod))}</h2>`
    : `<h2>What we can compare since ${esc(monthName(d.previousPeriod))}</h2>`;

  const rows = d.bySurface
    .map((s) =>
      s.comparable
        ? `        <tr><td>${esc(s.surface)}</td><td class="num">${num(s.before!)} &rarr; ${num(s.now!)} of ${s.pairs}</td><td class="num ${s.change! > 0 ? '' : s.change! < 0 ? 'zero' : ''}">${s.change! > 0 ? '+' : ''}${num(s.change!)}</td></tr>`
        : `        <tr><td>${esc(s.surface)}</td><td colspan="2" class="note">${esc(s.reason ?? 'not compared')}</td></tr>`,
    )
    .join('\n');

  const endorsement = d.endorsement.comparable
    ? `    <p>Endorsement: ${d.endorsement.before} of ${d.endorsement.asked} last month, ${d.endorsement.now} of ${d.endorsement.asked} this month.</p>`
    : `    <p class="suppressed">${esc(d.endorsement.reason ?? '')}</p>`;

  const config = d.competitorsSuppressed.length
    ? `    <p class="note">${d.competitorsSuppressed.map(esc).join('<br>')}</p>`
    : '';

  return `  <section>
    <div class="eyebrow">What changed</div>
    ${headline}
${suppressed}
    <table class="board">
      <thead><tr><th>Surface</th><th class="num">Readings naming you</th><th class="num">Change</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
${endorsement}
${config}
  </section>`;
}

// 6 --------------------------------------------------------------- leaderboard
function sectionLeaderboard(r: ReportData): string {
  const max = Math.max(r.presence.shareOfModel ?? 0, ...r.competitors.map((c) => c.shareOfModel ?? 0), 0.01);
  const bar = (v: number | null) => `<span class="bar" style="width:${Math.round(((v ?? 0) / max) * 100)}%"></span>`;
  const you = `      <tr class="self"><td><mark class="you">${esc(r.scope.brandName)}</mark></td><td class="barcell">${bar(r.presence.shareOfModel)}</td><td class="num">${pct(r.presence.shareOfModel)}</td></tr>`;
  const rows = r.competitors
    .map(
      (c) =>
        `      <tr><td><mark>${esc(c.name)}</mark></td><td class="barcell">${bar(c.shareOfModel)}</td><td class="num">${pct(c.shareOfModel)}</td></tr>`,
    )
    .join('\n');
  return `  <section>
    <div class="eyebrow">Who is in the conversation</div>
    <h2>Named across the same answers as you</h2>
    <p class="lede">Every company here is measured over exactly the answers you are measured over. Same questions, same surfaces, same exclusions.</p>
    <table class="board">
      <thead><tr><th>Company</th><th class="barcell"></th><th class="num">Share of Model</th></tr></thead>
      <tbody>
${you}
${rows}
      </tbody>
    </table>
  </section>`;
}

// 7 ----------------------------------------------------------- question by question
/**
 * FOUR MARKS, NOT THREE, AND THE FOURTH IS THE ONE THAT MATTERS.
 *
 * The first render of this grid printed one dash for two opposite things. Google AI
 * Overviews on the category row: Google generated no overview at all, which is a real
 * measurement and a finding about the subscriber's category - their buyers are still
 * reading ranked links there. Grok on the situation row: we lost the capture. One says
 * something about their market, the other says something about our run, and a subscriber
 * reading the same grey dash in both cells has no way to tell which they are looking at.
 *
 * So a surface that showed nothing gets a filled mark - it answered the question we can
 * answer, with a no - and a reading we failed to take gets the red pen, dashed and hollow,
 * which is the design system's mark for an absence and is ours rather than theirs. Both are
 * named in the legend, in those terms.
 */
const MARK: Record<GridState, { cls: string; title: string }> = {
  named: { cls: 'named', title: 'named you' },
  absent: { cls: 'miss', title: 'answered, and did not name you' },
  no_answer: {
    cls: 'silent',
    title: 'this surface produced no answer to this question - a finding about your category',
  },
  not_measured: {
    cls: 'gap',
    title: 'we did not get a reading here. Not counted anywhere in this report',
  },
};

function sectionGrid(r: ReportData): string {
  const surfaces = r.run.surfaces;
  const head = surfaces.map((s) => `<th>${esc(r.bySurface.find((b) => b.surface === s)?.label ?? s)}</th>`).join('');
  const rows = r.questions
    .map((q) => {
      const cells = q.surfaces
        .map((s) => {
          const m = MARK[s.state];
          return `<td><span class="cell ${m.cls}" title="${esc(m.title)}"></span><div class="note">${esc(s.samples)}</div></td>`;
        })
        .join('');
      return `        <tr><td class="q"><strong>${esc(SLOT_LABEL[q.slot])}</strong><br>${esc(q.text)}</td>${cells}</tr>`;
    })
    .join('\n');
  return `  <section>
    <div class="eyebrow">Question by question</div>
    <h2>Your five questions, across ${surfaces.length} surfaces</h2>
    <div class="grid">
      <table class="score">
        <thead><tr><th class="q">Question</th>${head}</tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <div class="key">
      <span><i class="k-named"></i>named you</span>
      <span><i class="k-miss"></i>answered, did not name you</span>
      <span><i class="k-silent"></i>no answer: the surface showed nothing here. A finding about your category, not a gap in ours</span>
      <span><i class="k-gap"></i>not measured: we did not get a reading. Counted nowhere in this report</span>
      <span>counts are readings that named you, out of readings we got</span>
    </div>
  </section>`;
}

// 8 ------------------------------------------------------- where the answers came from
function sectionSources(r: ReportData): string {
  const own = r.scope.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  const items = r.domains
    .map(
      (d) =>
        `      <li class="${own && d.domain === own ? 'self' : ''}"><span class="dom">${esc(d.domain)}</span><span class="ct">${d.count} answers</span></li>`,
    )
    .join('\n');
  const aio = r.aiOverview
    ? `    <h3 style="margin-top:34px">${esc(r.aiOverview.headline)}</h3>
    <p>${esc(r.aiOverview.whatItMeans)}</p>`
    : '';
  return `  <section>
    <div class="eyebrow">Where the answers came from</div>
    <h2>Who is supplying the evidence</h2>
    <ul class="sources">
${items}
    </ul>
    <p class="note" style="margin-top:14px">Cited sources move much more between readings than the companies named do. Treat this as the kind of place these answers come from, not a fixed list.</p>
${aio}
  </section>`;
}

// 9 -------------------------------------------------------------- the evidence
function sectionEvidence(r: ReportData, opts: RenderOptions = {}): string {
  const total = r.evidence.reduce((t, e) => t + e.answers.length, 0);
  if (opts.omitEvidence) {
    // The claim stays in the email even though the answers do not. "All 51 answers are
    // there and you can read them" is the sentence that makes the rest of the report
    // checkable, and dropping it along with the answers would quietly remove the offer.
    return `  <section>
    <div class="eyebrow">The evidence</div>
    <h2>All ${total} answers, word for word</h2>
    <p class="lede">Nothing in this report is summarised from memory. Every answer it is built on is stored exactly as the surface gave it, and the full report has all ${total} of them, unedited, with what each surface cited.</p>
    ${opts.viewUrl ? `<p><a class="cta" href="${esc(opts.viewUrl)}">Read the full report</a></p>` : ''}
  </section>`;
  }
  const blocks = r.evidence
    .map((q) => {
      const answers = q.answers
        .map(
          (a) => `        <div class="excerpt" style="margin-bottom:14px">
          <div class="src">${esc(a.label)}${a.model ? ` &middot; ${esc(a.model)}` : a.provider ? ` &middot; via ${esc(a.provider)}` : ''}</div>
          <p class="said">${esc(a.answer)}</p>
        </div>`,
        )
        .join('\n');
      return `    <details>
      <summary>${esc(SLOT_LABEL[q.slot])} &middot; ${esc(q.text)}</summary>
      <div class="body">
${answers}
      </div>
    </details>`;
    })
    .join('\n');
  return `  <section>
    <div class="eyebrow">The evidence</div>
    <h2>All ${total} answers, word for word</h2>
    <p class="lede">Nothing here is summarised. This is what each surface actually said, so you can disagree with our reading of it.</p>
${blocks}
  </section>`;
}

// 10 ---------------------------------------------------------- how this was measured
function sectionMethod(r: ReportData): string {
  return `  <section>
    <div class="eyebrow">How this was measured</div>
    <h2>The method, in full</h2>
    <div class="method">${esc(r.method.join('\n'))}</div>
  </section>`;
}
