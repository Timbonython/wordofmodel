import Link from 'next/link';
import { ScanPanel } from '@/components/scan/ScanPanel';
import { WaitlistForm } from '@/components/WaitlistForm';
import { foundingOfferOrNull } from '@/lib/billing';
import { FOUNDING_SEATS_PUBLIC, TIERS, priceLabel } from '@/lib/scope';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { isClick, recordFunnel, touchFrom } from '@/lib/funnel';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

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
 * NO LONGER THE DEFENCE, and kept deliberately for one narrow case.
 *
 * The click-id gate below already excludes every crawler that fetches an ad URL, because a
 * crawler inherits the utm parameters and cannot mint a click id. This check survives for the
 * case the gate cannot see: somebody clicks an ad, copies the URL from their address bar with
 * the fbclid still on it, and posts it to Facebook. Meta then fetches that URL carrying a real
 * click id. The unique index in 0020 bounds the damage to one row, but the row would carry a
 * crawler's user-agent and one real click would be attributed to the wrong moment.
 *
 * DO NOT ADD NAMES TO THIS LIST. That was the 0019 design and it failed - it knew three strings,
 * shipped correctly, worked, and every other crawler walked past it. The gate is the protection.
 *
 * Matched loosely and case-insensitively because Meta runs several and renames them:
 * facebookexternalhit is the long-standing one, meta-externalagent and facebookcatalog are the
 * others seen in the wild.
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
  const founding = await foundingOfferOrNull();
  const wizardLive = env.wizardLive;
  // /sample always renders: a consenting customer's real report when SAMPLE_RUN_ID names one,
  // and the labelled specimen otherwise. The prop stays because the link must follow the page,
  // not the other way round - if /sample is ever taken down, this is the one line to flip.
  const sampleLive = true;

  // ---- the top of the funnel: one row per ad click ----
  //
  // A CLICK ID IS THE ONLY THING THAT COUNTS HERE, and that is the correction made on
  // 28 Aug 2026. utm parameters are baked into the ad URL and are inherited by anything that
  // fetches it, crawlers included; only a click id is minted at click time. Gating on utm - the
  // 0019 design - counted 41 crawler fetches as people in a single day against 28 real clicks.
  //
  // Organic and direct landings are still invisible here, unchanged and still by design. What
  // changed is that automated fetches of the ad URL are invisible too, which they should always
  // have been. See 0020, and CLAUDE.md for when this trade stops being the right one.
  const touch = touchFrom(await searchParams);
  const userAgent = (await headers()).get('user-agent');
  if (isClick(touch) && !isMetaCrawler(userAgent)) {
    // One row per click id, enforced by the unique index in 0020 rather than here: a reload,
    // a back-navigation and a second render all conflict and are swallowed as the ordinary case.
    await recordFunnel({ event: 'landed', touch, userAgent });
  }
  return (
    <>
      <SiteNav scanIsHere sampleLive={sampleLive} issue="RECOMMENDATION SHARE  ·  WHAT AI SAYS ABOUT YOU" />

      <main className="wrap">
        {/* ============ 1. HERO ============
            §4 of the brand brief, and the order is the point: eyebrow, headline, one lede,
            THEN the field, THEN the reassurance.

            THE ACCEPTANCE TEST IS AN OBSERVATION, NOT AN OPINION: the input, its button and
            the strip beneath it must all be inside the first viewport on a 390px phone.
            Measured before this change, the button was cut off at y=827 against an 844px fold
            and the panel ran to 931. Anything added above the field is spending that budget.

            The line that used to sit ABOVE the field - "Find out in about two minutes. Free."
            - now sits below it as the strip. It was costing 95px of fold to say what the strip
            says better, in the place the brief puts it. */}
        <section className="hero">
          {/* THE THESIS, not an eyebrow. It was styled as one - 11px mono, grey, uppercase -
              which is the treatment this site gives a section label, and this is the sentence
              the whole positioning rests on. It also had a widow: `.hero .eyebrow` capped at
              620px put "now" alone on its own line on every desktop width, 1280 through 1470.
              The break is now deliberate rather than whatever 620px happened to produce.

              ONE WORD CARRIES THE ACCENT. §2: green is a scalpel, one accent per view. The
              first viewport already has the lit cell in the mark and the Free scan button, so
              a whole green panel would be the third and largest green and would outrank the
              CTA. Reversed on ink with `machine` lit is the mark's own construction at
              paragraph scale: a neutral ground with exactly one thing on. */}
          <p className="thesis">
            Word of mouth still decides who gets bought.<span className="thesis-break" />
            The mouth is just a <span className="thesis-lit">machine</span> now.
          </p>
          {/* Its own class because the mobile size is a FOLD decision, not a headline
              decision. 27px is what the scan field costs on a 628px phone, and /pricing,
              /method, /terms and /privacy have no field to protect and no reason to pay it. */}
          <h1 className="hero-headline">
            Your buyers stopped Googling.
            <br />
            They started asking.
            <br />
            ChatGPT.
          </h1>
          <p className="lede">
            And when they ask - ChatGPT, Gemini, Grok, Perplexity or Google's own AI answers - something answers on
            your behalf. Nobody told you whether you were in that list.
          </p>

          <div id="scan">
            <ScanPanel wizardLive={wizardLive} />
          </div>
        </section>

        {/* ============ 2. WHAT COMES BACK ============
            §4: three items, concrete, no icons. The old page had seven "gets" plus four more
            sections explaining them; this is the same promise at the length somebody standing
            at a bus stop will actually read. The detail moved to /method, which is a better
            page than any of it and was reachable only by accident until this deploy. */}
        <section>
          <div className="eyebrow">What comes back</div>
          <h2>Three things, every month</h2>
          <div className="gets">
            <div className="get">
              <h3>The actual answer, word for word</h3>
              <p>
                Not a summary and not a score standing in for the truth. The text the assistant produced, so you can
                read it yourself and argue with it if you want to.
              </p>
            </div>
            <div className="get">
              <h3>Who got named, and who got recommended</h3>
              <p>
                Two different columns, and most people find the second harder to read than the first. Being named and
                being put forward are not the same thing, and the gap between them is usually the story.
              </p>
            </div>
            <div className="get">
              <h3>Three things to do about it</h3>
              <p>Ranked, in order, with why that one is first. Not eight. Not a backlog.</p>
            </div>
          </div>
        </section>

        {/* ============ 3. WHAT AN ANSWER LOOKS LIKE ============
            §4: the redacted-answer device from the rival creative, rendered as a real page
            element. It is the most persuasive thing in the whole campaign and it existed only
            inside an ad. Static and illustrative on purpose - a real ranked answer belongs on
            /sample, where it is a real report on a real business rather than a mock. */}
        <section>
          <div className="eyebrow">What an answer looks like</div>
          <h2>Somebody asked. This came back.</h2>
          <p className="redacted-q">&ldquo;Who are the best [your category] in [your city]?&rdquo;</p>
          <ol className="redacted">
            <li>
              <span className="redacted-bar" aria-label="a competitor, redacted" />
              <span className="redacted-tag">Recommended</span>
            </li>
            <li>
              <span className="redacted-bar" aria-label="a competitor, redacted" />
            </li>
            <li>
              <span className="redacted-bar" aria-label="a competitor, redacted" />
            </li>
          </ol>
          <p className="redacted-verdict">You were not in this answer.</p>
        </section>

        {/* ============ 4. WHAT WE DON'T CLAIM ============
            §4: three lines, then /method. The differentiator against every competitor in the
            category, who all sell a score out of 100. */}
        <section>
          <div className="eyebrow">What we don&rsquo;t claim</div>
          <h2>Three things this is not</h2>
          <ul className="nots">
            <li>
              We do not give you a score out of 100. There is no such number, and inventing one would make this
              easier to sell and impossible to trust.
            </li>
            <li>
              We do not check every day. These answers move on their own, and reading noise as movement is how you end
              up chasing it.
            </li>
            <li>
              We do not run an API and file the answer under an assistant&rsquo;s name. A surface is only ever recorded
              from itself, which is why two of the seven are read by hand.
            </li>
          </ul>
          <p>
            <Link href="/method" prefetch={false}>
              How we measure, including what we have not measured
            </Link>
          </p>
        </section>

        {/* ============ 5. PRICING STRIP ============
            §4: the tiers as one line each, link to the pricing page.

            ONE TIER, NOT TWO, AND THAT IS DELIBERATE. §5 of the brief and §1 of the pricing
            plan describe a two-tier ladder - Monitoring at US$69 and Monitoring + Review at
            US$249 - but the US$69 tier does not exist in lib/scope.ts, in lib/stripe.ts or in
            Stripe. Printing a price the checkout cannot honour is the same defect as an ad
            promising a minute against a product that takes three. The second line goes in at
            Gate 4, with the Stripe objects behind it. */}
        <section id="pricing">
          <div className="eyebrow">Pricing</div>
          {/* One tier names its price in the heading; more than one and the heading cannot,
              so the list carries them. TIERS[0] is indexed defensively because an empty
              catalogue should render a heading rather than throw on the home page. */}
          <h2>{TIERS.length === 1 && TIERS[0] ? `${priceLabel(TIERS[0].key)} a month` : 'What it costs'}</h2>
          {/* DERIVED FROM lib/scope.ts, NOT WRITTEN OUT. One tier renders one line today and
              two render two after Gate 4, with no edit here. Same rule as the brand tokens:
              read the source, never retype it. */}
          <ul className="tiers">
            {TIERS.map((tier) => (
              <li key={tier.key}>
                <span className="tier-name">{tier.name}</span>
                <span className="tier-price">{priceLabel(tier.key)} a month</span>
                <span className="tier-line">{tier.line}</span>
              </li>
            ))}
          </ul>
          <div className="price">
            {/* FAIL-CLOSED. Null means the count could not be read, or the offer has closed,
                or the places are gone - and in every one of those cases NOTHING renders here
                and the reader sees the standard premium price above.

                Never a block without a number, and never "20 remaining" as a fallback: a
                failed count cannot tell you whether the offer is open, so it cannot be
                offered. foundingOfferOrNull() alerts when the cause was a failure rather than
                a genuine zero - a silently withheld offer on a normal-looking page is the
                version of this that runs for a week. §5 of the brand brief, §3 of the Stripe
                plan. */}
            {founding !== null && (
              <p>
                <span className="founding">
                  Founding rate: {priceLabel('premium_founding_monthly')} a month.
                </span>{' '}
                {founding.remaining === FOUNDING_SEATS_PUBLIC
                  ? `All ${FOUNDING_SEATS_PUBLIC} founding places are open`
                  : founding.remaining === 1
                    ? 'One founding place left'
                    : `${founding.remaining} founding places left`}
                , held at that price for as long as you stay. Capped because each one includes
                time with Tim, and 20 is what he can do.
              </p>
            )}
            {wizardLive ? (
              <>
                {/* prefetch={false} is load-bearing, not a tidy-up. /start is force-dynamic, so
                    next/link prefetching it when this button scrolls into view runs a real
                    server render AND a real funnel_events insert for somebody who never
                    clicked: 1030 rows in the 48 hours to 27 Aug 2026, against 2 scans. */}
                <Link className="button" href="/start" prefetch={false}>
                  Set up my report
                </Link>
              </>
            ) : (
              <WaitlistForm
                source="pricing"
                cta="Email me when a place opens"
                buyHref="/#scan"
                buyLabel="Run a free scan while you wait"
              />
            )}
          </div>
        </section>

      </main>

      <SiteFooter sampleLive={sampleLive} />

    </>
  );
}
