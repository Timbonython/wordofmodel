/**
 * The report, rendered.
 *
 * SECTION ORDER, AND WHY IT IS NOT THE OFFER SHEET'S. The offer sheet leads with the naming
 * rate and files the branded question at the bottom as a control condition. Zapme's first run
 * showed that backwards: a blended naming rate of 9.3% reads as "do more marketing", while
 * the branded question says five surfaces know them and one will recommend them. Those are
 * different diagnoses with different fixes, and the second one is the finding - which is why
 * the recommendation count is now the headline number rather than a column.
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
import { env } from './env';
import { SLOT_LABEL } from './scope';
import { countWord } from './actions';
import { BELOW_FLOOR_NOTE } from './metric';
import type { GridState, ReportData } from './report';
import { markSvg } from './brand';

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

export interface RenderOptions {
  /**
   * True only for the PUBLIC sample at /sample.
   *
   * Not the same question as `r.specimen`. A specimen is invented data; this is "is this
   * document being shown to a stranger who has no other way into the site". Setting
   * SAMPLE_RUN_ID publishes a REAL report at /sample, which is not a specimen and still needs
   * the way out - so the two flags cannot be collapsed into one.
   */
  publicSample?: boolean;
}

export function renderReport(r: ReportData, options: RenderOptions = {}): string {
  // A SPECIMEN CARRIES NO DATE AND NO RUN ID. Both would imply an execution that never
  // happened, and the whole value of the page is that a reader can trust what it says about
  // itself. See ReportData.specimen.
  const period = r.specimen ? 'Specimen' : monthName(r.run.periodStart);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${r.specimen ? 'index, follow' : 'noindex'}">
<title>${r.specimen ? 'Word of Model - sample report (specimen)' : `Word of Model - ${esc(r.scope.brandName)} - ${esc(period)}`}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
</head>
<body>
${r.specimen ? specimenBanner() : ''}
${options.publicSample ? siteBar(env.siteUrl) : ''}
<header class="masthead"><div class="wrap">
  ${options.publicSample ? '' : `<div class="wordmark"><a class="masthead-home" href="${esc(env.siteUrl)}/"><span class="lockup">${markSvg(22)}<span class="lockup-text">Word of Model&trade;<span class="lockup-suffix">.ai</span></span></span></a></div>`}
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
${sectionLocality(r)}
${sectionSources(r)}
${sectionEvidence(r)}
${sectionMethod(r)}
</main>

${options.publicSample ? closingBlock() : ''}
<footer><div class="wrap note">
  Word of Model&trade; &middot; ${r.specimen ? 'specimen, not a real run' : `${esc(period)} &middot; run ${esc(r.run.id.slice(0, 8))}`} &middot;
  headline v${r.versions.metric} &middot; thresholds v${r.versions.threshold} &middot; reading v${r.versions.extraction}
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
  const gap = r.recognised > e.endorsed;
  return `  <section>
    <div class="eyebrow">Where you stand</div>
    <div class="pair">
      <div class="half">
        <div class="k">Recommendation Share</div>
        <div class="v">${e.endorsed} <span style="font-size:26px;color:var(--ink-faint)">of ${e.askedDirectly}</span></div>
        <div class="sub">surfaces that recommend you when a buyer asks about you by name. This is the number this report is built around.</div>
      </div>
      <div class="half">
        <div class="k">Presence</div>
        <div class="v">${pct(p.shareOfModel)}</div>
        <div class="sub">how often you are named at all: ${num(p.numerator)} of ${p.pairs} readings across your four unbranded questions. Supporting detail, not the headline.</div>
      </div>
    </div>
    ${
      gap
        ? `<p class="gap-line">${e.recognised} of ${e.askedDirectly} surfaces know who you are. ${e.endorsed} of ${e.askedDirectly} will put you forward. <strong>That gap is the finding</strong>, and everything below is about closing it.</p>`
        : ''
    }
    <p class="note" style="margin-top:14px">A count, not a percentage, and never an arrow. It runs from nought to ${e.askedDirectly}: one surface changing its mind moves it twenty points, and a surface changing its mind is something we have measured happening on its own. Where you stand is a status. The trends in this report sit on figures with enough readings under them to carry one.</p>
  </section>`;
}

// 3 --------------------------------- what they said when asked about you by name
/**
 * A surface that did not say the same thing every time it was asked.
 *
 * Printed whenever the readings disagreed, and it is the honest half of a verdict that is
 * otherwise one word. Gemini recommending a brand in one reading of three and a surface doing
 * it in three of three are different facts, and the headline flattens them to the same word by
 * design, because a count out of five cannot carry a fraction. This line carries it instead.
 *
 * Measured 25 Aug 2026: one surface in five changes its verdict on its own across ten
 * identical readings. So this line is not a rare footnote, it is the expected case for
 * whichever surface sits near the boundary.
 */
function split(b: ReportData['branded'][number]): string {
  if (b.readings.of < 2 || b.readings.recommended === 0 || b.readings.recommended === b.readings.of) {
    return '';
  }
  const word = (n: number) => ['no', 'one', 'two', 'three'][n] ?? String(n);
  return `<p class="note">It did not say the same thing every time. Recommended you in ${word(b.readings.recommended)} of ${word(b.readings.of)} readings, which is why the verdict above follows the majority rather than the single reading that suited us best.</p>`;
}

function sectionBranded(r: ReportData): string {
  if (!r.branded.length) return '';
  const yes = r.branded.filter((b) => b.recommended).length;
  const items = r.branded
    .map(
      (b) => `      <li>
        <div class="who">${esc(b.label)} &middot; <span class="${b.recommended ? 'yes' : 'no'}">${b.recommended ? 'recommends you' : 'stops short of recommending you'}</span></div>
        ${split(b)}
        ${b.excerpt ? `<p class="quote">${esc(b.excerpt)}</p>` : ''}
      </li>`,
    )
    .join('\n');
  return `  <section>
    <div class="eyebrow">Asked about you by name</div>
    <h2>${
      yes === 0
        ? 'None of them will recommend you'
        : yes === 1
          ? 'One of them will recommend you'
          : `${yes} of ${r.branded.length} will recommend you`
    }</h2>
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
  const { items, convergence } = r.actions;
  if (!items.length) return '';
  const n = items.length;
  const rendered = items
    .map(
      (a) => `      <li>
        <div class="who">${esc(a.label)}</div>
        <p class="quote">${markSpan(a.quote, a.span)}</p>
        <p class="fix">${esc(a.whatWouldChangeIt)}</p>
      </li>`,
    )
    .join('\n');
  return `  <section>
    <div class="eyebrow">What to do about it</div>
    <h2>${n === 1 ? 'One of them told you what is wrong' : `${countWord(n)} of them told you what is wrong`}</h2>
    <p class="lede">None of this is our advice. Each line below is the reason a surface gave, unprompted and in its own words, for naming you without putting you forward, quoted from the answers printed in full further down this report. The only part we have added is what would change it.</p>
${convergence ? `    <p class="converge">${esc(convergence)}</p>` : ''}
    <ul class="said-list actions">
${rendered}
    </ul>
  </section>`;
}

/**
 * The reason clause, underlined inside the whole sentence.
 *
 * NOT TRIMMED TO THE CLAUSE, and the distinction is the product's. Grok gives its reason and
 * then softens it with praise, which reads oddly under a heading about what is wrong - and
 * the tempting fix is to quote the first half. Cutting a quote at the point where it stops
 * agreeing with our heading is what everyone else in this category does, and a subscriber
 * cannot tell from the page that it happened. So the sentence stays whole and gets a mark
 * under the part that is the reason: the eye lands in the right place, and the words that
 * soften it are still there for anyone reading properly.
 *
 * The span was checked against this exact string at extraction time. If it is not found -
 * a re-extraction, an older row - the sentence renders unmarked rather than approximately
 * marked.
 */
function markSpan(quote: string, span: string | null): string {
  if (!span) return esc(quote);
  const at = quote.indexOf(span);
  if (at < 0) return esc(quote);
  return `${esc(quote.slice(0, at))}<mark class="reason">${esc(span)}</mark>${esc(quote.slice(at + span.length))}`;
}

// 5 -------------------------------------------------------------- what changed
function sectionDelta(r: ReportData): string {
  const d = r.delta;
  // Month one. No section at all rather than a heading explaining an absence: a first
  // report should read as a first report, not as a report with a piece missing.
  if (!d) return '';

  const suppressed = d.overall.comparable ? '' : `    <p class="suppressed">${esc(d.overall.reason ?? '')}</p>`;
  const headline = !d.overall.comparable
    ? `<h2>What we can compare since ${esc(monthName(d.previousPeriod))}</h2>`
    : d.overall.belowFloor
      ? `<h2>Nothing moved further than we can measure</h2>`
      : `<h2>${d.overall.change! >= 0 ? 'Up' : 'Down'} ${num(Math.abs(d.overall.change!))} readings since ${esc(monthName(d.previousPeriod))}</h2>`;

  // The floor, said once, where the number would have been. Not an apology: a subscriber told
  // that nothing cleared the instrument's own error has been told something true, by the only
  // product in this category that has measured what that error is.
  const floorNote = d.overall.comparable && d.overall.belowFloor ? `    <p class="suppressed">${esc(BELOW_FLOOR_NOTE)}</p>` : '';

  const rows = d.bySurface
    .map((s) =>
      s.comparable
        ? `        <tr><td>${esc(s.surface)}</td><td class="num">${num(s.before!)} &rarr; ${num(s.now!)} of ${s.pairs}</td><td class="num ${s.belowFloor ? 'note' : s.change! < 0 ? 'zero' : ''}">${s.belowFloor ? 'steady' : `${s.change! > 0 ? '+' : ''}${num(s.change!)}`}</td></tr>`
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
${suppressed}${floorNote}
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
      <thead><tr><th>Company</th><th class="barcell"></th><th class="num">Named in</th></tr></thead>
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

// 7b ------------------------------------------------------------ where we asked from
/**
 * Only rendered for a scope narrower than a country, and it is a body section rather than a
 * footnote on purpose.
 *
 * A subscriber paying for local precision has bought a claim about where we asked, and the
 * true answer has three parts: three surfaces took their town as a parameter, two accept no
 * location at all and carry it in the question, and a town Google's list does not hold drops
 * to country level. Nobody else in the category discloses any of this, mostly because they
 * are running one engine and filing it under several names. It reads as confidence, not as a
 * caveat, which is why it sits above the sources rather than under the method.
 */
function sectionLocality(r: ReportData): string {
  if (!r.localityNote) return '';
  return `  <section>
    <div class="eyebrow">Where we asked from</div>
    <h2>How ${esc(r.scope.locality ?? '')} reached each surface</h2>
    <p>${esc(r.localityNote)}</p>
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

// 10 ---------------------------------------------------------- how this was measured
function sectionMethod(r: ReportData): string {
  return `  <section>
    <div class="eyebrow">How this was measured</div>
    <h2>The method, in full</h2>
    <div class="method">${esc(r.method.join('\n'))}</div>
  </section>`;
}


/**
 * The specimen banner. PERSISTENT AND UNMISSABLE, not a footnote.
 *
 * It is sticky rather than a block at the top, because a block scrolls away and a reader who
 * lands mid-document from a shared link would never see it. Somebody must not be able to
 * screenshot any part of this page and have it read as a real business's position.
 *
 * IT SAYS BOTH HALVES. What is invented (the business, the competitors, the answers) and what
 * is not (the format, the questions, the method). Only saying the first half would make the
 * page useless as evidence; only saying the second would make it a lie.
 */
/**
 * The site bar, on the public sample only.
 *
 * ON /sample AND NOT ON A SUBSCRIBER'S OWN REPORT. A stranger reading the sample has no other
 * way into the site and every reason to want one. Somebody reading their own report arrived
 * signed in from an email and does not need Pricing and a Free scan button over the top of
 * their own numbers.
 *
 * THE REPORT'S OWN MASTHEAD DROPS ITS WORDMARK WHEN THIS BAR IS PRESENT. The first version
 * shipped both and put two identical marks on the screen, one above the other, which a
 * screenshot caught and the code did not. The bar carries the brand and the masthead keeps its
 * issue line - brand, market, period - which is exactly how the site is arranged: SiteNav, then
 * the caption underneath.
 *
 * NO LINK TO /reviews. That page 404s until there are five approved reviews, and a nav item
 * pointing at a 404 is worse than an absent one. "Sample report" is the page you are on, marked
 * as current rather than linked to itself.
 */
function siteBar(siteUrl: string): string {
  const u = esc(siteUrl);
  return `<header class="rnav"><div class="wrap rnav-inner">
  <a class="rnav-brand wordmark" href="${u}/"><span class="lockup">${markSvg(20)}<span class="lockup-text">Word of Model&trade;<span class="lockup-suffix">.ai</span></span></span></a>
  <nav class="rnav-links" aria-label="Main">
    <a class="rnav-link" href="${u}/method">How it works</a>
    <a class="rnav-link" href="${u}/pricing">Pricing</a>
    <span class="rnav-here">Sample report</span>
    <a class="rnav-cta" href="${u}/#scan">Free scan</a>
  </nav>
</div></header>`;
}

/**
 * The way out, at the end of the sample.
 *
 * PLACED AT THE BOTTOM ON PURPOSE. Somebody who has read to here has read a whole report and is
 * the warmest traffic this site gets; somebody who bounced off the top was never going to be
 * persuaded by a button. It is also the only position that does not interrupt the document,
 * which is the thing being demonstrated.
 *
 * THE FREE SCAN LEADS, NOT THE PRICE. This page is indexable and is the one most likely to be
 * forwarded, so a good share of the people reading it have never seen the home page. Sending a
 * stranger straight at a US$69 subscription skips the free thing that exists to convince them.
 */
function closingBlock(): string {
  const url = env.siteUrl;
  return `<section class="wrap closing">
  <h2>That is the whole report.</h2>
  <p>One arrives every month, on the same date, built the same way. Yours would carry your five
  questions, your competitors and your own answers, captured word for word.</p>
  <p class="closing-actions">
    <a class="closing-cta" href="${esc(url)}/#scan">Run a free scan</a>
    <a class="closing-link" href="${esc(url)}/pricing">What it costs</a>
    <a class="closing-link" href="${esc(url)}/method">How it is measured</a>
  </p>
</section>`;
}

function specimenBanner(): string {
  return `<div class="specimen-banner">
  <strong>Sample report.</strong> The business and every competitor named here are invented, and
  so are the answers. The format, the five questions and the method are exactly what a subscriber
  receives.
</div>`;
}
