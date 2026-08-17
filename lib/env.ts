// Server-only. Never log a value from here.
import 'server-only';

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
  get resendKey() {
    return required('RESEND_API_KEY');
  },
  get resendFrom() {
    return process.env.RESEND_FROM || 'Word of Model <results@wordofmodel.ai>';
  },
  get resendReplyTo() {
    return process.env.RESEND_REPLY_TO || 'hello@wordofmodel.ai';
  },
  /**
   * Salt for hashing visitor IPs. Set IP_HASH_SALT in production. Falls back to
   * the Supabase secret so a missing salt is never a plaintext IP.
   */
  get ipHashSalt() {
    return process.env.IP_HASH_SALT || required('SUPABASE_SECRET_KEY');
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://wordofmodel.ai';
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
