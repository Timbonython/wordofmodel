import Link from 'next/link';
import { ScanPanel } from '@/components/scan/ScanPanel';
import { WaitlistForm } from '@/components/WaitlistForm';
import { foundingDisplayOrNull } from '@/lib/billing';
import { priceLabel } from '@/lib/scope';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { recordFunnel, touchFrom } from '@/lib/funnel';

/**
 * DYNAMIC ON PURPOSE, declared here rather than inherited.
 *
 * This page was already rendering dynamically, but only as a side effect: app/layout.tsx reads
 * headers() for the Meta pixel country gate, which opts the whole route out of static
 * rendering. That line was written for something else entirely and will be edited by somebody
 * working on the pixel - and the day it changes, this page silently goes static, searchParams
 * stops resolving, and the landing event stops recording with nothing failing.
 *
 * A measurement must not depend on an unrelated line staying the way it is. `revalidate = 60`
 * used to sit here and had been dead for the same reason.
 */
export const dynamic = 'force-dynamic';

/**
 * Meta fetches the exact ad URL, parameters and all, to build the link preview. That request is
 * attributed and is not a person, so gating on utm alone would leave a fixed inflation in the
 * one number the ad test is read from - and a known wrong number is still a number somebody has
 * to remember to subtract.
 *
 * Matched loosely and case-insensitively because Meta runs several and renames them:
 * facebookexternalhit is the long-standing one, meta-externalagent and facebookcatalog are the
 * others seen in the wild. Narrow this if a real browser is ever caught by it.
 */
function isMetaCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes('facebookexternalhit') || ua.includes('meta-externalagent') || ua.includes('facebookcatalog');
}

/**
 * One page, sections 1 to 10 of wordofmodel-site-copy.md. The scan is the hero:
 * the field itself on the first screen, not a button that scrolls to a form.
 *
 * The founding count in the pricing block is read live. It is the real number of
 * places left, and it has to stay the real number: if it is real it is
 * persuasive, and if it is not, somebody will screenshot it.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const founding = await foundingDisplayOrNull();
  const wizardLive = env.wizardLive;

  // ---- the top of the funnel, for ad traffic only ----
  //
  // ATTRIBUTED VISITS ONLY. An organic or direct visitor records nothing here, and that is a
  // trade rather than an oversight: /start recorded every server render on 27 Aug 2026 and
  // produced 1030 rows against 2 scans, because a crawler and a person look identical to a
  // server. The home page is linked and crawled far more than /start. A crawler does not append
  // utm_content; an ad click always does. See 0019 and CLAUDE.md.
  const touch = touchFrom(await searchParams);
  const attributed = Boolean(touch.utm_source || touch.utm_content || touch.fbclid);
  if (attributed && !isMetaCrawler((await headers()).get('user-agent'))) {
    await recordFunnel({ event: 'landed', touch });
  }
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <div className="wordmark">
            Word of Model&trade; <span>/ free scan</span>
          </div>
          <div className="issue">RECOMMENDATION SHARE &nbsp;·&nbsp; WHAT AI SAYS ABOUT YOU</div>
        </div>
      </header>

      <main className="wrap">
        {/* ============ 1. HERO ============ */}
        <section className="hero">
          <div className="eyebrow">Word of mouth still decides who gets bought. The mouth is just a machine now</div>
          <h1>
            Your buyers stopped Googling.
            <br />
            They started asking.
            <br />
            ChatGPT.
          </h1>
          <p className="lede">
            And when they ask - ChatGPT, Gemini, Grok, Perplexity or Google's own AI answers - something answers on
            your behalf. It names a handful of companies in your category, recommends one, and moves on.
          </p>
          <p className="lede">Nobody told you whether you were in that list.</p>
          {/* "About two minutes", measured, not guessed. Ten completed scans: min 41s,
              median 91s, max 139s, and one drive at 166s when ChatGPT was slow. "About a
              minute" was true only at the fast end, and this line is read by somebody who
              then waits. Under-promising against the 41s case is the safe direction. */}
          <p className="hero-cta">Find out in about two minutes. Free.</p>

          <div id="scan">
            <ScanPanel wizardLive={wizardLive} />
          </div>
        </section>

        {/* ============ 2. THE SHIFT ============ */}
        <section>
          <div className="eyebrow">The shift</div>
          <h2>This is not SEO with a new hat on</h2>
          <p>
            Search used to hand people ten blue links and let them choose. AI answers hand them a shortlist of three and
            a recommendation.
          </p>
          <p>
            <strong>Ten links is a market. Three names is a gate.</strong>
          </p>
          <p>
            If you're not one of the three, you're not in the running - and unlike page two of Google, there's no page
            two to be on.
          </p>
          <p>
            Most businesses have never once checked. Not because they don't care. Because until recently there was
            nothing to check.
          </p>

          <h3 className="stats-head">Three numbers worth sitting with</h3>
          <div className="stats">
            <div className="stat">
              <div className="k">Searches ending without a click</div>
              <div className="v">68%</div>
              <div className="d">
                Share of US Google searches in early 2026 that ended without a single click. Two years ago it was 60%.
                On mobile it's 77%.
              </div>
              {/* TODO: swap in the deep link to the June 2026 clickstream post. */}
              <span className="src">
                <a href="https://sparktoro.com" rel="noopener noreferrer nofollow" target="_blank">
                  SparkToro / Similarweb clickstream, June 2026
                </a>
              </span>
            </div>
            <div className="stat">
              <div className="k">Questions going to AI instead</div>
              <div className="v">28%</div>
              <div className="d">
                Search-style questions now going to AI assistants instead of a search engine, measured against global
                search volume. In the US it's around 17%, and it was near enough to zero four years ago.
              </div>
              {/* TODO: swap in the deep link to the March 2026 Graphite study. */}
              <span className="src">
                <a href="https://graphite.io" rel="noopener noreferrer nofollow" target="_blank">
                  Graphite.io, March 2026
                </a>
              </span>
            </div>
            <div className="stat">
              <div className="k">Growth in total search</div>
              <div className="v">26%</div>
              <div className="d">
                How much total search grew over the same period. Google didn't shrink. The pie got bigger and AI took
                the new slice.
              </div>
              <span className="src">
                <a href="https://graphite.io" rel="noopener noreferrer nofollow" target="_blank">
                  Graphite.io, March 2026
                </a>
              </span>
            </div>
          </div>

          <p className="after-stats">That last number is the one most people get wrong, and it changes what you should do about it.</p>
          <p>
            Google is not dying and you should not stop doing SEO. What's happened is that a second front opened up,
            it's growing fast, and almost nobody is measuring their position on it. Google's own AI Mode passed a
            billion monthly users this year, with query volume more than doubling every quarter.
          </p>
          <p>
            So the question isn't whether to abandon search. It's whether you know where you stand on the half of it
            that didn't exist four years ago.
          </p>
        </section>

        {/* ============ 3. THE PART NOBODY EXPECTS ============ */}
        <section>
          <div className="eyebrow">The part nobody expects</div>
          <h2>When AI has nothing to go on, it doesn't say "I don't know"</h2>
          <p>It fills the gap.</p>
          <p>
            We ran a full audit for a software company earlier this year. One engine described their product as having a
            dated backend and put the criticism down to customer reviews.
          </p>
          <p>Three questions earlier, the same engine had told us there are no reviews of this company anywhere.</p>
          <p className="punch">It made them up.</p>
          <p>
            That's what an information vacuum does. It doesn't leave a blank where you should be. It writes something
            in.
          </p>
        </section>

        {/* ============ 4. WHAT YOU ACTUALLY GET ============ */}
        <section>
          <div className="eyebrow">What you actually get</div>
          <h2>A report you'd miss if it stopped arriving</h2>
          <p>Every month, on the same date.</p>

          <div className="gets">
            <div className="get">
              <h3>The number</h3>
              <p>How many of them recommend you, how often you are named at all, and the gap between the two. One plain sentence on what it means.</p>
            </div>
            <div className="get">
              <h3>What changed</h3>
              <p>Mentions gained and lost. Competitors who overtook you. New sources the AI started citing.</p>
            </div>
            <div className="get">
              <h3>The leaderboard</h3>
              <p>
                Every brand named across the answers, with a second column most people find harder to read than the
                first: how many times each one was actually <em>recommended</em>. Getting named and getting recommended
                are not the same thing, and the gap between them is usually the story.
              </p>
            </div>
            <div className="get">
              <h3>The answers, word for word</h3>
              <p>
                Not a summary. Not a score standing in for the truth. The actual text, so you can read it yourself and
                argue with it if you want to.
              </p>
            </div>
            <div className="get">
              <h3>Where it's coming from</h3>
              <p>The sites the AI cited. Usually a short and surprising list, and usually somebody else's.</p>
            </div>
            <div className="get">
              <h3>Three things to do this month</h3>
              <p>Ranked. Not eight, not a backlog. Three, in order, with why that one is first.</p>
            </div>
            <div className="get">
              <h3>And once a quarter, two more surfaces</h3>
              <p>Claude and Microsoft Copilot, read by hand, because that is the only honest way to read them.</p>
            </div>
          </div>
        </section>

        {/* ============ 4a. THE COMPETITORS YOU DIDN'T PICK ============ */}
        <section>
          <div className="eyebrow">The competitors you didn't pick</div>
          <h2>You give us four. We tell you who the AI actually named.</h2>
          <p>
            Most months those two lists aren't the same, and the gap is usually the useful part. A
            business you have never heard of, quietly being recommended to your buyers. A big name you
            assumed you competed with, which never comes up at all.
          </p>
          <p>
            That's not a scoreboard. It's a map of the category as the machine understands it,
            which is increasingly the version your buyer sees first.
          </p>
        </section>

        {/* ============ 4b. WHERE THE ANSWERS COME FROM ============ */}
        <section>
          <div className="eyebrow">Where the answers come from</div>
          <h2>Every answer is built out of somebody else's pages</h2>
          <p>
            We show you which ones. Usually a short list, usually surprising, and usually not yours. A
            trade publication you have never pitched. A forum thread from four years ago. A comparison
            article on a site you have never heard of.
          </p>
          <p>
            That list is the most actionable thing in the report, because it's the one thing you can
            go and do something about this month.
          </p>
        </section>

        {/* ============ 5. HOW IT WORKS ============ */}
        <section>
          <div className="eyebrow">How it works</div>
          <h2>Five questions, five platforms, every month</h2>
          <ol className="steps">
            <li>
              <p>
                <strong>You tell us what you sell and who buys it.</strong> Three minutes, no call.
              </p>
            </li>
            <li>
              <p>
                <strong>We write five questions your buyers would actually type.</strong> Real buying-moment questions,
                not brand searches.
              </p>
            </li>
            <li>
              <p>
                <strong>You approve them.</strong> This bit matters. If you read the five and think nobody would ever
                ask that, we go again. The whole exercise is worthless if you don't believe the questions, so we don't
                run anything until you do.
              </p>
            </li>
            <li>
              <p>
                <strong>We run them across five AI platforms.</strong> ChatGPT, Gemini, Grok, Perplexity and Google's AI
                answers. The same five every month, so the number means something when you compare it to last month.
              </p>
            </li>
            <li>
              <p>
                <strong>Your first report lands within 24 hours.</strong> Then the same date, every month.
              </p>
            </li>
            <li>
              <p>
                <strong>Once a quarter, two more by hand.</strong> Claude and Microsoft Copilot can't be asked
                automatically without substituting something else and calling it their answer. So we ask them
                ourselves, and put what they said in your quarterly review.
              </p>
            </li>
          </ol>
        </section>

        {/* ============ 6. WHY NOT JUST BUY A TOOL ============ */}
        <section>
          <div className="eyebrow">Why not just buy a tool</div>
          <h2>Buy one. Genuinely.</h2>
          <p>
            If what you want is a number that updates every week, there are good tools that do exactly that from about
            $99 a month, and some of our subscribers run both.
          </p>
          <p>Here's the difference.</p>
          <p className="punch">They count how often you get mentioned. We read what got said.</p>
          <p>
            A count would not have caught a model inventing customer reviews. A count doesn't tell you that your one
            competitor is winning because they published a comparison page nobody else bothered to write. A count gives
            you a line on a chart that moves two percent and leaves you with nothing to do on Monday.
          </p>
          <p>
            <strong>We give you three things to do on Monday.</strong>
          </p>
        </section>

        {/* ============ 6a. WHY WE DON'T CHECK EVERY DAY ============ */}
        <section>
          <div className="eyebrow">Why we don't check every day</div>
          <h2>Because nothing you'd do about it changes every day</h2>
          <p>
            Ask an AI the same question twice and you'll get different answers. That's not a
            glitch, it's how they work. Published research puts a single question asked once at plus
            or minus forty four points. So a dashboard refreshing every hour isn't showing you your
            position moving. It's showing you the weather.
          </p>
          <p>
            Meanwhile the things that actually matter barely move at all. Across a study of over a
            thousand categories, the brands that owned a category kept the top spot in ninety percent of
            month-to-month comparisons. And AI answers currently send about one percent of website
            traffic.
          </p>
          <p className="punch">
            So the question isn't how often you check. It's what you learn when you do.
          </p>
          <p>
            Which sources the AI is leaning on. Who it names when your buyer asks. What it says about
            you, word for word, so you can argue with it. And three things worth doing about it.
          </p>
          <p>Those change when somebody publishes something, not when the clock ticks.</p>
          <p>
            <Link href="/method">Every number on this page, and where it came from</Link>.
          </p>
        </section>

        {/* ============ 7. WHO THIS IS FOR ============ */}
        <section>
          <div className="eyebrow">Who this is for</div>
          <h2>You sell something people research before they buy</h2>
          <p>You have competitors a customer could name out loud.</p>
          <p>
            You already spend money on being found, and you've started wondering whether it still works.
          </p>
          <p>
            <strong>Who it isn't for.</strong> If you're happy with a dashboard, buy a dashboard. If nobody ever
            compares you to anyone, you don't need this yet.
          </p>
        </section>

        {/* ============ 8. PRICING ============ */}
        <section id="pricing">
          <div className="eyebrow">Pricing</div>
          <h2>One plan. {priceLabel('standard_monthly')} a month.</h2>
          <div className="price">
            <p className="amount">{priceLabel('standard_monthly')} / month</p>
            <p>
              Five questions. Five AI platforms. Twenty five answers captured word for word, every month, from fifty
              five readings, because the surfaces that move most get asked three times. Competitor leaderboard, source
              analysis, and three ranked actions. Plus a quarterly deep read that adds Claude and Copilot by hand.
              Cancel any time, no contract.
            </p>
            {founding === null ? (
              <p>
                <span className="founding">Founding rate: {priceLabel('founding_monthly')} a month.</span> First 20 subscribers, locked for
                twelve months.
              </p>
            ) : founding.remaining > 0 ? (
              <p>
                <span className="founding">Founding rate: {priceLabel('founding_monthly')} a month.</span>{' '}
                {founding.remaining === 20
                  ? 'All 20 founding places are open'
                  : founding.remaining === 1
                    ? 'One founding place left'
                    : `${founding.remaining} founding places left`}
                , locked for twelve months from the day you start.
              </p>
            ) : (
              <p className="note">All 20 founding places are taken.</p>
            )}
            {wizardLive ? (
              <>
                {/* prefetch={false} is load-bearing, not a tidy-up. /start is force-dynamic, so
                    next/link prefetching it when this button scrolls into view runs a real
                    server render AND a real funnel_events insert for somebody who never
                    clicked: 1030 rows in the 48 hours to 27 Aug 2026, against 2 scans. The bad
                    data was the smaller half of it. */}
                <Link className="button" href="/start" prefetch={false}>
                  Set up my report
                </Link>
                <p className="note" style={{ marginTop: 14 }}>
                  Three minutes: confirm your business, approve your five questions, then pay. Nothing is
                  charged until you have seen the questions and said yes to them.
                </p>
              </>
            ) : (
              <>
                <WaitlistForm
                  source="pricing"
                  cta="Email me when a place opens"
                  buyHref="/#scan"
                  buyLabel="Run a free scan while you wait"
                />
                <p className="note" style={{ marginTop: 14 }}>
                  Subscriptions open shortly. Leave your address and you will hear the day they do.
                </p>
              </>
            )}
          </div>
        </section>

        {/* ============ 9. THE OBVIOUS QUESTIONS ============ */}
        <section>
          <div className="eyebrow">The obvious questions</div>
          <h2>Ask the awkward ones first</h2>

          <details className="faq">
            <summary>Shouldn't I be tracking this daily?</summary>
            <div className="body">
              <p>
                Plenty of tools will sell you that, and if you want a live chart you should buy one.
              </p>
              <p>
                We think it's the wrong instrument for the job. The daily number moves mostly on its
                own, the category leaders barely move at all, and AI is currently about one percent of
                the traffic to a typical site. Watching it hourly is a lot of attention spent on a small
                and noisy signal.
              </p>
              <p>
                Once a month, read properly, with the actual answers attached and three things to do, is
                a better use of your time. If that turns out to be wrong we'll say so.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>Can't I just do this myself in ChatGPT?</summary>
            <div className="body">
              <p>
                You can, and honestly you should. Go and ask it the question your best customer would ask, right now.
                Takes ten minutes and it's usually enough to ruin your afternoon. What takes longer is running it across
                five platforms, scoring it the same way every month, working out who's beating you and why, and knowing
                what to do about it.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>How do you know your five questions are the right five?</summary>
            <div className="body">
              <p>We don't, until you say so. You approve them before anything runs.</p>
            </div>
          </details>

          <details className="faq">
            <summary>Does it work outside Australia?</summary>
            <div className="body">
              <p>
                Yes. We set the market when you sign up, because the answers genuinely differ by country. Most of our
                questions are written for a specific market on purpose. If your buyers are in one town rather than one
                country, say so and your five questions name the town. Three of the five platforms will also be
                searched from there, and your report says which.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>What if the news is good?</summary>
            <div className="body">
              <p>
                Then we'll tell you that. We're not in the business of manufacturing a problem. Plenty of businesses
                come up well on one question and vanish on the next, which is its own useful thing to know.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>Why those five, and why aren't Claude and Copilot in the monthly?</summary>
            <div className="body">
              <p>
                Because we won't estimate an answer and call it a reading. ChatGPT, Gemini, Grok, Perplexity and
                Google's AI answers can all be asked directly and captured word for word, the same way, every month.
                Claude and Copilot can't, not without swapping in a different system and hoping you don't check. So we
                ask those two by hand, once a quarter, and we tell you that's what we did. Five measured identically
                every month. Seven once a quarter, two of them read by a person.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>Isn't Copilot just ChatGPT with a different logo?</summary>
            <div className="body">
              <p>
                Nearly, and it makes no difference. Copilot runs mostly on OpenAI's models, sometimes Anthropic's,
                sometimes Microsoft's own. It still answers differently to ChatGPT, because it searches a different
                index and it's been given different instructions. Same engine, different car. That's the whole reason we
                measure the places people actually ask, not the models underneath them.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>Who's behind it?</summary>
            <div className="body">
              <p>
                Word of Model was built by a marketer with thirty years in digital and creative, who went looking for
                what the models were saying about a handful of real businesses and found one of them inventing customer
                reviews that had never existed. That was enough to keep going.
              </p>
            </div>
          </details>

          <details className="faq">
            <summary>Do I need to be technical?</summary>
            <div className="body">
              <p>No. If you can describe what you sell, you can use this.</p>
            </div>
          </details>
        </section>

        {/* ============ 10. CLOSE ============ */}
        <section className="close">
          <div className="eyebrow">One last thing</div>
          <h2>One question. Two engines. About two minutes.</h2>
          <p>Worst case, you find out you're doing fine.</p>
          <a className="button" href="#scan">
            Enter your website
          </a>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Word of Model&trade; · wordofmodel.ai</span>
          <span>
            <strong>Recommendation Share</strong> is how many of them put you forward. <strong>Word of Model</strong> is
            what they actually said.
          </span>
          <span className="footer-links">
            <Link href="/method">How we measure</Link> &middot; <Link href="/privacy">Privacy</Link>{' '}
            &middot; <Link href="/terms">Terms</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
