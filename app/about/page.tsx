import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { FOUNDING_SEATS_PUBLIC } from '@/lib/scope';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About - Word of Model',
  description:
    'Why Word of Model exists: a marketer went looking for what AI assistants were saying ' +
    'about real businesses, and found one of them inventing customer reviews that had never ' +
    'existed.',
  alternates: { canonical: '/about' },
};

/**
 * About.
 *
 * NO NAME, NO PHOTO, NO PROFILE LINK. Decided 29 Aug 2026: the reviewer is described as an
 * experienced marketer based in Australia rather than as a named individual, and an about page
 * built around a person would undo that on the one page most likely to be read by somebody
 * checking whether this is a real company.
 *
 * So it is about the product rather than the founder, and the origin story carries it. That
 * story was the strongest thing on the site and was buried inside a collapsed FAQ where almost
 * nobody would open it.
 *
 * WHAT IT REFUSES TO SAY is doing as much work as what it says. No team page, no "we're a
 * passionate group", no invented headcount - the same standard the report holds itself to, on
 * the page where it would be easiest to drop.
 */
export default function AboutPage() {
  return (
    <>
      <SiteNav sampleLive issue="About" />

      <main className="wrap">
        <section className="hero about-hero">
          <div className="eyebrow">About</div>
          <h1>It started with a review that never happened</h1>
        </section>

        <section className="about-body">
          <p className="lede">
            Word of Model was built by a marketer with thirty years in digital and creative, who
            went looking for what the models were saying about a handful of real businesses.
          </p>
          <p className="lede">
            One of them was being described with customer reviews that had never existed. Not
            exaggerated. Invented, in confident prose, to anyone who asked. The business had no
            idea, and no way of finding out.
          </p>
          <p>That was enough to keep going.</p>

          <h2 className="about-head">What this is</h2>
          <p>
            Every month we ask five questions across five AI surfaces and record the answers word
            for word. You approve the questions before anything runs. You get the answers
            themselves, who was named, who was recommended, where the assistants got it from, and
            three things to do about it.
          </p>
          <p>
            Once a quarter an experienced marketer based in Australia reads it by hand, and adds
            Claude and Microsoft Copilot - the two surfaces no API can honestly reach.
          </p>

          <h2 className="about-head">What this is not</h2>
          <p>
            There is no score out of 100. There is no daily chart. We do not run an API and file
            the answer under an assistant&rsquo;s name, which is why two of the seven surfaces are
            read by hand and why they are quarterly rather than monthly.
          </p>
          <p>
            The measurement is the product, so the method page says what it has{' '}
            <em>not</em> measured as plainly as what it has.{' '}
            <Link href="/method" prefetch={false}>
              Read it before you buy anything
            </Link>
            .
          </p>

          <h2 className="about-head">Where it is</h2>
          <p>
            Australian, run from Australia, billing in US dollars because that is what the
            software the market is compared against bills in. The founding cohort is{' '}
            {FOUNDING_SEATS_PUBLIC} businesses, capped because the quarterly read is done by hand
            and that is the most we can do properly.
          </p>

          <h2 className="about-head">Talk to us</h2>
          <p>
            <a href="mailto:hello@wordofmodel.ai">hello@wordofmodel.ai</a>. A person reads it, and
            replies to reports go to the same place.
          </p>
        </section>
      </main>

      <SiteFooter sampleLive />
    </>
  );
}
