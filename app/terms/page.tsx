import type { Metadata } from 'next';
import Link from 'next/link';
import { ABN, CONTACT_EMAIL, ENTITY, JURISDICTION, LAST_UPDATED } from '@/lib/legal';
import { FOUNDING_SEATS_PUBLIC as FOUNDING_SEATS, PRICE_USD } from '@/lib/scope';

export const metadata: Metadata = {
  title: 'Terms - Word of Model',
  description: 'What Word of Model promises, what it does not, and how to cancel.',
};

/**
 * The terms, and the same rule as the privacy page: everything here is what the code does.
 *
 * The three that matter and are easy to soften into a lie: a run that loses a capture is
 * held rather than shipped, cancellation takes effect at period end with no proration, and
 * the founding rate is counted over distinct businesses rather than subscriptions. All
 * three are enforced in code - lib/deliver.ts, the portal configuration in
 * scripts/stripe-setup.mjs, and foundingState() in lib/billing.ts - and saying anything
 * else here would be a promise the product does not keep.
 *
 * Australian Consumer Law guarantees cannot be excluded and this page does not try to.
 */
export default function TermsPage() {
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model<span>.ai</span>
          </Link>
          <div className="issue">Terms</div>
        </div>
      </header>

      <main className="wrap legal">
        <section>
          <div className="eyebrow">Terms of service</div>
          <h1>What we promise, and what we do not.</h1>
          <p className="lede">
            These are the terms you agree to when you subscribe to Word of Model. They are written
            to be read rather than to be survived.
          </p>
          <p className="note">
            An agreement between you and {ENTITY} ({ABN}). Last updated {LAST_UPDATED}.
          </p>
        </section>

        <section>
          <h2>What you get</h2>
          <p>
            Each month we ask five questions about your category on named AI surfaces, record
            every answer word for word, and send you a report: how often you are named, whether
            you are recommended, who else comes up, what each surface cited, and the answers
            themselves in full. The first report arrives within 24 hours of subscribing, and then
            on the same date each month.
          </p>
          <p>
            Four times a year we also read Claude and Microsoft Copilot by hand, because neither
            can be captured any other way without running a different system and calling it their
            answer.
          </p>
        </section>

        <section>
          <h2>What we do not promise</h2>
          <ul className="plain">
            <li>
              <strong>We measure. We do not move the number.</strong> Nothing here is a promise
              that you will be named more often, recommended more often, or ranked anywhere in
              particular.
            </li>
            <li>
              <strong>AI answers change.</strong> Ask the same question twice and the wording
              differs. We measure who gets named, which is the steadier part, and we say so in
              every report rather than presenting a figure as more precise than it is.
            </li>
            <li>
              <strong>We do not control the surfaces.</strong> If a provider changes its API,
              withdraws it, or starts answering differently, that changes what we can measure. We
              will tell you what changed rather than quietly reporting it as movement in your
              market.
            </li>
          </ul>
        </section>

        <section>
          <h2>An incomplete month is held, not sent</h2>
          <p>
            If a run does not capture every answer, the report is held and a person looks at it,
            because a figure computed over a smaller base would show a change that came from us
            rather than from your market. It may mean a report arrives late. We would rather be
            late than wrong, and this is a deliberate choice rather than an accident.
          </p>
        </section>

        <section>
          <h2>Price, billing and the founding rate</h2>
          <p>
            USD {PRICE_USD.standard_monthly} a month, billed monthly in advance, renewing automatically
            until you cancel. The first {FOUNDING_SEATS} subscribers pay a founding rate of USD{' '}
            {PRICE_USD.founding_monthly} a month, held for twelve months from when you subscribe.
          </p>
          <p>
            The {FOUNDING_SEATS} founding places are counted as {FOUNDING_SEATS} businesses, not{' '}
            {FOUNDING_SEATS} subscriptions: if you subscribe for a second market you keep the
            founding rate on it while places remain. A founding place is not returned if you
            cancel. The number of remaining places shown on the site is the real count.
          </p>
          <p>
            Prices are in US dollars and exclusive of any taxes that may apply where you are;
            where we are required to collect a tax it will be shown at checkout before you pay.
          </p>
        </section>

        <section>
          <h2>Cancelling</h2>
          <p>
            Cancel any time, in one click, from your account page. Cancellation takes effect at
            the end of the period you have already paid for: you keep receiving reports until
            then, and there is no pro rata refund for part of a month. Cancelling is deliberately
            no harder than subscribing was.
          </p>
          <p>
            If a card fails we let Stripe retry it over several days before anything stops. You
            keep receiving reports while that is happening.
          </p>
        </section>

        <section>
          <h2>Your data and your reports</h2>
          <p>
            Your business information and the reports we produce are yours. Share them inside your
            company freely, which is what they are built for. Quote them outside it as long as you
            do not alter the figures and you say where they came from.
          </p>
          <p>
            The method, the report format and the software are ours. What we will not do is use
            your data to make somebody else&apos;s report about you, or sell it to anyone. See the{' '}
            <Link href="/privacy">privacy policy</Link> for what is stored and for how long.
          </p>
        </section>

        <section>
          <h2>Using it fairly</h2>
          <p>
            Subscribe for businesses you are entitled to represent, do not resell the reports as a
            product of your own, and do not use the free scan in a loop to burn our API credit. If
            you do any of these we may end the subscription and refund the unused part.
          </p>
        </section>

        <section>
          <h2>Availability and liability</h2>
          <p>
            This is a small, carefully run operation, not a service with a guaranteed uptime
            figure. Where the law allows us to limit our liability, it is limited to what you have
            paid us in the twelve months before the problem.
          </p>
          <p>
            Nothing here excludes or limits the consumer guarantees you have under the Australian
            Consumer Law or any other rights that cannot legally be excluded. If those guarantees
            apply, they apply regardless of anything on this page.
          </p>
        </section>

        <section>
          <h2>Changes, and the law that applies</h2>
          <p>
            If these terms change we will email subscribers before the change takes effect. If you
            do not accept a change you can cancel, and the current period still runs out as paid.
          </p>
          <p>These terms are governed by the law of {JURISDICTION}.</p>
          <p className="note">
            Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. A person reads it.
          </p>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Word of Model &middot; wordofmodel.ai</span>
          <span>
            <Link href="/privacy">Privacy</Link> &middot; <Link href="/">Home</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
