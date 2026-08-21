# Go live

Taking a real payment from a real customer. Nine steps, in this order, because several of
them break if done earlier. Each one says what you do, how to know it worked, and what it
costs to skip.

The order is not preference. Infrastructure first, because a live Stripe key with a broken
magic link means a paying customer who cannot get back in. Stripe second. The wizard's
public buttons last, because that flag is the only thing standing between a visitor and a
Checkout page, and everything before it can be walked on production without one appearing.

---

## 1. Migrations 0009, 0010, 0011

**You:** Supabase → SQL Editor → paste each file from `supabase/migrations/`, in order, if it
has not already been run. All three are applied as of 21 Aug, so this step is done.

**Worked when:** `select count(*) from ops_alerts;` returns a number rather than an error.
Verified applied 21 Aug.

**Skip it and:** every ops alert still sends, and none is recorded, so "did anybody hear
about that failure" stays unanswerable. The report pages break outright without 0009 and
0010, because the capture select names those columns.

## 2. ALERT_EMAIL off the sending domain

**You:** Vercel → Settings → Environment Variables → `ALERT_EMAIL=therealtimpearce@gmail.com`
across production, preview and development. Same in `.env.local`.

**Worked when:** the deploy logs stop carrying `ALERT_EMAIL (...) is on the same domain as
RESEND_FROM`.

**Skip it and:** one Cloudflare routing fault takes out both the address customers reply to
and the channel that would tell you. See the rule in CLAUDE.md; it is permanent.

## 3. Cloudflare Email Routing

**You:** Cloudflare → Email → Email Routing → Routing rules. Confirm `hello@wordofmodel.ai`
has an explicit rule to a **verified** destination, and that the catch-all action is **Send
to an email**, not Drop.

**Worked when:** you send yourself a message to `hello@wordofmodel.ai` and to an invented
address on the domain, and both arrive.

**Skip it and:** the reply-to on every subscriber email is unproven. Probed 21 Aug, the MX
accepts every address including invented ones, so nothing bounces - but a catch-all set to
Drop accepts and discards, which for a reply-to is worse than bouncing: the customer
believes they were heard and nothing tells anyone otherwise.

## 4. Supabase auth

**You:** Supabase → Authentication. Enable the email provider and magic link. Set the
redirect allowlist to `https://wordofmodel.ai/auth/callback` plus a preview wildcard like
`https://*-reframe5.vercel.app/auth/callback`. Set the magic link email template to the
token hash URL:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

**Worked when:** you request a link on production, open it on your phone, and land signed in
on `/account`.

**Skip it and:** a subscriber who pays cannot open their own report. The token hash template
matters specifically because PKCE only works in the browser that asked, and people request
on a laptop and read mail on a phone.

## 5. Stripe live mode

**You:** in this order.

1. Stripe dashboard → toggle to live → create a restricted or secret key.
2. Locally, with the live key in `.env.local` and `STRIPE_MODE=live`, run `npm run
   stripe:setup`. It creates the product, both prices by lookup key and the portal
   configuration, idempotently, and prints the env vars. It refuses to run a live key
   without `STRIPE_MODE=live`, and refuses a test key with it.
3. Put the printed values into Vercel production: `STRIPE_SECRET_KEY`, `STRIPE_MODE=live`,
   `STRIPE_PRICE_FOUNDING_MONTHLY`, `STRIPE_PRICE_STANDARD_MONTHLY`,
   `STRIPE_PORTAL_CONFIGURATION_ID`.
4. Dashboard → Billing → Smart Retries: four attempts, ending in `past_due`, not cancel.

**Worked when:** the two prices exist in live mode at USD 149.00 and USD 249.00, monthly, no
trial, and the portal has plan switching **off**.

**Skip a piece and:** a wrong price id is invisible until an invoice goes out, which is why
`assertPrice()` re-checks currency, amount, interval and the absence of a trial before every
Checkout Session. Portal plan switching on is how somebody moves themselves off the founding
rate with nobody deciding to.

## 6. Production webhook endpoint

**You:** Stripe → Developers → Webhooks → add endpoint, live mode,
`https://wordofmodel.ai/api/stripe/webhook`. Send `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`. Copy the `whsec_` into Vercel as
`STRIPE_WEBHOOK_SECRET`, production.

**Worked when:** Stripe's "Send test webhook" returns 200, and a bad signature returns 400.

**Skip it and:** a subscriber pays and nothing writes the subscription. The daily scheduler
would eventually open their baseline run, but they would get no receipt and `/account` would
show them nothing. This is the one link never exercised by Stripe's own delivery - the
Session 2 end-to-end used a locally set secret.

## 7. Deploy and check the crons

**You:** deploy production. Vercel → Settings → Cron Jobs: `/api/cron/sweep` every five
minutes and `/api/cron/schedule` daily at 06:00 UTC should both be listed.

**Worked when:** both appear, and a manual run of the scheduler returns JSON with `opened`,
`baselines`, `stuck` and `failed` keys. Reports are delivered by the **sweep**, not the
scheduler: the daily pass only alerts on anything complete and unsent for six hours.

**Note:** crons only run on production deployments, and Vercel adds
`Authorization: Bearer $CRON_SECRET` automatically because `CRON_SECRET` is set. Without that
variable the routes 401 and nothing runs.

## 8. Buy it yourself, once, with a real card

**You:** with `WIZARD_LIVE` still unset, open `https://wordofmodel.ai/start` directly and
walk the whole thing: business, competitors, questions, pay. Use your own card. It is a real
USD 149 charge; refund and cancel it in Stripe afterwards.

**Worked when, in order:**

- the receipt email arrives within a minute (`confirmation_sent_at` set on the subscription);
- a baseline run opens and completes, about eight minutes, 55 captures;
- `npm run alerts` shows nothing failed;
- the report email arrives on its own, about twenty minutes after payment: the run takes
  roughly thirteen, the next sweep settles and extracts it, and the one after that delivers.
  `POST /api/report/send` with the run id is the override if you do not want to wait;
- the link in it opens the hosted report after a magic link sign-in;
- `/account` shows the subscription and the portal opens.

**Skip it and:** the first person to walk this path is a customer. Every failure this build
has found was found by running the real path with real data.

**Then:** refund the charge, cancel the subscription, and delete the test scope's rows if you
want the founding counter clean. A cancelled founding subscription still holds its seat by
design - `foundingState()` counts active **or ever** - so leaving it costs one of the twenty
places.

## 9. WIZARD_LIVE=true

**You:** Vercel → production → `WIZARD_LIVE=true`. Redeploy.

**Worked when:** the pricing block and the scan result show the wizard CTA instead of the
waitlist, and the founding counter reads the real remaining number.

**This is the last step deliberately.** It defaults to false, so forgetting it can only ever
fail safe, and until it is set a visitor sent to a test-mode Checkout would see Stripe's test
banner on a page that will not take their card.

---

## Not blocking, but decide before it bites

- **EU and UK VAT.** Stripe Tax is off and Managed Payments is explicitly disabled, so you
  are the merchant of record and no Australian GST is charged. That is the position for an
  Australian or US customer. A consumer sale into the EU or UK is the one to have the
  accountant's answer for first, and Managed Payments is a plausible answer to it: it makes
  Stripe the merchant of record, changes the fees and whose name is on the invoice, and needs
  `automatic_tax: { enabled: true }` plus deleting one line in `lib/checkout.ts`.
- **GST at about fifteen subscribers.** The threshold is projected turnover, not actual.
- **Trademark search** on Word of Model, parked since 1 Aug. Worth clearing before ads run.
