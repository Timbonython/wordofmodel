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
 *   4  what changed          omitted in month one rather than apologised for
 *   5  the leaderboard
 *   6  question by question
 *   7  where the answers came from
 *   8  the evidence, verbatim
 *   9  how this was measured
 *
 * Everything is inline: one self-contained document that renders the same in an email
 * client, a browser and a PDF, and keeps working when the subscriber forwards it to
 * somebody with no login. The offer sheet's whole distribution model is that they forward
 * it internally.
 */

import 'server-only';
import { REPORT_CSS } from './report-css';
import { SLOT_LABEL } from './scope';
import type { ReportData } from './report';

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

export function renderReport(r: ReportData): string {
  const period = monthName(r.run.periodStart);
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Word of Model - ${esc(r.scope.brandName)} - ${esc(period)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
<body>
<header class="masthead"><div class="wrap">
  <div class="wordmark">Word of Model<span>.ai</span></div>
  <div class="issue">${esc(r.scope.brandName)} &middot; ${esc(r.scope.market)} &middot; ${esc(period)}</div>
</div></header>

<main class="wrap">
${sectionDiagnosis(r)}
${sectionPair(r)}
${sectionBranded(r)}
${sectionDelta(r)}
${sectionLeaderboard(r)}
${sectionGrid(r)}
${sectionSources(r)}
${sectionEvidence(r)}
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
        <div class="sub">named in ${num(p.numerator)} of ${p.pairs} answers, across your four unbranded questions</div>
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

// 4 -------------------------------------------------------------- what changed
function sectionDelta(r: ReportData): string {
  const d = r.delta;
  // Month one. No section at all rather than a heading explaining an absence: a first
  // report should read as a first report, not as a report with a piece missing.
  if (!d) return '';

  const suppressed = d.overall.comparable ? '' : `    <p class="suppressed">${esc(d.overall.reason ?? '')}</p>`;
  const headline = d.overall.comparable
    ? `<h2>${d.overall.change! >= 0 ? 'Up' : 'Down'} ${num(Math.abs(d.overall.change!))} answers since ${esc(monthName(d.previousPeriod))}</h2>`
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
      <thead><tr><th>Surface</th><th class="num">Answers naming you</th><th class="num">Change</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
${endorsement}
${config}
  </section>`;
}

// 5 --------------------------------------------------------------- leaderboard
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

// 6 ----------------------------------------------------------- question by question
function sectionGrid(r: ReportData): string {
  const surfaces = r.run.surfaces;
  const head = surfaces.map((s) => `<th>${esc(r.bySurface.find((b) => b.surface === s)?.label ?? s)}</th>`).join('');
  const rows = r.questions
    .map((q) => {
      const cells = q.surfaces
        .map((s) => {
          const cls = s.state === 'named' ? 'cell named' : s.state === 'absent' ? 'cell miss' : 'cell miss';
          const title = s.state === 'no_answer' ? 'no answer from this surface' : `named you in ${s.samples}`;
          return `<td><span class="${cls}" title="${esc(title)}"></span><div class="note">${esc(s.state === 'no_answer' ? '-' : s.samples)}</div></td>`;
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
      <span><i style="background:var(--mark-you)"></i>named you</span>
      <span><i style="border-color:var(--rule)"></i>did not name you</span>
      <span>counts are readings that named you, out of readings we got</span>
    </div>
  </section>`;
}

// 7 ------------------------------------------------------- where the answers came from
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

// 8 -------------------------------------------------------------- the evidence
function sectionEvidence(r: ReportData): string {
  const total = r.evidence.reduce((t, e) => t + e.answers.length, 0);
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

// 9 ----------------------------------------------------------- how this was measured
function sectionMethod(r: ReportData): string {
  return `  <section>
    <div class="eyebrow">How this was measured</div>
    <h2>The method, in full</h2>
    <div class="method">${esc(r.method.join('\n'))}</div>
  </section>`;
}
