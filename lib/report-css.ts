/**
 * The report's stylesheet.
 *
 * Extracted verbatim from wordofmodel-report-template.html, which is the design system and
 * stays the source of truth: IBM Plex, highlighter on a competitor, red pen on an absence.
 * Copied into a constant rather than read from disk at request time because a serverless
 * function that depends on a repo file being traced into the bundle is a report that fails
 * in production and nowhere else.
 *
 * The block at the end is what the generator needs and the static sample did not have: the
 * presence and endorsement pair, the branded quotes, and the suppression note.
 *
 * Regenerate rather than hand-edit if the template changes.
 */
export const REPORT_CSS = String.raw`
:root{
    --paper:#F7F6F2;
    --card:#FFFFFF;
    --ink:#15171C;
    --ink-soft:#5C5F68;
    --ink-faint:#8E9199;
    --rule:#DEDCD4;
    --mark:#FFE566;        /* highlighter: a competitor */
    --mark-you:#9BDBFF;    /* highlighter: the client */
    --pen:#C8332B;         /* red pen: annotation and absence */
    --good:#2E7D5B;
    --sans:"IBM Plex Sans",system-ui,sans-serif;
    --cond:"IBM Plex Sans Condensed","IBM Plex Sans",sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,monospace;
    --wrap:940px;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{
    margin:0;background:var(--paper);color:var(--ink);
    font-family:var(--sans);font-size:16px;line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:var(--wrap);margin:0 auto;padding:0 24px}

  /* ---------- masthead ---------- */
  .masthead{border-bottom:2px solid var(--ink);padding:20px 0 14px;margin-bottom:56px}
  .masthead .wrap{display:flex;justify-content:space-between;align-items:baseline;gap:24px;flex-wrap:wrap}
  .wordmark{
    font-family:var(--cond);font-weight:700;font-size:15px;
    letter-spacing:.16em;text-transform:uppercase;
  }
  .wordmark span{color:var(--ink-faint)}
  .issue{font-family:var(--mono);font-size:12px;color:var(--ink-soft);letter-spacing:.04em}

  /* ---------- section furniture ---------- */
  section{margin-bottom:72px}
  .eyebrow{
    font-family:var(--mono);font-size:11px;font-weight:500;
    letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);
    display:flex;align-items:center;gap:12px;margin-bottom:18px;
  }
  .eyebrow::after{content:"";flex:1;height:1px;background:var(--rule)}
  h1{
    font-family:var(--cond);font-weight:700;
    font-size:clamp(38px,7vw,68px);line-height:.98;letter-spacing:-.02em;
    margin:0 0 20px;
  }
  h2{
    font-family:var(--cond);font-weight:700;
    font-size:clamp(26px,4vw,38px);line-height:1.05;letter-spacing:-.015em;
    margin:0 0 18px;
  }
  h3{font-size:16px;font-weight:600;margin:0 0 6px;letter-spacing:-.005em}
  p{margin:0 0 16px;max-width:66ch}
  .lede{font-size:19px;line-height:1.55;color:var(--ink-soft)}
  .note{font-family:var(--mono);font-size:12px;color:var(--ink-faint);line-height:1.5}

  /* ---------- signature: the markup ---------- */
  mark{background:var(--mark);color:inherit;padding:.05em .18em;border-radius:2px}
  mark.you{background:var(--mark-you)}
  .sweep{background-size:0% 100%;background-repeat:no-repeat;animation:sweep .5s ease forwards}
  .sweep:nth-of-type(1){animation-delay:.35s}
  .sweep:nth-of-type(2){animation-delay:.5s}
  .sweep:nth-of-type(3){animation-delay:.65s}
  .sweep:nth-of-type(4){animation-delay:.8s}
  @keyframes sweep{from{background-size:0% 100%}to{background-size:100% 100%}}
  @media (prefers-reduced-motion:reduce){
    .sweep{animation:none;background-size:100% 100%}
  }

  .excerpt{
    background:var(--card);border:1px solid var(--rule);
    padding:32px 34px;position:relative;
  }
  .excerpt .src{
    font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
    color:var(--ink-faint);margin-bottom:18px;
  }
  .excerpt .said{
    font-family:var(--mono);font-size:15px;line-height:1.85;margin:0;max-width:none;
  }
  .penmark{
    display:inline-flex;align-items:center;gap:8px;margin-top:24px;
    font-family:var(--mono);font-size:13px;color:var(--pen);
    border-top:2px solid var(--pen);padding-top:10px;
  }

  /* ---------- numbers ---------- */
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule)}
  .stat{background:var(--card);padding:26px 24px}
  .stat .k{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
  .stat .v{font-family:var(--cond);font-weight:700;font-size:52px;line-height:1;margin:10px 0 6px;letter-spacing:-.02em}
  .stat .d{font-family:var(--mono);font-size:12px;color:var(--ink-soft)}
  .stat .d.down{color:var(--pen)}
  .stat .d.up{color:var(--good)}

  /* ---------- leaderboard ---------- */
  .board{width:100%;border-collapse:collapse;font-size:15px}
  .board th{
    font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.1em;
    text-transform:uppercase;color:var(--ink-faint);text-align:left;
    padding:0 12px 10px 0;border-bottom:1px solid var(--rule);white-space:nowrap;
  }
  .board th.num,.board td.num{text-align:right;width:1%;white-space:nowrap}
  .board td{padding:11px 12px 11px 0;border-bottom:1px solid var(--rule);vertical-align:middle}
  .board tr.self td{background:rgba(155,219,255,.22);font-weight:600}
  .board .bar{display:block;height:8px;background:var(--ink);opacity:.16;min-width:2px}
  .board .bar.rec{background:var(--ink);opacity:.85;margin-top:3px}
  .board .zero{color:var(--pen);font-weight:600}
  .barcell{width:38%;min-width:110px}

  /* ---------- scorecard ---------- */
  .grid{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .score{border-collapse:collapse;font-size:14px;min-width:600px}
  .score th{
    font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.06em;
    color:var(--ink-faint);text-transform:uppercase;padding:0 10px 12px;text-align:center;
  }
  .score th.q{text-align:left;max-width:300px;text-transform:none;letter-spacing:0;
    font-family:var(--sans);font-size:14px;color:var(--ink);font-weight:400;padding-right:20px}
  .score td{padding:9px 10px;text-align:center;border-top:1px solid var(--rule)}
  .score td.q{text-align:left;max-width:320px;padding-right:20px;line-height:1.4}
  .cell{display:inline-block;width:18px;height:18px;border:1.5px solid var(--ink);vertical-align:middle}
  .cell.miss{border-color:var(--rule);background:transparent}
  .cell.named{background:var(--mark-you);border-color:var(--ink)}
  .cell.rec{background:var(--ink)}
  .key{display:flex;gap:22px;flex-wrap:wrap;margin-top:18px;font-family:var(--mono);font-size:11.5px;color:var(--ink-soft)}
  .key i{display:inline-block;width:13px;height:13px;border:1.5px solid var(--ink);margin-right:7px;vertical-align:-2px;font-style:normal}

  /* ---------- actions ---------- */
  .action{
    background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--ink);
    padding:22px 26px;margin-bottom:14px;display:flex;gap:22px;align-items:flex-start;
  }
  .action .n{
    font-family:var(--cond);font-weight:700;font-size:34px;line-height:1;
    color:var(--ink-faint);flex:none;width:34px;
  }
  .action p{margin:0;font-size:15px;color:var(--ink-soft)}
  .action .why{
    font-family:var(--mono);font-size:12px;color:var(--ink-faint);
    margin-top:10px;display:block;
  }

  /* ---------- sources ---------- */
  .sources{list-style:none;padding:0;margin:0;border-top:1px solid var(--rule)}
  .sources li{
    display:flex;justify-content:space-between;gap:16px;align-items:baseline;
    padding:11px 0;border-bottom:1px solid var(--rule);font-size:15px;
  }
  .sources .dom{font-family:var(--mono);font-size:14px}
  .sources .ct{font-family:var(--mono);font-size:13px;color:var(--ink-soft)}
  .sources li.self{background:rgba(155,219,255,.22);padding-left:10px;padding-right:10px}

  /* ---------- appendix ---------- */
  details{border-top:1px solid var(--rule)}
  details summary{
    cursor:pointer;padding:16px 0;font-family:var(--mono);font-size:13px;
    letter-spacing:.04em;list-style:none;display:flex;justify-content:space-between;gap:16px;
  }
  details summary::-webkit-details-marker{display:none}
  details summary::after{content:"open";color:var(--ink-faint)}
  details[open] summary::after{content:"close"}
  details .body{padding:0 0 26px}

  footer{border-top:2px solid var(--ink);padding:22px 0 60px;margin-top:20px}
  footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;
    font-family:var(--mono);font-size:11.5px;color:var(--ink-faint)}

  a{color:var(--ink);text-underline-offset:3px}
  :focus-visible{outline:2px solid var(--pen);outline-offset:3px}

  @media (max-width:680px){
    .stats{grid-template-columns:1fr}
    .stat .v{font-size:44px}
    .excerpt{padding:24px 20px}
    .excerpt .said{font-size:14px}
    .barcell{display:none}
    .board th.barcell{display:none}
  }
  @media print{
    body{background:#fff}
    .sweep{animation:none;background-size:100% 100%}
    details{display:block}
    details .body{display:block!important}
    section{break-inside:avoid;margin-bottom:36px}
  }

  /* ---------- added by the generator ---------- */
  .pair{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule)}
  .pair .half{background:var(--card);padding:28px 26px}
  .pair .half .k{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
  .pair .half .v{font-family:var(--cond);font-weight:700;font-size:56px;line-height:1;margin:10px 0 4px;letter-spacing:-.02em}
  .pair .half .sub{font-family:var(--mono);font-size:12px;color:var(--ink-soft)}
  .verdict{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;
    text-transform:uppercase;border:1.5px solid var(--pen);color:var(--pen);padding:5px 10px;margin-bottom:20px}
  .said-list{list-style:none;padding:0;margin:0}
  .said-list li{border-top:1px solid var(--rule);padding:18px 0}
  .said-list .who{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
  .said-list .who .yes{color:var(--good)}
  .said-list .who .no{color:var(--pen)}
  .said-list .quote{margin:8px 0 0;font-family:var(--mono);font-size:14px;line-height:1.75;max-width:none}
  .suppressed{border-left:3px solid var(--pen);padding:14px 0 14px 18px;margin:0 0 18px;
    font-size:15px;color:var(--ink-soft);max-width:66ch}
  .method{font-family:var(--mono);font-size:12.5px;line-height:1.8;color:var(--ink-soft);white-space:pre-wrap;max-width:80ch}
  @media (max-width:640px){
    .pair{grid-template-columns:1fr}
    .stats{grid-template-columns:1fr}
  }

`;
