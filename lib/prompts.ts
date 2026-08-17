// The three prompts from wordofmodel-free-scan-spec.md, verbatim.
// The question prompt is described in the spec as the highest-leverage prompt in
// the product. Do not paraphrase any of these. Interpolation only.

export function detectPrompt(siteText: string): string {
  return `You are analysing a company website to prepare a buyer-intent search question.

From the text below, return ONLY this JSON, no preamble, no markdown:
{
  "brand_name": "the company's name as customers would say it",
  "what_they_sell": "plain, specific, max 10 words",
  "buyer": "who buys it, max 10 words",
  "country": "primary market, ISO country name",
  "category_term": "the phrase a buyer would search, max 6 words"
}

If the site is too thin to tell, set any unknown field to null.

SITE TEXT:
${siteText}`;
}

export function questionPrompt(input: { what_they_sell: string; country: string; brand_name: string }): string {
  return `Write ONE question that a real buyer would ask an AI assistant when they are
close to choosing a supplier of ${input.what_they_sell} in ${input.country}.

Rules:
- Never mention ${input.brand_name} or any brand name.
- Write it the way a busy buyer types, not the way a marketer writes.
- Make it specific enough that only a handful of companies could answer it.
- Include the country or region.
- One sentence. No preamble.

Return only the question.`;
}

export function scorePrompt(input: { brand_name: string; question: string; answer: string }): string {
  return `Here is an AI assistant's answer to a buyer's question. Return ONLY this JSON:
{
  "target_mentioned": true/false,
  "target_recommended": true/false,
  "target_position": integer or null,
  "brands_named": ["in the order they appear"],
  "top_recommendation": "the brand pushed hardest, or null",
  "domains_cited": ["..."]
}

TARGET BRAND: ${input.brand_name}
QUESTION: ${input.question}
ANSWER: ${input.answer}`;
}
