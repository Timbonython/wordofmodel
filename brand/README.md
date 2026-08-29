# Word of Model — brand render kit

Everything that produced the Facebook, LinkedIn, ad and favicon assets. Self-contained: the fonts are embedded, so this runs anywhere with Python and Playwright and needs no network.

**Keep this.** Without it, changing a headline or adding a size means rebuilding the whole thing from scratch.

---

## Setup

```bash
pip install playwright pillow
playwright install chromium      # or point at an existing chromium binary
```

`ffmpeg` is required for the video scripts only.

---

## Files

| Script | Produces |
|---|---|
| `gen_g.py` | Hook G "outburst" statics, 4 ratios. Also **the shared base** — `BASE` (CSS + fonts), `bubble()`, `dots()`, `lockup()`, `bars()`. Everything else imports from it. |
| `gen_g_video.py` | Hook G videos, 4 ratios. Deterministic `setT(t)` timeline, 30fps, 9s. |
| `gen_ads.py` | Hook A (self-check) and C (rival) statics |
| `gen_video.py`, `gen_video45.py`, `gen_video169.py` | Hook A and C videos at 1:1, 4:5, 16:9 |
| `gen_brand_social.py` | Facebook cover (3 copy options × ink/paper) and profile. Defines `grid_mark()`, `lockup()`, `THEMES`. |
| `gen_linkedin.py` | LinkedIn company logo 400×400, page cover 1128×191, personal background 1584×396 |
| `gen_favicon.py` | Favicon set. `python3 gen_favicon.py q` for the quotation mark, `w` for the W variant. **Both are retired** — the live mark is the 2+1 grid generated in the app. Kept for history. |
| `fonts.json` | IBM Plex Condensed 700/600, Sans 400/600, Mono 500, base64 woff2. Required by every script. |

Run any of them from this directory:

```bash
python3 gen_brand_social.py
python3 gen_linkedin.py
python3 gen_g.py
python3 gen_g_video.py            # all four ratios
python3 gen_g_video.py 1080x1350  # just one
```

---

## The brand system, as the code expresses it

```
--paper   #F7F6F2      --green   #2E7D5B
--ink     #15171C      --soft    #5C5F68     on paper
--line    #DEDCD4      --mute    #A9ACB4     on ink
--faint   #8E9199      cell-dark #3A3D45     inactive cells on ink
```

Type: IBM Plex Condensed 700 for headlines and the wordmark, Plex Sans 400/600 for body, Plex Mono 500 uppercase with `.14em` tracking for eyebrows and labels. The mono eyebrow is the system's signature.

**The mark is the 3+2 grid** — three cells top, two bottom, left aligned, top-left green. `grid_mark()` in `gen_brand_social.py`. At 16–32px use a reduced 2+1 of the same shape; never the full five, and never the retired quotation mark.

Green is a scalpel. One accent per view. A page with a green button, a green rule, a green heading and a green icon has no accent, it has a second body colour.

---

## Two things the code knows that the brief doesn't

Both are deliberate departures from §2 of the site brief, documented here and in the CSS:

1. **Green on one word, not a panel** — in the site's thesis line. Still true: `.thesis-lit` sets `color: var(--green)` on the single word *machine*.
2. **Nav links are tracked below the spec's `.14em`** — the spec's tracking is written for short eyebrows sitting on their own line, and at nav length it hurts scanning and costs width.

Same underlying correction: the type spec was written for labels, and it doesn't quite hold at nav length or paragraph scale.

### The nav number moved again on 29 Aug 2026, and this note is why it is not `.11em`

This file recorded `.11em`, which was correct while the nav was **IBM Plex Mono**. The bar was
then rebuilt in **IBM Plex Sans Condensed 600** at `var(--ink)`, because mono at `var(--soft)`
was identical in family, colour and size to the page caption sitting directly beneath it and the
menu read as a byline. Condensed is a narrower face and needs less tracking to read as caps, so
the nav is now **`.08em` at 13px on desktop and 11px on a phone**.

The reasoning above is unchanged - the number is not the decision, the departure from `.14em` is.
Anybody restoring `.11em` from an older copy of this file would be reverting a fix rather than
correcting a drift.

`app/globals.css` carries the same note against `.sitenav-links`, and `brandcheck` enforces the
palette in this kit against `lib/brand.ts`. **Nothing enforces a tracking value**, so this
paragraph is the only thing standing between the current bar and a well-meaning tidy-up.

---

## Safe areas that are easy to get wrong

- **Facebook cover** 1640×624 — the profile picture overlaps bottom-left on desktop, and the sides crop on mobile. Content is centred and inset accordingly.
- **LinkedIn page cover** 1128×191 — the company logo overlays the left. `gen_linkedin.py` starts content at x=250 for this reason.
- **LinkedIn personal** 1584×396 — the profile photo overlaps bottom-left. The mark currently sits at x=88 and **may be partly covered**; check it on a real profile before trusting it.

---

## Ad creative note

The four live ad creatives still carry the **old five-in-a-row lockup**, not the 3+2 grid. That was deliberate — the brief said change it at the next creative render rather than re-uploading mid-flight. Whoever renders the next ad should use `grid_mark()` from `gen_brand_social.py` instead of `bars()` from `gen_g.py`.

**Still outstanding as of 30 Aug 2026.** Nothing has been re-rendered since the kit was written,
so every live creative is still on the old lockup. `bars()` is what `gen_g.py` calls, and it is
still the function the ad scripts reach for - which means the next render reproduces the old mark
unless somebody changes the call deliberately. This is the one thing in this kit that a
`brandcheck` run cannot catch: the mark is drawn by geometry, not by a colour token.

## What is enforced, and what is only written down

`npm run brandcheck` in the site repo now reads this kit. It checks that **every hex literal in
`scripts/*.py` is a colour in `lib/brand.ts`**, and that the palette block above matches it too -
so the palette exists in four places and disagreeing in any of them fails the build.

It does **not** check tracking, type sizes, the lockup geometry, or the safe areas below. Those
are prose, and prose is what drifted last time.
