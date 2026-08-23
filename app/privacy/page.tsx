import type { Metadata } from 'next';
import Link from 'next/link';
import { ABN, ENTITY, CONTACT_EMAIL, LAST_UPDATED } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy - Word of Model',
  description: 'What Word of Model collects, why, who else sees it, and how to have it deleted.',
};

/**
 * The privacy policy, written from what the code actually does rather than from a template.
 *
 * Every claim on this page is checkable against the build. No analytics and no advertising
 * trackers is true because there is no analytics package in the dependencies and nothing in
 * the app sets a cookie except Supabase auth. IP addresses are hashed with a salt before
 * storage because that is what lib/ratelimit.ts does. The sub-processor list is the set of
 * services the code actually calls.
 *
 * THE TRACKING CLAIM IS DATED, AND THAT IS NOT HEDGING. The ad plan includes retargeting,
 * which needs a pixel, so the day somebody adds a Meta or LinkedIn tag this page becomes
 * false: not vague, false, in a way a subscriber could have relied on. Dating it makes the
 * pixel a deliberate edit here rather than a silent contradiction, and the "if we advertise"
 * section says in advance what that edit will look like.
 *
 * If any of this changes, this page changes in the same commit.
 */
export default function PrivacyPage() {
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model&trade;<span>.ai</span>
          </Link>
          <div className="issue">Privacy</div>
        </div>
      </header>

      <main className="wrap legal">
        <section>
          <div className="eyebrow">Privacy</div>
          <h1>What we collect, and what we do with it.</h1>
          <p className="lede">
            Word of Model measures how AI assistants answer questions about your company. Doing
            that needs your email address, what your business does, and the answers the
            assistants give. This page says exactly what is stored, who else sees it, and how to
            have it removed.
          </p>
          <p className="note">
            {ENTITY} ({ABN}) is responsible for the information described here. Last updated{' '}
            {LAST_UPDATED}.
          </p>
        </section>

        <section>
          <h2>What we collect</h2>

          <h3>If you run a free scan</h3>
          <p>
            The domain you enter, the business profile we generate from it and you confirm, the
            question we ask on your behalf, and the answers the AI assistants give. If you ask to
            see the full result we also store the email address you give us.
          </p>

          <h3>If you join the waitlist</h3>
          <p>Your email address, and the domain you scanned if you came from a scan.</p>

          <h3>If you subscribe</h3>
          <p>
            Your email address, the details you approve in the setup wizard, which are your brand
            name, what you sell, who your buyer is, your market, your website and your competitor
            set, the five questions you approve, and every answer each surface gives when we ask
            them. Reports are stored as records so that a report you read in March still says in
            December what it said in March.
          </p>

          <h3>Payment</h3>
          <p>
            Payments are handled by Stripe. We never see or store your card details. What we keep
            is your Stripe customer and subscription identifiers, your plan, its status and its
            renewal date.
          </p>

          <h3>Technical</h3>
          <p>
            We record a <strong>hashed</strong> version of your IP address to stop one visitor
            burning through the free scan, which costs us money per run. The address itself is
            never stored: it is hashed with a secret salt before it is written, and the hash
            cannot be reversed into an address.
          </p>
        </section>

        <section>
          <h2>What we do not do</h2>
          <ul className="plain">
            <li>
              <strong>As of {LAST_UPDATED}, no analytics and no advertising trackers.</strong> No
              Google Analytics, no Meta pixel, no LinkedIn tag, nothing that follows you off this
              site. The only cookie set here is the one that keeps you signed in after a magic
              link, and there is no password to store, so we do not store one.
            </li>
            <li>We do not sell your information, and we do not share it for anyone else&apos;s marketing.</li>
            <li>
              We do not put your customers&apos; personal information into AI assistants. The
              questions we ask are about your market and your category.
            </li>
          </ul>
        </section>

        <section>
          <h2>If we advertise</h2>
          <p>
            We may run ads to find customers. If that ever means adding an advertising tracker to
            this site, or sending a hashed version of your email address to an ad platform so it
            can tell whether its ad worked, we will say so on this page and date the change before
            it starts, not after. If you are in the United Kingdom or the European Economic Area
            you will be asked first, because that is what consent means there.
          </p>
          <p>
            Our preference, and the reason the list above currently reads the way it does, is to
            measure advertising by which link somebody arrived through rather than by following
            them around. That is less precise for us and considerably less invasive for you.
          </p>
        </section>

        <section>
          <h2>Who else sees it</h2>
          <p>
            Running the product means sending some of this to other companies. These are all of
            them:
          </p>
          <ul className="plain">
            <li>
              <strong>Vercel</strong> hosts the site. Requests run in the United States.
            </li>
            <li>
              <strong>Supabase</strong> hosts the database where everything above is stored.
            </li>
            <li>
              <strong>Stripe</strong> takes payments and holds your card details, which we never
              receive.
            </li>
            <li>
              <strong>Resend</strong> delivers your reports and receipts, so it processes your
              email address and the contents of those emails.
            </li>
            <li>
              <strong>OpenAI, Google, xAI, Perplexity and SerpApi</strong> are the AI surfaces we
              measure and the provider we read Google&apos;s AI Overviews through. They receive
              the questions we ask about your category and your brand. They do not receive your
              email address or your billing details.
            </li>
          </ul>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <p>
            Your reports and the answers behind them are kept while you are a subscriber and for
            twelve months after you cancel, so that a report you were sent stays checkable against
            the evidence it was built from. Free scans and waitlist entries are kept until you ask
            us to remove them. Ask us to delete any of it sooner and we will.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and ask for a copy of
            what we hold, a correction, or deletion. A person reads it and you will get an answer.
            Deleting your account removes your data and ends your subscription at the end of the
            period you have paid for.
          </p>
          <p>
            If you are in the United Kingdom or the European Economic Area you have rights of
            access, correction, erasure, restriction, portability and objection, and you can
            complain to your local data protection authority. In Australia you can complain to the
            Office of the Australian Information Commissioner. We would rather you told us first,
            because we can usually fix it the same day.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            The database is reachable only from our server, never from a browser, and row level
            security is on with no public read policies. Credentials live in environment
            variables, not in the code. This is a small operation run carefully; it is not a
            promise that nothing can ever go wrong, and if something does we will tell you rather
            than hope you do not notice.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this policy changes we will update this page and, for anything that affects what we
            collect or who sees it, email subscribers before it takes effect.
          </p>
          <p className="note">
            Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the{' '}
            <Link href="/terms">terms of service</Link>.
          </p>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Word of Model &middot; wordofmodel.ai</span>
          <span>
            <Link href="/terms">Terms</Link> &middot; <Link href="/">Home</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
