import { jsonldText, type Jsonld } from '@/lib/schema';

/**
 * A JSON-LD block, server rendered into the HTML.
 *
 * Not injected by script, not fetched: structured data a crawler has to execute JavaScript to
 * see is structured data most of them will not see.
 */
export function JsonLd({ schema }: { schema: Jsonld | Jsonld[] }) {
  return (
    <script
      type="application/ld+json"
      // The content is built by lib/schema.ts and escaped there. Review bodies are user
      // submitted, so `<` is neutralised before it can close this tag.
      dangerouslySetInnerHTML={{ __html: jsonldText(schema) }}
    />
  );
}
