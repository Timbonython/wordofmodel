import type { ReportData } from './report';

/**
 * The published specimen at /sample.
 *
 * WHY THIS EXISTS RATHER THAN A REAL REPORT. §3 of the brand brief asks for a real report on a
 * real business, published in full, because evidence beats implication. It is right, and it is
 * still the goal - see REPLACING THIS below. What it cannot be is a real business's competitive
 * position published permanently without that business having agreed to it, and the only real
 * run this build has ever produced belongs to somebody who was never asked.
 *
 * SO EVERY NAME HERE IS INVENTED, and checked. On 28 Aug 2026 each of the five - Pellamere,
 * Tallowwood, Quillon, Barrowmere, Marrowfield - was searched against dental practices
 * generally and against Bendigo VIC specifically, and none matched a trading business. Two
 * earlier candidates were dropped for exactly this reason: "Kestrel Lane Dental" was too close
 * to Kestrel Dental Studio in Gloucester, and "Fennimore Dental" is a real practice in
 * Wisconsin. RE-CHECK BEFORE CHANGING ANY NAME HERE.
 *
 * WHAT IS REAL, and this is the part that makes the page worth publishing:
 *
 *   the five question slots      category, situation, alternatives, how_do_people, branded
 *   the surface set              the locked five, with google_aio sampled three times
 *   the metric                   recommendations over answers received, no_answer excluded
 *   the structure                rendered by renderReport, the same function subscribers get
 *   the method note              the same standing text
 *
 * Only the names and the answer text are illustrative, and the banner says so on every screen.
 *
 * PELLAMERE LOSES, AND THAT IS THE POINT. It is recommended by one surface of five, named by
 * three, absent from two, and beaten outright on the category and alternatives questions. A
 * specimen where the subject wins everything reads as a brochure and would contradict the
 * method page, which is the strongest asset on the site. The uncomfortable version is the
 * honest one and it sells better.
 *
 * REPLACING THIS WITH A REAL REPORT. When a customer consents: set SAMPLE_RUN_ID to their run
 * and /sample serves the real thing through the same renderer - the route already prefers a
 * configured run over this file. Then delete this module and the `specimen` flag's only
 * caller. Nothing else has to change.
 */
export const SAMPLE_REPORT: ReportData = {
  specimen: true,

  scope: {
    brandName: 'Pellamere Dental',
    market: 'dental practices in Bendigo, Victoria',
    marketCountry: 'AU',
    website: null,
    locality: 'Bendigo',
  },
  localityNote:
    'Three of the five surfaces were searched from Bendigo directly. Grok and Gemini accept no ' +
    'location at all, so for those two the town reaches the answer through the question and ' +
    'nothing else.',

  // No date, no run id that implies an execution. renderReport prints "Specimen" instead of a
  // month when `specimen` is set, and drops the run id from the colophon entirely.
  run: {
    id: 'specimen',
    periodStart: '2026-01-01',
    status: 'complete',
    surfaces: ['chatgpt', 'gemini', 'grok', 'perplexity', 'google_aio'],
    samples: { chatgpt: 1, grok: 1, gemini: 3, perplexity: 3, google_aio: 3 },
  },
  versions: { threshold: 1, extraction: 1, metric: 2 },

  diagnosis: {
    kind: 'known_not_endorsed',
    label: 'Known, not recommended',
    headline: '3 of 5 surfaces know you. 1 recommends you.',
    meaning:
      'You are not invisible. You are visible and being passed over, which is a different ' +
      'problem and a more fixable one: the assistants can describe you and are choosing ' +
      'somebody else when a patient asks who to go to.',
  },

  presence: { shareOfModel: 0.35, pairs: 20, numerator: 7 },
  recognised: 3,
  endorsement: { recognised: 3, endorsed: 1, askedDirectly: 5 },

  bySurface: [
    { surface: 'chatgpt', label: 'ChatGPT', shareOfModel: 0.5, pairs: 4 },
    { surface: 'gemini', label: 'Gemini', shareOfModel: 0.25, pairs: 4 },
    { surface: 'grok', label: 'Grok', shareOfModel: 0.5, pairs: 4 },
    { surface: 'perplexity', label: 'Perplexity', shareOfModel: 0.25, pairs: 4 },
    { surface: 'google_aio', label: 'Google AI Overviews', shareOfModel: 0.33, pairs: 4 },
  ],

  // Two competitors ahead of the subject, two behind. A specimen where the subject leads the
  // table would be the brochure this is trying not to be.
  competitors: [
    { name: 'Tallowwood Dental', shareOfModel: 0.8, ahead: true },
    { name: 'Quillon Dental', shareOfModel: 0.6, ahead: true },
    // The subject is NOT listed here. sectionLeaderboard adds its own row from `scope` and
    // highlights it; including it in this array printed Pellamere twice, once in each colour.
    { name: 'Barrowmere Dental', shareOfModel: 0.3, ahead: false },
    { name: 'Marrowfield Dental', shareOfModel: 0.15, ahead: false },
  ],

  branded: [
    {
      surface: 'chatgpt',
      label: 'ChatGPT',
      recommended: true,
      readings: { recommended: 1, of: 1 },
      excerpt:
        'Pellamere Dental is a single-location practice in Bendigo offering general and ' +
        'cosmetic dentistry. Patients mention short waiting times and that the same dentist ' +
        'is seen at each visit.',
    },
    {
      surface: 'gemini',
      label: 'Gemini',
      recommended: false,
      readings: { recommended: 0, of: 3 },
      excerpt:
        'I can confirm Pellamere Dental operates in Bendigo, but I do not have enough ' +
        'independent information about their services or patient experience to recommend ' +
        'them over other practices in the area.',
    },
    {
      surface: 'grok',
      label: 'Grok',
      recommended: false,
      readings: { recommended: 0, of: 1 },
      excerpt:
        'There is very little about Pellamere Dental outside their own website. For a ' +
        'recommendation I would point to practices with a clearer public record.',
    },
    {
      surface: 'perplexity',
      label: 'Perplexity',
      recommended: false,
      readings: { recommended: 0, of: 3 },
      excerpt: null,
    },
    {
      surface: 'google_aio',
      label: 'Google AI Overviews',
      recommended: false,
      readings: { recommended: 0, of: 3 },
      excerpt: null,
    },
  ],

  actions: {
    convergence:
      'Three surfaces gave the same reason in different words: there is not enough independent ' +
      'material about this practice for them to describe it with confidence.',
    items: [
      {
        surface: 'gemini',
        label: 'Gemini',
        quote:
          'I do not have enough independent information about their services or patient ' +
          'experience to recommend them over other practices in the area.',
        span: 'not have enough independent information',
        reason: 'evidence_thin',
        cause: 'thin_record',
        whatWouldChangeIt:
          'Independent pages that describe what the practice actually does: a health directory ' +
          'listing with services filled in, and named clinician profiles.',
      },
      {
        surface: 'grok',
        label: 'Grok',
        quote: 'There is very little about Pellamere Dental outside their own website.',
        span: 'very little ... outside their own website',
        reason: 'evidence_thin',
        cause: 'thin_record',
        whatWouldChangeIt:
          'Anything that is not self-published. The practice is currently its own only source.',
      },
      {
        surface: 'perplexity',
        label: 'Perplexity',
        quote:
          'The practices I can speak to with confidence in Bendigo are Tallowwood Dental and ' +
          'Quillon Dental, both of which have detailed public listings.',
        span: null,
        reason: 'evidence_thin',
        cause: 'thin_record',
        whatWouldChangeIt:
          'Both named practices carry the detail this one does not. This is a gap in the record, ' +
          'not a judgment about the dentistry.',
      },
    ],
  },

  questions: [
    {
      slot: 'category',
      text: 'Who are the best dentists in Bendigo?',
      surfaces: [
        { surface: 'chatgpt', label: 'ChatGPT', state: 'absent', samples: '0 of 1' },
        { surface: 'gemini', label: 'Gemini', state: 'absent', samples: '0 of 3' },
        { surface: 'grok', label: 'Grok', state: 'absent', samples: '0 of 1' },
        { surface: 'perplexity', label: 'Perplexity', state: 'absent', samples: '0 of 3' },
        { surface: 'google_aio', label: 'Google AI Overviews', state: 'absent', samples: '0 of 3' },
      ],
    },
    {
      slot: 'situation',
      text: 'I have chipped a front tooth and need to be seen this week in Bendigo. Where should I go?',
      surfaces: [
        { surface: 'chatgpt', label: 'ChatGPT', state: 'named', samples: '1 of 1' },
        { surface: 'gemini', label: 'Gemini', state: 'named', samples: '2 of 3' },
        { surface: 'grok', label: 'Grok', state: 'named', samples: '1 of 1' },
        { surface: 'perplexity', label: 'Perplexity', state: 'absent', samples: '0 of 3' },
        { surface: 'google_aio', label: 'Google AI Overviews', state: 'named', samples: '2 of 3' },
      ],
    },
    {
      slot: 'alternatives',
      text: 'What are the alternatives to Tallowwood Dental in Bendigo?',
      surfaces: [
        { surface: 'chatgpt', label: 'ChatGPT', state: 'named', samples: '1 of 1' },
        { surface: 'gemini', label: 'Gemini', state: 'absent', samples: '0 of 3' },
        { surface: 'grok', label: 'Grok', state: 'named', samples: '1 of 1' },
        { surface: 'perplexity', label: 'Perplexity', state: 'named', samples: '1 of 3' },
        { surface: 'google_aio', label: 'Google AI Overviews', state: 'no_answer', samples: '0 of 3' },
      ],
    },
    {
      slot: 'how_do_people',
      text: 'How do people in Bendigo choose a dentist for their family?',
      surfaces: [
        { surface: 'chatgpt', label: 'ChatGPT', state: 'absent', samples: '0 of 1' },
        { surface: 'gemini', label: 'Gemini', state: 'absent', samples: '0 of 3' },
        { surface: 'grok', label: 'Grok', state: 'absent', samples: '0 of 1' },
        { surface: 'perplexity', label: 'Perplexity', state: 'absent', samples: '0 of 3' },
        { surface: 'google_aio', label: 'Google AI Overviews', state: 'absent', samples: '0 of 3' },
      ],
    },
    {
      slot: 'branded',
      text: 'What can you tell me about Pellamere Dental in Bendigo?',
      surfaces: [
        { surface: 'chatgpt', label: 'ChatGPT', state: 'named', samples: '1 of 1' },
        { surface: 'gemini', label: 'Gemini', state: 'named', samples: '3 of 3' },
        { surface: 'grok', label: 'Grok', state: 'named', samples: '1 of 1' },
        { surface: 'perplexity', label: 'Perplexity', state: 'absent', samples: '0 of 3' },
        { surface: 'google_aio', label: 'Google AI Overviews', state: 'absent', samples: '0 of 3' },
      ],
    },
  ],

  // Invented hostnames on reserved example domains, so nothing here resolves to a real site.
  domains: [
    { domain: 'healthdirectory.example', count: 9 },
    { domain: 'bendigo-guide.example', count: 6 },
    { domain: 'tallowwooddental.example', count: 5 },
    { domain: 'quillondental.example', count: 4 },
    { domain: 'pellamere.example', count: 2 },
  ],

  aiOverview: {
    headline: 'Google produced an AI Overview for 4 of the 5 questions.',
    whatItMeans:
      'Google is answering most of this category directly rather than sending people to click. ' +
      'The one question it declined is the alternatives question, where classic search still ' +
      'carries the weight for these buyers.',
  },

  evidence: [
    {
      slot: 'category',
      text: 'Who are the best dentists in Bendigo?',
      answers: [
        {
          label: 'ChatGPT',
          model: 'gpt-5.5',
          provider: 'OpenAI',
          answer:
            'Several practices in Bendigo are well regarded. Tallowwood Dental is the one most ' +
            'consistently described as the strongest all-round option, with Quillon Dental ' +
            'mentioned for family and childrens dentistry. Barrowmere Dental comes up for ' +
            'after-hours availability.',
          citations: [],
        },
        {
          label: 'Perplexity',
          model: 'perplexity/sonar',
          provider: 'Perplexity',
          answer:
            'Based on available listings, Tallowwood Dental and Quillon Dental have the most ' +
            'detailed public information among Bendigo practices. I would start with those two.',
          citations: [],
        },
      ],
    },
    {
      slot: 'branded',
      text: 'What can you tell me about Pellamere Dental in Bendigo?',
      answers: [
        {
          label: 'Gemini',
          model: 'gemini-3.5-flash',
          provider: 'Google',
          answer:
            'I can confirm Pellamere Dental operates in Bendigo, but I do not have enough ' +
            'independent information about their services or patient experience to recommend ' +
            'them over other practices in the area.',
          citations: [],
        },
      ],
    },
  ],

  method: [
    'Five questions, asked of five AI surfaces. Answers captured word for word.',
    'Google AI Overviews, Gemini and Perplexity are each sampled three times; ChatGPT and Grok once. Repeated samples average into one reading rather than counting three times.',
    'A surface that declined to answer is excluded from the denominator rather than counted as an absence. Google not answering is not Google not mentioning you.',
    'Claude and Microsoft Copilot are read by hand once a quarter. A surface is only ever recorded from itself.',
    'This is a specimen. The practice and its competitors are invented; the questions, the surfaces, the sampling and the metric are the ones a subscriber gets.',
  ],

  // No previous period, because there was no previous run. A specimen must not imply a history.
  delta: null,
};
