import json, asyncio
from playwright.async_api import async_playwright

F = json.load(open('fonts.json'))

FONTCSS = """
@font-face{font-family:'PlexCond';src:url(data:font/woff2;base64,%(cond700)s) format('woff2');font-weight:700;font-display:block}
@font-face{font-family:'PlexCond';src:url(data:font/woff2;base64,%(cond600)s) format('woff2');font-weight:600;font-display:block}
@font-face{font-family:'PlexSans';src:url(data:font/woff2;base64,%(sans400)s) format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'PlexSans';src:url(data:font/woff2;base64,%(sans600)s) format('woff2');font-weight:600;font-display:block}
@font-face{font-family:'PlexMono';src:url(data:font/woff2;base64,%(mono500)s) format('woff2');font-weight:500;font-display:block}
""" % F

BASE = FONTCSS + """
*{margin:0;padding:0;box-sizing:border-box}
:root{--paper:#F7F6F2;--ink:#15171C;--soft:#5C5F68;--faint:#8E9199;--line:#DEDCD4;
      --red:#C8332B;--green:#2E7D5B;--yellow:#FFE566;--blue:#9BDBFF}
html,body{width:100%;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}
.stage{width:100%;height:100%;position:relative;display:flex;flex-direction:column}
.eyebrow{font-family:'PlexMono';font-weight:500;text-transform:uppercase;letter-spacing:.14em}
.cond{font-family:'PlexCond';font-weight:700;letter-spacing:-.012em}
.sans{font-family:'PlexSans'}
.mono{font-family:'PlexMono';font-weight:500}
.rule{position:absolute;left:0;right:0;top:0;background:var(--ink)}
.bars{display:flex}
"""


def bars(*a, **k):
    raise RuntimeError(
        "bars() is the retired five-in-a-row mark. "
        "Use grid_mark() from gen_brand_social. See brand/README.md."
    )


def lockup(scale, colour, sub_colour):
    """Bottom-left brand lockup: five bars + wordmark."""
    return f'''
    <div style="display:flex;align-items:center;gap:{int(18*scale)}px">
      {bars(int(14*scale), int(6*scale), 'var(--green)', colour if colour=='var(--line)' else '#3A3D45')}
      <div class="cond" style="color:{colour};font-size:{int(34*scale)}px;line-height:1;letter-spacing:.01em">WORD OF MODEL</div>
    </div>'''


# ---------------------------------------------------------------- HOOK A
def hook_a(w, h, pad, eyebrow_size, head_size, box_size, sub_size, foot_size, gap1, gap2, gap3, top_pad, bottom_pad, col=None):
    return f'''<div class="stage" style="background:var(--paper);padding:{top_pad}px {pad}px {bottom_pad}px">
  <div class="rule" style="height:{int((col or w)*0.011)}px"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow" style="color:var(--faint);font-size:{eyebrow_size}px">The one minute version</div>
    <div style="height:{gap1}px"></div>

    <div class="cond" style="color:var(--ink);font-size:{head_size}px;line-height:.98">
      Go and ask<br>ChatGPT yourself.
    </div>
    <div style="height:{gap2}px"></div>

    <div style="border:{max(2,int((col or w)*0.003))}px solid var(--ink);background:#fff;padding:{int(box_size*0.85)}px {int(box_size*0.95)}px">
      <div class="mono" style="color:var(--ink);font-size:{box_size}px;line-height:1.35">who&rsquo;s the best [your&nbsp;category]<br>in [your&nbsp;city]?<i style="width:{int(box_size*0.48)}px;height:{int(box_size*0.95)}px;background:var(--green);display:inline-block;margin-left:{int(box_size*0.4)}px;transform:translateY({int(box_size*0.1)}px)"></i></div>
    </div>
    <div style="height:{gap3}px"></div>

    <div class="sans" style="color:var(--soft);font-size:{sub_size}px;line-height:1.35;max-width:{int(w-pad*2.2)}px">
      Most owners have never done it. Then ask whether the answer named you,
      and whether it recommended you. They are not the same thing.
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between">
    {lockup((col or w)/1080, 'var(--ink)', 'var(--soft)')}
    <div class="eyebrow" style="color:var(--green);font-size:{foot_size}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


# ---------------------------------------------------------------- HOOK C
def redact(widths, h, colour='var(--line)'):
    return ''.join(f'<i style="width:{x}px;height:{h}px;background:{colour};display:inline-block;border-radius:{int(h*0.15)}px"></i>' for x in widths)


def hook_c(w, h, pad, eyebrow_size, head_size, card_pad, row_size, sub_size, foot_size, gap1, gap2, gap3, top_pad, bottom_pad, col=None):
    rh = int(row_size * 0.82)
    row_gap = int(row_size * 1.5)
    return f'''<div class="stage" style="background:var(--ink);padding:{top_pad}px {pad}px {bottom_pad}px">
  <div class="rule" style="height:{int((col or w)*0.011)}px;background:var(--green)"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow" style="color:var(--green);font-size:{eyebrow_size}px">Right now</div>
    <div style="height:{gap1}px"></div>

    <div class="cond" style="color:var(--paper);font-size:{head_size}px;line-height:.98">
      Somebody in your<br>category is being<br>recommended.
    </div>
    <div style="height:{gap2}px"></div>

    <div style="background:var(--paper);padding:{card_pad}px">
      <div class="eyebrow" style="color:var(--faint);font-size:{int(row_size*0.62)}px">What the answer looks like</div>
      <div style="height:{int(card_pad*0.62)}px"></div>

      <div style="display:flex;align-items:center;gap:{int(row_size*0.7)}px;margin-bottom:{row_gap}px">
        <div class="mono" style="color:var(--ink);font-size:{row_size}px">1.</div>
        {redact([int(row_size*4.4), int(row_size*2.6)], rh, 'var(--ink)')}
        <div class="mono" style="color:var(--green);font-size:{int(row_size*0.72)}px;letter-spacing:.06em">RECOMMENDED</div>
      </div>
      <div style="display:flex;align-items:center;gap:{int(row_size*0.7)}px;margin-bottom:{row_gap}px">
        <div class="mono" style="color:var(--soft);font-size:{row_size}px">2.</div>
        {redact([int(row_size*3.1), int(row_size*3.4)], rh)}
      </div>
      <div style="display:flex;align-items:center;gap:{int(row_size*0.7)}px">
        <div class="mono" style="color:var(--soft);font-size:{row_size}px">3.</div>
        {redact([int(row_size*3.8), int(row_size*2.1)], rh)}
      </div>

      <div style="height:{int(card_pad*0.8)}px"></div>
      <div style="border-top:2px solid var(--line);height:{int(card_pad*0.7)}px"></div>
      <div class="sans" style="color:var(--ink);font-size:{int(row_size*0.86)}px;font-weight:600">You were not in this answer.</div>
    </div>
    <div style="height:{gap3}px"></div>

    <div class="sans" style="color:#A9ACB4;font-size:{sub_size}px;line-height:1.35;max-width:{int(w-pad*2.2)}px">
      It might be you. Usually it isn&rsquo;t. We send back the real answer, word for word.
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between">
    {lockup((col or w)/1080, 'var(--paper)', 'var(--faint)')}
    <div class="eyebrow" style="color:var(--green);font-size:{foot_size}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


JOBS = [
    ("wom-ad-A-selfcheck-1080x1080", 1080, 1080,
     hook_a(1080, 1080, pad=86, eyebrow_size=25, head_size=112, box_size=32, sub_size=30,
            foot_size=22, gap1=34, gap2=42, gap3=44, top_pad=86, bottom_pad=76)),

    ("wom-ad-A-selfcheck-1080x1920", 1080, 1920,
     hook_a(1080, 1920, pad=92, eyebrow_size=28, head_size=132, box_size=38, sub_size=34,
            foot_size=24, gap1=44, gap2=56, gap3=56, top_pad=340, bottom_pad=420)),

    ("wom-ad-C-rival-1080x1080", 1080, 1080,
     hook_c(1080, 1080, pad=86, eyebrow_size=24, head_size=88, card_pad=32, row_size=25,
            sub_size=26, foot_size=22, gap1=24, gap2=32, gap3=34, top_pad=76, bottom_pad=76)),

    ("wom-ad-C-rival-1080x1920", 1080, 1920,
     hook_c(1080, 1920, pad=92, eyebrow_size=27, head_size=100, card_pad=38, row_size=30,
            sub_size=29, foot_size=24, gap1=34, gap2=42, gap3=42, top_pad=340, bottom_pad=420)),

    ("wom-ad-A-selfcheck-1080x1350", 1080, 1350,
     hook_a(1080, 1350, pad=88, eyebrow_size=26, head_size=120, box_size=34, sub_size=32,
            foot_size=23, gap1=38, gap2=48, gap3=48, top_pad=92, bottom_pad=84)),

    ("wom-ad-C-rival-1080x1350", 1080, 1350,
     hook_c(1080, 1350, pad=88, eyebrow_size=25, head_size=96, card_pad=34, row_size=27,
            sub_size=27, foot_size=23, gap1=28, gap2=36, gap3=36, top_pad=84, bottom_pad=80)),

    ("wom-ad-A-selfcheck-1920x1080", 1920, 1080,
     hook_a(1920, 1080, pad=380, eyebrow_size=25, head_size=104, box_size=31, sub_size=29,
            foot_size=22, gap1=32, gap2=40, gap3=42, top_pad=90, bottom_pad=80, col=1160)),

    ("wom-ad-C-rival-1920x1080", 1920, 1080,
     hook_c(1920, 1080, pad=380, eyebrow_size=24, head_size=86, card_pad=30, row_size=24,
            sub_size=25, foot_size=22, gap1=24, gap2=32, gap3=32, top_pad=80, bottom_pad=76, col=1160)),
]


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, w, h, body in JOBS:
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            await pg.set_content(f"<style>{BASE}</style>{body}")
            await pg.wait_for_timeout(450)
            await pg.screenshot(path=f"{name}.png")
            await pg.close()
            print("wrote", name, w, h)
        await b.close()

asyncio.run(main())
