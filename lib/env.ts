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
  get resendKey() {
    return required('RESEND_API_KEY');
  },
  get stripeSecretKey() {
    return required('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return required('STRIPE_WEBHOOK_SECRET');
  },
  get stripeFoundingPriceId() {
    return required('STRIPE_PRICE_FOUNDING_MONTHLY');
  },
  get stripeStandardPriceId() {
    return required('STRIPE_PRICE_STANDARD_MONTHLY');
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
  /** Where failed payments and new subscriptions get reported. */
  get alertEmail(): string | null {
    return process.env.ALERT_EMAIL || null;
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
