import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Questions - Word of Model',
  description:
    'The awkward questions first: daily tracking, doing it yourself in ChatGPT, why five ' +
    'questions, why Claude and Copilot are quarterly, and what happens if the news is good.',
  alternates: { canonical: '/faq' },
};

/**
 * The obvious questions.
 *
 * RECOVERED, NOT REWRITTEN. These nine were section 9 of the home page until the Gate 3 cut on
 * 28 Aug 2026, which reduced the home page to the six blocks §4 of the brand brief asks for.
 * The answers were good and the cut was still right - they are what somebody deciding reads,
 * not what somebody landing from an ad reads. Restored here word for word from 1f1c100 rather
 * than written again, because rewriting them would have lost the awkward ones.
 *
 * A PAGE RATHER THAN A FOOTER. Nine questions with real answers is not footer furniture; in a
 * footer they would be unreadable and would load on every page on the site.
 */
export default function FaqPage() {
  return (
    <>
      <Nav issue="FAQs" />

      <main className="wrap">
        <section className="hero faq-hero">
          <div className="eyebrow">The obvious questions</div>
          <h1>Ask the awkward ones first</h1>
          <p className="lede">
            The questions worth asking before you buy anything, answered without the part where
            we pretend the objections are unreasonable.
          </p>
        </section>

        <section>
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
              Once a month, read properly, with the actual answers attached and three ranked actions, is
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

        <section className="faq-end">
          <p>
            Anything not here, reply to any email or write to{' '}
            <a href="mailto:hello@wordofmodel.ai">hello@wordofmodel.ai</a>. If it is about how the
            measurement works,{' '}
            <Link href="/method" prefetch={false}>
              the method page
            </Link>{' '}
            is longer and more honest than this one.
          </p>
        </section>
      </main>

      <SiteFooter sampleLive />
    </>
  );
}
