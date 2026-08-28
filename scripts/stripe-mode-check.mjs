/**
 * Proves which Stripe mode this environment is actually talking to.
 *
 *   npm run stripe:mode
 *
 * A COUNT CANNOT ANSWER THIS. "Zero founding places taken" reads identically whether it is a
 * correct zero or a count pointed at the wrong mode, and the two have opposite consequences.
 * A price id that exists in one mode and not the other is unambiguous.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { proveStripeMode, MODE_SENTINEL } = await import(join(here, '../lib/stripe.ts'));

const proof = await proveStripeMode();
console.log(`  STRIPE_MODE says      ${proof.mode}`);
console.log(`  sentinel price        ${proof.sentinel}`);
console.log(`  the other mode's is   ${MODE_SENTINEL[proof.mode === 'live' ? 'test' : 'live']}  (must NOT resolve here)`);
console.log(`  price.livemode        ${proof.livemode}`);
console.log(`  lookup_key            ${proof.lookupKey}`);
console.log(`  amount                ${proof.amount}`);
console.log(`\n  ${proof.resolved ? 'PROVED' : 'FAILED'}: ${proof.detail}`);
process.exit(proof.resolved ? 0 : 1);
