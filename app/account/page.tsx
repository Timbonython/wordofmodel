import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentAccount } from '@/lib/auth';
import { getSubscriptionForAccount, LIVE_STATUSES } from '@/lib/billing';
import { locationsForScope } from '@/lib/locations';
import { Locations } from '@/components/account/Locations';
import { getScope } from '@/lib/onboarding';
import { formatReportDate } from '@/lib/billing-mail';
import { priceLabel } from '@/lib/scope';
import SignIn from '@/components/wizard/SignIn';
import PortalButton from '@/components/wizard/PortalButton';
import { SiteNav } from '@/components/SiteNav';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your subscription - Word of Model',
  robots: { index: false, follow: false },
};

/**
 * The account page. Deliberately small: this session builds the holding state,
 * not the dashboard. It says what you are paying, when the report lands, and
 * gives you one link to change your card or cancel.
 *
 * Cancellation is one click from here into the hosted portal, which is the same
 * number of steps as signing up. That is both the July 2027 Unfair Trading
 * Practices position and the only defensible way to sell a subscription.
 *
 * IT ALSO HAS TO SAY WHO YOU ARE, which it did not. A magic link leaves somebody signed in
 * indefinitely on whichever device opened the email, and this page showed no address and
 * offered no way out. Found on a phone signed in as one address when a report link for
 * another arrived: the report refused, correctly, and there was no way to see whose session
 * you were in, leave it, or fix it. A page that cannot answer "as whom" is a dead end wearing
 * a subscription summary.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ signed_out?: string }>;
}) {
  const { signed_out: signedOut } = await searchParams;
  const account = await getCurrentAccount();

  if (!account) {
    return (
      <Shell>
        <section className="wizard-step">
          <div className="eyebrow">Sign in</div>
          {signedOut ? <p className="note">You are signed out on this device.</p> : null}
          <h2>We&apos;ll email you a link</h2>
          <p className="lede">
            No password. Put in the address your report goes to and we&apos;ll send a link that
            signs you in.
          </p>
          <SignIn />
        </section>
      </Shell>
    );
  }

  const subscription = await getSubscriptionForAccount(account.id);
  const scope = subscription ? await getScope(subscription.scope_id) : null;
  const live = subscription ? LIVE_STATUSES.includes(subscription.status) : false;
  const nextReport = formatReportDate(subscription?.current_period_end ?? null);
  const locations = subscription ? await locationsForScope(subscription.scope_id) : [];

  return (
    <Shell>
      <section className="wizard-step">
        <div className="eyebrow">Your subscription</div>

        {/* WHO, AND HOW TO STOP BEING THEM. The report link sends people here when it refuses
            them, and "signed in as somebody else" is the commonest reason it does. */}
        <div className="identity">
          <span>
            Signed in as <strong>{account.email}</strong>
          </span>
          <form method="post" action="/api/auth/sign-out">
            <button type="submit" className="linklike">
              Sign out
            </button>
          </form>
        </div>

        {!subscription && (
          <>
            <h2>No subscription on this address yet</h2>
            <p className="lede">
              If you approved your questions but did not finish paying, pick it up where you left
              off.
            </p>
            <div className="wizard-actions">
              <Link href="/start" className="button">
                Finish setting up
              </Link>
            </div>
          </>
        )}

        {subscription && (
          <>
            <h2>
              {scope?.brand_name ?? 'Your report'},{' '}
              {priceLabel(subscription.price_key)} a month
            </h2>

            <dl className="account-facts">
              <div>
                <dt>Status</dt>
                <dd>{statusLine(subscription.status, subscription.cancel_at_period_end)}</dd>
              </div>
              <div>
                <dt>Report day</dt>
                <dd>the {subscription.report_day} of each month</dd>
              </div>
              {nextReport && (
                <div>
                  <dt>{subscription.cancel_at_period_end ? 'Access ends' : 'Next report'}</dt>
                  <dd>{nextReport}</dd>
                </div>
              )}
              {subscription.price_key === 'premium_founding_monthly' && (
                <div>
                  <dt>Rate</dt>
                  <dd>Founding, held for as long as this subscription stays active</dd>
                </div>
              )}
            </dl>

            {subscription.status === 'past_due' && (
              <p className="error">
                Your last payment did not go through. Update your card and it will retry on its own.
              </p>
            )}

            {live && (
              <p className="note">
                Nothing needed from you. The report arrives by email on the same date every month.
              </p>
            )}

            {/* SELF SERVE BOTH WAYS. A page that can add a US$30 line and not remove it is not a
                self service page, it is a form that only increases the bill. */}
            {live && (
              <Locations
                mainTown={scope?.locality ?? null}
                initial={locations.map((l) => ({ id: l.id, locality: l.locality }))}
              />
            )}

            <PortalButton />
          </>
        )}
      </section>
    </Shell>
  );
}

function statusLine(status: string, cancelling: boolean): string {
  if (cancelling) return 'Active, ending at the end of this period';
  switch (status) {
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Payment failed, retrying';
    case 'canceled':
      return 'Cancelled';
    case 'incomplete':
      return 'Waiting on the first payment';
    case 'paused':
      return 'Paused';
    default:
      return status;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav sampleLive issue="Account" />
      <main className="wrap">{children}</main>
    </>
  );
}
