// Server-only. Never log a value from here.
import 'server-only';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/**
 * Is this address on the same domain we send from? Compared on the domain alone, because
 * that is the unit a mail routing fault takes out.
 */
function sharesDomainWithSender(address: string): boolean {
  const domainOf = (s: string) => s.trim().toLowerCase().match(/@([^\s>]+)/)?.[1] ?? null;
  const alert = domainOf(address);
  const sender = domainOf(process.env.RESEND_FROM || 'results@wordofmodel.ai');
  return Boolean(alert && sender && alert === sender);
}

export const env = {
  get openaiKey() {
    return required('OPENAI_API_KEY');
  },
  get perplexityKey() {
    return required('PERPLEXITY_API_KEY');
  },
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY');
  },
  /**
   * Used only by the server side auth client in lib/auth.ts. It is RLS bound
   * and safe to expose, but nothing in this build talks to Supabase from a
   * browser, so it is deliberately not named NEXT_PUBLIC_.
   */
  get supabasePublishableKey() {
    return required('SUPABASE_PUBLISHABLE_KEY');
  },
  get googleKey() {
    return required('GOOGLE_API_KEY');
  },
  get xaiKey() {
    return required('XAI_API_KEY');
  },
  get serpApiKey() {
    return required('SERPAPI_KEY');
  },
  get dataForSeoLogin() {
    return required('DATAFORSEO_LOGIN');
  },
  get dataForSeoPassword() {
    return required('DATAFORSEO_PASSWORD');
  },
  /**
   * Which SERP provider the google_aio surface is captured through.
   *
   * Deliberately unset until the bake-off has run. Unset means google_aio is not in
   * the monthly surface set at all, so a run is five questions across four surfaces
   * and captures_expected is 20. That is a complete run, not a broken one: a surface
   * we have not committed to is a surface we do not claim to measure.
   *
   * Committing it later changes the score denominator for every subscriber
   * at once, which is a configuration change and must be reported as one. runs.surfaces
   * is what makes that visible - see the note in 0005.
   */
  get serpProvider(): 'serpapi' | 'dataforseo' | null {
    const v = process.env.SERP_PROVIDER;
    return v === 'serpapi' || v === 'dataforseo' ? v : null;
  },
  /** Guards the manual run trigger and the Vercel Cron routes. */
  get cronSecret() {
    return required('CRON_SECRET');
  },
  /**
   * Per-run spend ceiling, in USD. Snapshotted onto runs.cost_ceiling_usd at creation
   * so changing this later cannot retroactively rewrite what a past run should have
   * done.
   *
   * SOFT by nature: cost is only known once a call returns, so concurrent tick chains
   * can overshoot by up to one capture each. The code must never describe it as exact.
   *
   * Eight dollars against a measured run cost of USD 3.78 at the approved sampling
   * depth. Five was the first number and it was too tight: 32% headroom, which two
   * Grok retries at USD 0.19 each would eat into, and a ceiling that trips on a bad
   * day produces a partial run that holds and does not ship - a self-inflicted version
   * of the exact failure the ceiling exists to prevent.
   *
   * This catches runaway loops. Actual spend is read from captures.cost_usd, which is
   * per capture and marked reported or computed, not from where the ceiling sits.
   */
  get runCostCeilingUsd(): number {
    const v = Number(process.env.RUN_COST_CEILING_USD);
    return Number.isFinite(v) && v > 0 ? v : 8.0;
  },
  /**
   * The Vercel region this invocation is running in, recorded on every capture.
   *
   * For Grok and Gemini, which accept no location parameter, the network origin IS
   * the location - so this is the only record of where those two thought we were.
   * vercel.json pins iad1 and it must never change: the product sells a
   * month-over-month delta, and an origin that drifts moves the number for a reason
   * that has nothing to do with the market.
   */
  get vercelRegion(): string {
    return process.env.VERCEL_REGION || 'local';
  },
  /**
   * Meta advertising. Both unset by default, which means no pixel is served and no server
   * event is sent: forgetting them can only ever result in less tracking, never more.
   */
  get metaPixelId(): string | null {
    return process.env.META_PIXEL_ID || null;
  },
  get metaCapiToken(): string | null {
    return process.env.META_CAPI_TOKEN || null;
  },
  /**
   * Microsoft Clarity: session replay, scroll maps and rage clicks. Unset by default, same
   * failure direction as the pixel above - forgetting it means no script is served.
   *
   * WHY IT IS HERE AT ALL, and it is a narrow reason with an end date. On 1 Sep 2026 the
   * campaign had taken 100+ landing page views and zero ViewContent, and every remaining
   * explanation was about what visitors DO: whether they reach the field, what they type, and
   * whether the grounding confirmation step is where they stop. No table answers that. A
   * recording does, in an afternoon.
   *
   * It is a third-party recorder on a page that collects an email address, so read the masking
   * note in components/Clarity.tsx before turning it on, and take it back out when the question
   * is answered. Instrumentation that outlives its question becomes furniture nobody audits.
   *
   * NEXT_PUBLIC_ because the id is rendered into the page and is not a secret - it identifies
   * the project, the way the pixel id does.
   */
  get clarityProjectId(): string | null {
    return process.env.NEXT_PUBLIC_CLARITY_ID || null;
  },
  get resendKey() {
    return required('RESEND_API_KEY');
  },
  get stripeSecretKey() {
    return required('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return required('STRIPE_WEBHOOK_SECRET');
  },
  /**
   * Which Stripe mode this build is allowed to talk to. Defaults to test, so
   * forgetting to set it can only ever make the build safer. assertTestMode in
   * lib/stripe.ts refuses to start on a mismatch between this and the key.
   */
  get stripeMode(): 'test' | 'live' {
    return process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
  },
  /**
   * The Customer Portal configuration created by scripts/stripe-setup.mjs.
   * Optional: with no id Stripe falls back to the account's default portal
   * configuration, which is fine to develop against but has plan switching on,
   * and plan switching off a founding price is the one thing the portal must
   * not allow.
   */
  get stripePortalConfigurationId(): string | null {
    return process.env.STRIPE_PORTAL_CONFIGURATION_ID || null;
  },
  /**
   * Whether the wizard is offered to visitors.
   *
   * Off, the pricing block and the scan result keep the waitlist they had
   * before onboarding existed. It exists because Stripe is in test mode: a
   * visitor sent to a test mode Checkout gets a page carrying Stripe's test
   * banner that will not take their card, and this product is sold on honesty.
   *
   * It gates the public CTAs and nothing else. /start stays reachable by URL and
   * every wizard route keeps working, so the whole flow including checkout and
   * the webhook can be walked on production while visitors still see the
   * waitlist. Both wizard pages are already noindex.
   *
   * Defaults to false, so forgetting to set it can only ever be the safe way
   * round. Flip it to "true" on production when the live keys are in.
   */
  get wizardLive(): boolean {
    return process.env.WIZARD_LIVE === 'true';
  },
  /**
   * The run behind the public /sample page. Unset means nothing is published.
   *
   * DELIBERATELY NOT DEFAULTED. Exactly one real run exists, and putting a named company's
   * competitive position on a permanent public URL is the business's decision rather than a
   * fallback this file gets to pick. Unset and "permission granted" must not render the same,
   * which is the same rule the founding cap is held to.
   */
  get sampleRunId(): string | null {
    const v = process.env.SAMPLE_RUN_ID?.trim();
    return v ? v : null;
  },
  /**
   * Where a reviewer can also post their review, once those listings exist.
   *
   * ALL THREE ARE UNSET UNTIL SOMEBODY CREATES THE LISTING. Google needs a Business Profile,
   * and G2 and Trustpilot each need a claimed page before a review URL exists at all. A
   * platform with no URL is not rendered - a button that goes nowhere is worse than an absent
   * one, which is the same rule this build applies to a price with no purchase path.
   *
   * Read through one getter so the review page and the ops tooling cannot disagree about which
   * ones are live.
   */
  get reviewPlatformUrls(): Record<string, string | null> {
    const one = (v: string | undefined) => {
      const t = v?.trim();
      return t ? t : null;
    };
    return {
      google: one(process.env.REVIEW_URL_GOOGLE),
      g2: one(process.env.REVIEW_URL_G2),
      trustpilot: one(process.env.REVIEW_URL_TRUSTPILOT),
    };
  },
  /**
   * Where failed payments, held reports and every other ops alert get reported.
   *
   * IT MUST NOT BE ON THE SENDING DOMAIN, and that is not a style preference. It was
   * hello@wordofmodel.ai until 21 Aug 2026, which is also the reply-to on every subscriber
   * email and is routed by Cloudflare Email Routing. One misconfigured routing rule takes
   * out the address a customer replies to AND the address that would have told us about it:
   * the same fault, one cause, no signal. That address really did bounce 550 5.1.1 three
   * times on 17 Aug, rejected by Cloudflare's own MX with no rule behind it.
   *
   * An alert channel that shares a failure mode with the thing it monitors is not a channel.
   * So it points at a mailbox on different infrastructure, and the warning below fires if
   * anybody ever points it back. This is permanent, not a stopgap until hello@ is healthy:
   * moving it back once the routing is fixed rebuilds the same single point of failure,
   * where the fault takes out the thing that broke and the means of hearing about it.
   *
   * A personal Gmail rather than a Frame address, deliberately. Word of Model is being kept
   * outside Frame, so its operational mail is not entangled with Frame's either, and Gmail
   * already provides what a Frame address would: another provider, another domain, another
   * failure mode.
   */
  get alertEmail(): string | null {
    const value = process.env.ALERT_EMAIL || null;
    if (value && sharesDomainWithSender(value)) {
      console.warn(
        `ALERT_EMAIL (${value}) is on the same domain as RESEND_FROM. A mail routing fault ` +
          `on that domain would take out the alert channel and the thing it is watching at ` +
          `the same time. Point it at a mailbox somewhere else.`,
      );
    }
    return value;
  },
  get resendFrom() {
    return process.env.RESEND_FROM || 'Word of Model <results@wordofmodel.ai>';
  },
  get resendReplyTo() {
    return process.env.RESEND_REPLY_TO || 'hello@wordofmodel.ai';
  },
  /**
   * Salt for hashing visitor IPs. Required, with no fallback.
   *
   * It used to fall back to the Supabase secret, which kept a missing salt from
   * ever meaning a plaintext address but made the salt and the database
   * credential the same string. Rotating that credential, an ordinary thing to
   * do and exactly what you would do in a hurry after a leak, silently rehashed
   * every visitor: rate limiting stopped recognising anyone, and every hash
   * already in scans and rate_events became uncomparable with every new one.
   * Nothing errored.
   *
   * So it fails loudly instead. A missing salt now takes the route down, which
   * is recoverable in a minute, rather than quietly corrupting the only record
   * of who has already been here.
   */
  get ipHashSalt() {
    return required('IP_HASH_SALT');
  },
  /**
   * The base URL this deployment is actually reachable at.
   *
   * It is not decoration. Every link that has to come back to us is built from
   * it: the magic link redirect, Stripe's Checkout success and cancel URLs, the
   * Customer Portal return URL, and the account link in the confirmation email.
   * A wrong value here sends a preview deploy's subscriber to production, or a
   * local one to the live site.
   *
   * Resolved in this order, and each step exists for a reason:
   *
   *   1. NEXT_PUBLIC_SITE_URL   set on Production only, deliberately. Preview
   *                             must not have a static value or every preview
   *                             deploy would redirect to production.
   *   2. the production alias   belt and braces. If step 1 is ever missing on a
   *                             production deploy, fall back to the project's
   *                             own production URL rather than to the unique
   *                             deployment URL, which nobody has allowlisted.
   *   3. VERCEL_URL             the preview case. Unique per deployment, which
   *                             is exactly what is wanted: the deploy that is
   *                             running is the deploy you come back to.
   *   4. localhost              local dev. Before this, a missing variable made
   *                             local magic links point at the live site.
   *
   * Server side only, despite the NEXT_PUBLIC_ name on step 1: this module is
   * server-only and nothing in the build reads siteUrl from a browser.
   */
  get siteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return stripTrailingSlash(explicit);

    if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }

    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

    return `http://localhost:${process.env.PORT || 3000}`;
  },
};

/**
 * Model IDs, all overridable without a deploy.
 *
 * Verified against both live APIs on 17 Aug 2026.
 *   - answer:  the ChatGPT capture. Flagship, because the product claims to
 *              report what ChatGPT actually says.
 *   - utility: detect, question writing and scoring. Cheap, JSON schema capable.
 *   - sonar:   see the guard below.
 */
export const MODELS = {
  answer: process.env.OPENAI_MODEL_ANSWER || 'gpt-5.5',
  utility: process.env.OPENAI_MODEL_UTILITY || 'gpt-5.4-mini',
  sonar: process.env.PERPLEXITY_MODEL || 'perplexity/sonar',
  /**
   * Verified against the live API 20 Aug 2026, and this pin is not arbitrary.
   *
   * gemini-3.6-flash returns HTTP 200, a fluent answer, and NO groundingMetadata: it
   * ignores the google_search tool and answers from training data. promptTokenCount
   * came back as 7, against 772 on gemini-3.5-flash for the same question, which is
   * the search results being absent. Reproduced. gemini-3.6 and 3.7 also 503
   * intermittently.
   *
   * gemini-3.5-flash grounds reliably: 20 grounding chunks, four real search queries.
   *
   * Flash rather than Pro on purpose. We measure surfaces, not flagships, and
   * consumer Gemini serves Flash to free users - which is what most buyers see.
   *
   * NEVER an alias. gemini-flash-latest resolves to gemini-3.7-flash today and
   * something else tomorrow, silently, which would move every subscriber's number for
   * a reason that is not the market.
   */
  gemini: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  /** Verified 20 Aug 2026. xAI returns the model id it answered with. */
  grok: process.env.XAI_MODEL || 'grok-4.6',
};

/**
 * The Perplexity Agent API is model agnostic. Its catalogue fronts OpenAI,
 * Anthropic, Google and xAI, plus open models Perplexity merely hosts. An answer
 * from any of those is not a Perplexity answer, and the methodology depends on it
 * being one. Only Sonar counts.
 */
export function assertSonar(model: string): string {
  if (model !== 'perplexity/sonar') {
    throw new Error(
      `Refusing to run: PERPLEXITY_MODEL is "${model}". The Perplexity capture must be perplexity/sonar.`,
    );
  }
  return model;
}
