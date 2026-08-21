/** Registers ts-hook.mjs on the loader thread. Passed to node with --import. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-hook.mjs', pathToFileURL(import.meta.filename));
