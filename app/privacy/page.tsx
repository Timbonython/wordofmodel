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
 * Every claim on this page is checkable against the build. No analytics is true because there
 * is no analytics package in the dependencies. IP addresses are hashed with a salt before
 * storage because that is what lib/ratelimit.ts does. The sub-processor list is the set of
 * services the code actually calls.
 *
 * THE PIXEL SHIPPED IN THE SAME COMMIT AS THIS WORDING, 23 Aug 2026, which is the whole point
 * of having dated the old claim. The page said there were no advertising trackers, promised
 * that adding one would be disclosed here before it started, and named the UK and the EEA as
 * needing consent first. Rather than build a consent banner we do not serve the pixel to those
 * visitors at all - stricter, cheaper, and impossible to get subtly wrong. See lib/meta.ts,
 * where the country list lives, and app/layout.tsx, where the decision is made server side so
 * nothing in a browser can default it to true.
 *
 * If any of this changes, this page changes in the same commit. That is not a style rule: a
 * privacy policy that drifts from the code is a statement somebody relied on.
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
              <strong>No analytics.</strong> No Google Analytics, no session recording, no
              heatmaps, nothing watching how you move around the page.
            </li>
            <li>We do not sell your information, and we do not share it for anyone else&apos;s marketing.</li>
            <li>
              We do not put your customers&apos; personal information into AI assistants. The
              questions we ask are about your market and your category.
            </li>
            <li>
              We do not put any tracker on the report pages. Those are what you pay for, and
              there is no reason for an advertising company to see them.
            </li>
          </ul>
        </section>

        <section>
          <h2>Advertising, and exactly what changed</h2>
          <p>
            <strong>On {LAST_UPDATED} we added a Meta advertising pixel to the marketing pages.</strong>{' '}
            Until then this page said there was no such thing here, and we said that if it ever
            changed we would say so before it started rather than after. This is that.
          </p>
          <p>
            <strong>Not if you are in the UK or the EEA.</strong> The pixel is not served to
            visitors from the United Kingdom, the European Economic Area or Switzerland at all.
            Not disabled, not consent-gated: the script is never in the page. That is stricter
            than asking, it cannot be got subtly wrong, and our advertising is aimed at the
            United States anyway.
          </p>
          <p>
            What it does elsewhere: reports that a scan finished, that somebody reached the setup
            page, and that a checkout started. When a subscription is paid we send Meta a
            confirmation from our server, including your email address hashed so that it cannot
            be read back into an address. We never send Meta the results of your scan or anything
            in your report.
          </p>
          <p>
            Alongside it we keep our own count, tied to the scan rather than to a cookie, so we
            can tell which advertising works without depending on Meta&apos;s figures. If you
            would rather not be counted at all, an ad blocker stops the pixel, and you can email
            us to have your scan and everything attached to it deleted.
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
