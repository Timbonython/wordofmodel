/**
 * Lets a plain node script import lib/*.ts directly.
 *
 * Node 24 strips the types on its own; what it will not do is guess an extension, and every
 * import inside lib/ is extensionless because a bundler resolves them. This adds the
 * extension and nothing else. Used by scripts/extract-check.mjs, which has to run the REAL
 * extraction path - a check that runs a copy of the prompt checks the copy.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(context.parentURL));
    const target = resolvePath(base, specifier);
    for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
