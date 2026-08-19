import type { Metadata } from 'next';
import Link from 'next/link';
import { stripe, idOf } from '@/lib/stripe';
import { getSubscriptionByStripeId } from '@/lib/billing';
import { getScope } from '@/lib/onboarding';
import { formatReportDate, monthlySurfaceList, quarterlySurfaceList } from '@/lib/billing-mail';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "You're in - Word of Model",
  robots: { index: false, follow: false },
};

/**
 * Step 5. Where the wizard ends.
 *
 * The subscription row is written by the webhook, not here, and a webhook can
 * arrive after the redirect. So this page reads Stripe for the truth and treats
 * a missing row as "confirmed, still settling" rather than as a failure. Telling
 * somebody who has just paid that nothing happened is the worst version of this
 * screen.
 */
export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let paid = false;
  let brandName: string | null = null;
  let reportDate: string | null = null;
  let founding = false;

  if (sessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      paid = session.payment_status === 'paid' || session.status === 'complete';

      const scopeId = session.metadata?.scope_id ?? session.client_reference_id;
      if (scopeId) brandName = (await getScope(scopeId))?.brand_name ?? null;

      const subId = idOf(session.subscription as string | { id: string } | null);
      if (subId) {
        const row = await getSubscriptionByStripeId(subId);
        if (row) {
          reportDate = formatReportDate(row.current_period_end);
          founding = row.price_key === 'founding_monthly';
        }
      }
    } catch {
      // A bad or expired session id lands on the generic version below rather
      // than an error page.
    }
  }

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model<span>.ai</span>
          </Link>
          <div className="issue">Confirmed</div>
        </div>
      </header>

      <main className="wrap">
        <section className="wizard-step">
          <div className="eyebrow">You&apos;re in</div>
          <h2>
            {reportDate
              ? `You're in. First report lands ${reportDate}.`
              : "You're in. Your first report is scheduled."}
          </h2>
          <p className="lede">
            We&apos;ll run {brandName ? `${brandName}'s` : 'your'} five questions across{' '}
            {monthlySurfaceList()}, and you&apos;ll have the whole thing, numbers, competitors,
            verbatim answers, and three things to do,{' '}
            {reportDate ? `in your inbox on ${reportDate}` : 'in your inbox'}. Same date every month
            after that.
          </p>
          <p>
            Four times a year we also read {quarterlySurfaceList()} by hand, because neither can be
            captured any other way without substituting a different system and calling it their
            answer.
          </p>
          {founding && (
            <p className="founding">
              You took a founding place. USD 149 a month, locked for twelve months.
            </p>
          )}
          <p className="punch">Nothing needed from you in the meantime.</p>
          <p className="note">
            {paid
              ? 'A receipt is on its way to your inbox. Reply to it if you need anything, a person reads it.'
              : 'If your payment is still settling, the confirmation email will arrive shortly.'}
          </p>
          <div className="wizard-actions">
            <Link href="/account" className="button ghost">
              Manage your subscription
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
