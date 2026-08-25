import type { Metadata } from 'next';
import Link from 'next/link';
import { MONTHLY_SURFACES, QUARTERLY_SURFACES, SURFACES } from '@/lib/scope';
import { SAMPLES } from '@/lib/engines';

export const metadata: Metadata = {
  title: 'How we measure - Word of Model',
  description:
    'Every number in a Word of Model report, where it comes from, and how far these systems drift on their own. Including the parts that are inconvenient for us.',
};

/**
 * The method page, from wordofmodel-method-page-copy.md.
 *
 * TWO KINDS OF NUMBER, VISIBLY SEPARATED, AND THAT IS THE ONE CHANGE TO THE BRIEFED COPY.
 * The draft promises "every number on this page is real and measured" and closes with "you
 * can check every one of these claims against your own report". That is true of the drift
 * table, which we measured, and false of the Semrush, Conductor and Zatuchin figures, which
 * other people measured and which a reader cannot check against anything of theirs. Same
 * numbers, not softened - the positioning doc is right that they do the work - but the ones
 * we measured say so and the ones we cite name their source.
 *
 * THE NO-ARROW RULE IS NOW MEASURED ON THE METRIC IT DEFENDS. The briefed draft justified it
 * with the naming drift, which was measurement A standing in for metric B: the table measures
 * NAMING on UNBRANDED questions and the headline is RECOMMENDING on the BRANDED one. That gap
 * was published as a gap on 24 Aug and closed on 25 Aug by measuring it - ten readings of the
 * branded question on all five surfaces. One surface in five changes its verdict on its own.
 * The claim on this page is now the right measurement rather than a nearby one.
 *
 * The extractor was measured separately and is not the source of it: fifteen re-reads of
 * identical text, no disagreement. Worth publishing, because "the drift is theirs, not ours"
 * is only credible from somebody who checked.
 *
 * CLAUDE AND COPILOT ARE QUARTERLY HERE BECAUSE THEY ARE QUARTERLY IN THE CODE. The Session 6
 * decision - hand captures in the first report for every new subscriber, then quarterly - is
 * decided and not built: lib/scope.ts still carries cadence 'quarterly' and there is no
 * first-report branch anywhere. Copy does not ship ahead of code. When it is built, this page
 * changes in the same commit.
 *
 * The surface counts and sampling depths are read from the constants the runner uses, so this
 * page cannot claim a cadence the pipeline does not run.
 */

const CAPTURES_PER_REPORT =
  5 * MONTHLY_SURFACES.reduce((n, s) => n + SAMPLES[s], 0);
const SAMPLED = MONTHLY_SURFACES.filter((s) => SAMPLES[s] > 1).map((s) => SURFACES[s].label);
const ONCE = MONTHLY_SURFACES.filter((s) => SAMPLES[s] === 1).map((s) => SURFACES[s].label);
const HAND = QUARTERLY_SURFACES.filter((s) => SURFACES[s].cadence === 'quarterly').map(
  (s) => SURFACES[s].label,
);

/** "A, B and C". */
function list(names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function MethodPage() {
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model&trade;<span>.ai</span>
          </Link>
          <div className="issue">How we measure</div>
        </div>
      </header>

      <main className="wrap legal">
        <section>
          <div className="eyebrow">Method</div>
          <h1>How we measure.</h1>
          <p className="lede">
            Most tools in this category won&apos;t tell you how often they ask, or how far a
            result drifts on its own. A couple of the big enterprise ones do, and do it well.
            Almost nobody at this price does.
          </p>
          <p>We think it&apos;s the most important thing about a number, so here&apos;s ours in full.</p>
        </section>

        <section>
          <h2>What we ask</h2>
          <p>
            Five questions. The ones your buyers would actually type at the moment they&apos;re
            choosing someone, not brand searches.
          </p>
          <p>
            You approve them before anything runs. If you read the five and think nobody would
            ever ask that, we go again. The whole exercise is worthless if you don&apos;t believe
            the questions.
          </p>
          <p>
            The questions are written for a specific market, because the answers genuinely differ
            by country. You set the market when you sign up, and you can go narrower than a
            country if your buyers are local.
          </p>
        </section>

        <section>
          <h2>Where we ask</h2>
          <p>Five surfaces, automatically, every month, in the same way every time.</p>
          <p>
            <strong>{list(MONTHLY_SURFACES.map((s) => SURFACES[s].label))}.</strong>
          </p>
          <p>
            And two more by hand, once a quarter: <strong>{list(HAND)}</strong>.
          </p>
          <p>
            Those two are separated for a reason. They can&apos;t be asked automatically without
            swapping in a different system and calling it their answer. An API answer is not the
            answer a person gets when they open the app, and we won&apos;t print one and label it
            the other. So we ask those two ourselves, and we tell you that&apos;s what we did.
          </p>
        </section>

        <section>
          <h2>Where we ask from</h2>
          <p>
            If your buyers are in one town rather than one country, your five questions name the
            town, and every surface is asked about it in the words you approved.
          </p>
          <p>
            Three of the five also take a location directly, and are searched from your area:
            ChatGPT, Perplexity and Google&apos;s AI answers. Grok and Gemini accept no location
            parameter of any kind, from anybody, so for those two your area reaches the answer
            through the question and nothing else. Every report says which surfaces got which.
          </p>
          <p>
            We hold the network we ask from constant, in the same place, every month. It is the
            only geography Grok and Gemini have, and a network origin that wandered would move
            your number for a reason that has nothing to do with your market.
          </p>
        </section>

        <section>
          <h2>How many times we ask</h2>
          <p>
            <strong>{CAPTURES_PER_REPORT} captures per report.</strong>
          </p>
          <p>
            {list(SAMPLED)} get asked three times per question and the result is averaged.{' '}
            {list(ONCE)} get asked once.
          </p>
          <p>
            That difference isn&apos;t arbitrary. It follows what each one costs to ask, not how
            much it matters, and we would rather say that than imply the five are sampled evenly.
            The three we repeat are the three we can afford to repeat.
          </p>
        </section>

        <section>
          <h2>What we do with the answers</h2>
          <p>Two separate steps, and keeping them separate is the point.</p>
          <p>
            First we capture. The full answer, word for word, exactly as it came back, stored with
            the date, the market, and which system gave it.
          </p>
          <p>
            Then we read. Was your brand named at all. Was it recommended, or just listed. Which
            competitors were named. Which sites the answer drew from.
          </p>
          <p>
            We keep the raw answers because the reading is an opinion and the answer isn&apos;t.
            You get both, so you can disagree with us.
          </p>
        </section>

        <section>
          <h2>The number on the front page</h2>
          <p className="punch">
            Recommendation Share: how many of the five surfaces recommended you, out of five.
          </p>
          <p>
            Not how many mentioned you. Named and recommended are different things, and the gap
            between them is usually the story.
          </p>
          <p>
            Where a surface is asked three times, it counts as recommending you if most of those
            readings did, not if any one of them did. One reading in three saying yes is not a
            surface that recommends you, and counting it that way would round every borderline
            case in our favour.
          </p>
          <p>
            It&apos;s a status, not a trend. There&apos;s no arrow on it, ever, and we measured
            why. Read on.
          </p>
          <p>
            Underneath it we show presence, which is how often you were named at all across all
            the questions, and we state the gap between the two in plain words.
          </p>
        </section>

        <section>
          <h2>The bit nobody else publishes</h2>
          <p>
            Ask an AI the same question twice and you can get different companies. So before we
            reported that something changed for you, we needed to know how much these systems move
            on their own.
          </p>
          <p>
            So we measured it. Same question, same surface, same market, ten times back to back,
            with nothing changed in between. Real questions from a real subscriber&apos;s scope.
          </p>
          <div className="table-scroll">
            <table className="drift">
              <thead>
                <tr>
                  <th />
                  <th>asked</th>
                  <th>brand named</th>
                  <th>competitor list unchanged</th>
                  <th>cited sites unchanged</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Gemini</td>
                  <td>10 of 10</td>
                  <td>
                    <strong>4 of 10</strong>
                  </td>
                  <td>87%</td>
                  <td>19%</td>
                </tr>
                <tr>
                  <td>Perplexity</td>
                  <td>10 of 10</td>
                  <td>0 of 10</td>
                  <td>56%</td>
                  <td>29%</td>
                </tr>
                <tr>
                  <td>ChatGPT</td>
                  <td>10 of 10</td>
                  <td>0 of 10</td>
                  <td>63%</td>
                  <td>32%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">Measured by us, 23 August 2026. Naming, on questions that don&apos;t mention you.</p>
          <p>
            A brand sitting well outside the answer reports stably. Twice at zero out of ten. But
            a brand sitting near the edge of being mentioned is a coin flip, named four times out
            of ten with nothing whatsoever happening in the market.
          </p>
          <p>
            The edge is exactly where a business making progress lives. Which means the instrument
            is least reliable precisely where it matters most to you.
          </p>
          <p>
            And the competitor list moves even when your own mention doesn&apos;t. Between a third
            and nearly half of the named companies change between identical runs.
          </p>
        </section>

        <section>
          <h2>And the same test on the number at the top</h2>
          <p>
            The table above counts whether a brand was <em>named</em>. The number on the front
            page is whether a surface <em>recommends</em> you when somebody asks about you
            directly. Those are different questions, so we ran the same test on the second one.
            Ten readings, each surface, asked about a real brand by name, nothing altered in
            between.
          </p>
          <div className="table-scroll">
            <table className="drift">
              <thead>
                <tr>
                  <th />
                  <th>answered</th>
                  <th>named you</th>
                  <th>recommended you</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ChatGPT</td>
                  <td>9 of 10</td>
                  <td>9 of 9</td>
                  <td>0 of 9</td>
                </tr>
                <tr>
                  <td>Gemini</td>
                  <td>10 of 10</td>
                  <td>10 of 10</td>
                  <td>
                    <strong>8 of 10</strong>
                  </td>
                </tr>
                <tr>
                  <td>Grok</td>
                  <td>10 of 10</td>
                  <td>10 of 10</td>
                  <td>0 of 10</td>
                </tr>
                <tr>
                  <td>Perplexity</td>
                  <td>10 of 10</td>
                  <td>10 of 10</td>
                  <td>0 of 10</td>
                </tr>
                <tr>
                  <td>Google AI Overviews</td>
                  <td>10 of 10</td>
                  <td>10 of 10</td>
                  <td>0 of 10</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">Measured by us, 25 August 2026. Recommending, on the question that names you.</p>
          <p>
            <strong>One surface in five changes its verdict on its own.</strong> That is a fifth
            of the number on your front page moving with nothing happening in your market, which
            is why it never carries an arrow. Four of the five said the same thing ten times out
            of ten.
          </p>
          <p>
            It is the same shape as the naming result. A brand sitting firmly outside the
            recommendation gets a stable no. The one surface near the boundary is the coin flip.
            Which means a business whose score is 1 out of 5 may be resting that whole 1 on the
            least reliable reading in the set, and nothing on the face of the number says so. So
            we say it: where a surface didn&apos;t give the same verdict every time, your report
            prints how the readings split.
          </p>
        </section>

        <section>
          <h2>How much of that drift is ours</h2>
          <p>
            What you read is the surface&apos;s answer plus our reading of it, and our reading is
            a language model too. A model set to be as repeatable as possible is not the same as
            one that is.
          </p>
          <p>
            So we checked. We took the first answer from each surface and read it three times
            over, unchanged. Fifteen readings of identical text, and not one disagreement.
          </p>
          <p>
            The drift in the table above is the surfaces. If it had been ours, that would be a
            defect for us to fix, not a floor for you to work around, and we would have said
            that instead.
          </p>
        </section>

        <section>
          <h2>What we still haven&apos;t measured</h2>
          <p>
            Both tests were run on a national scope. If your buyers are in one town, the answer
            sets are thinner and may drift further, or less. Nobody has measured that, including
            us, so nothing on this page claims anything about it.
          </p>
          <p>
            It is one command and a few dollars, and it will be here when it is done, whichever
            way it comes out.
          </p>
        </section>

        <section>
          <h2>What we do about it</h2>
          <p className="punch">We don&apos;t report a change we can&apos;t distinguish from noise.</p>
          <p>
            We know how far a result drifts on its own, so anything smaller than that reports as
            steady. Not as an improvement, not as a decline. Steady. Some months your report will
            say nothing moved further than we can measure, and that will be the honest answer.
          </p>
          <p>
            If we ever change how a number is calculated, we say so and we stop comparing across
            the change rather than quietly carrying on. The month a definition changes is a break,
            and breaks get declared.
          </p>
        </section>

        <section>
          <h2>Why we don&apos;t check every day</h2>
          <p>
            Four findings, none of them ours, all from research the tool vendors published
            themselves.
          </p>
          <ul className="cited">
            <li>
              <strong>Semrush</strong>, across 1,094 categories and 600,000 citations: the brand
              that owned a topic held the number one spot in <strong>90.4%</strong> of
              month-over-month comparisons. The leaders are stable.
            </li>
            <li>
              <strong>Zatuchin</strong> (arXiv:2607.13304), across 12,933 responses: brand identity
              accounts for <strong>1.5%</strong> of the variance in a single answer. The language
              you ask in accounts for <strong>26.5%</strong>. Most daily movement is a phrasing
              artefact.
            </li>
            <li>
              <strong>Conductor</strong>, across 13,770 domains and 3.3 billion sessions: AI
              referral traffic is <strong>1.08%</strong> of website traffic.{' '}
              <strong>BrightEdge</strong> independently puts it under 1%.
            </li>
            <li>
              <strong>Evertune</strong>: a single prompt asked once carries{' '}
              <strong>plus or minus 44 points</strong> of error. Which cuts both ways. It is why a
              daily number is noise, and it is why nobody should sell a precise one.
            </li>
          </ul>
          <p className="note">
            Those four are other people&apos;s measurements and we have named them so you can go
            and read them. Everything else on this page is ours, and you can check it against your
            own report.
          </p>
          <p>
            A source that keeps appearing across {CAPTURES_PER_REPORT} captures is real. A
            competitor named again and again is real. What the answer actually said is not a
            statistic at all, it is evidence. None of those need the sample size a percentage
            needs, which is why the report leads with what was learned rather than with what moved.
          </p>
        </section>

        <section>
          <h2>What we don&apos;t claim</h2>
          <p>
            We don&apos;t claim a person reads every answer every month. Five surfaces are captured
            and read by the system. Claude and Copilot are read by a person, quarterly.
            That&apos;s the whole of it.
          </p>
          <p>
            We don&apos;t claim to measure surfaces we don&apos;t measure. The report names which
            ones it covers, every time.
          </p>
          <p>
            We don&apos;t claim precision we haven&apos;t got. The table above is on this page
            permanently, including the parts of it that are inconvenient for us, and so is the
            section saying what we have not measured yet.
          </p>
        </section>

        <section>
          <h2>Why we bother publishing this</h2>
          <p>
            Because the alternative is asking you to trust a number with no working shown, and at
            this price point that&apos;s the norm.
          </p>
          <p>
            You can check every one of our own claims against your own report. That&apos;s the
            point.
          </p>
          <p>
            <Link className="button" href="/#scan">
              Run the free scan
            </Link>
          </p>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Word of Model &middot; wordofmodel.ai</span>
          <span>
            <Link href="/privacy">Privacy</Link> &middot; <Link href="/terms">Terms</Link> &middot;{' '}
            <Link href="/">Home</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
