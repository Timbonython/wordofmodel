import json, asyncio
from playwright.async_api import async_playwright

F = json.load(open('fonts.json'))

FONTCSS = """
@font-face{font-family:'PlexCond';src:url(data:font/woff2;base64,%(cond700)s) format('woff2');font-weight:700;font-display:block}
@font-face{font-family:'PlexSans';src:url(data:font/woff2;base64,%(sans400)s) format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'PlexSans';src:url(data:font/woff2;base64,%(sans600)s) format('woff2');font-weight:600;font-display:block}
@font-face{font-family:'PlexMono';src:url(data:font/woff2;base64,%(mono500)s) format('woff2');font-weight:500;font-display:block}
""" % F

BASE = FONTCSS + """
*{margin:0;padding:0;box-sizing:border-box}
:root{--paper:#F7F6F2;--ink:#15171C;--soft:#5C5F68;--faint:#8E9199;--line:#DEDCD4;--green:#2E7D5B}
html,body{width:100%;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}
.stage{width:100%;height:100%;position:relative;display:flex;flex-direction:column}
.eyebrow{font-family:'PlexMono';font-weight:500;text-transform:uppercase;letter-spacing:.14em}
.cond{font-family:'PlexCond';font-weight:700;letter-spacing:-.012em}
.sans{font-family:'PlexSans'}
.rule{position:absolute;left:0;right:0;top:0;background:var(--green)}
.row{display:flex}
"""


def bars(size, gap, on_colour, off_colour, on_index=0, n=5):
    out = []
    for i in range(n):
        c = on_colour if i == on_index else off_colour
        out.append(f'<i style="width:{size}px;height:{size}px;background:{c};display:block"></i>')
    return f'<div class="row" style="gap:{gap}px">' + ''.join(out) + '</div>'


def lockup(scale, colour):
    return f'''
    <div style="display:flex;align-items:center;gap:{int(18*scale)}px">
      {bars(int(14*scale), int(6*scale), 'var(--green)', '#3A3D45')}
      <div class="cond" style="color:{colour};font-size:{int(34*scale)}px;line-height:1;letter-spacing:.01em">WORD OF MODEL</div>
    </div>'''


def bubble(text, msg_size, pad, maxw, side, idx=''):
    """side 'in' = them (paper), 'out' = us (green)."""
    if side == 'in':
        bg, fg = 'var(--paper)', 'var(--ink)'
        radius = f'{int(msg_size*1.1)}px {int(msg_size*1.1)}px {int(msg_size*1.1)}px {int(msg_size*0.22)}px'
        align = 'flex-start'
    else:
        bg, fg = 'var(--green)', 'var(--paper)'
        radius = f'{int(msg_size*1.1)}px {int(msg_size*1.1)}px {int(msg_size*0.22)}px {int(msg_size*1.1)}px'
        align = 'flex-end'
    return f'''<div style="display:flex;justify-content:{align}">
      <div {idx} class="sans" style="background:{bg};color:{fg};font-size:{msg_size}px;line-height:1.34;
           font-weight:400;padding:{int(pad*0.78)}px {pad}px;border-radius:{radius};max-width:{maxw}px">{text}</div>
    </div>'''


def dots(msg_size, pad, idx=''):
    d = int(msg_size * 0.30)
    one = f'<i style="width:{d}px;height:{d}px;border-radius:50%;background:var(--faint);display:block"></i>'
    return f'''<div {idx} style="display:flex;justify-content:flex-start">
      <div style="background:var(--paper);padding:{int(pad*0.86)}px {pad}px;
           border-radius:{int(msg_size*1.1)}px {int(msg_size*1.1)}px {int(msg_size*1.1)}px {int(msg_size*0.22)}px;
           display:flex;gap:{int(d*0.62)}px;align-items:center">{one}{one}{one}</div>
    </div>'''


# ---------------------------------------------------------------- HOOK G
def hook_g(w, h, pad, eyebrow_size, msg_size, bubble_pad, gap_msg, sub_size, foot_size,
           gap1, gap3, top_pad, bottom_pad, col=None, ids=False):
    C = col or w
    maxw = int(C * 0.80)

    def i(n):
        return f'id="b{n}"' if ids else ''

    return f'''<div class="stage" style="background:var(--ink);padding:{top_pad}px {pad}px {bottom_pad}px">
  <div class="rule" style="height:{int(C*0.011)}px"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow" style="color:var(--green);font-size:{eyebrow_size}px" {i(0)}>Roughly how it goes</div>
    <div style="height:{gap1}px"></div>

    {bubble('AI recommended my sh*t competitor?!!', msg_size, bubble_pad, maxw, 'in', i(1))}
    <div style="height:{gap_msg}px"></div>
    {bubble('Why?', msg_size, bubble_pad, maxw, 'in', i(2))}
    <div style="height:{int(gap_msg*1.7)}px"></div>
    {bubble('Fair question. We send back the actual answer, word for word.', msg_size, bubble_pad, maxw, 'out', i(3))}

    <div style="height:{gap3}px"></div>
    <div class="sans" style="color:#A9ACB4;font-size:{sub_size}px;line-height:1.35;max-width:{int(C*0.86)}px" {i(4)}>
      Free scan. One question your buyers actually type, two AI engines, no account.
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between">
    {lockup(C/1080, 'var(--paper)')}
    <div class="eyebrow" style="color:var(--green);font-size:{foot_size}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


SPECS = [
    ("1080x1080", 1080, 1080, dict(pad=86, eyebrow_size=24, msg_size=38, bubble_pad=30, gap_msg=14,
                                   sub_size=26, foot_size=22, gap1=34, gap3=40, top_pad=80, bottom_pad=76)),
    ("1080x1350", 1080, 1350, dict(pad=88, eyebrow_size=25, msg_size=42, bubble_pad=33, gap_msg=16,
                                   sub_size=28, foot_size=23, gap1=40, gap3=48, top_pad=88, bottom_pad=82)),
    ("1080x1920", 1080, 1920, dict(pad=88, eyebrow_size=29, msg_size=52, bubble_pad=40, gap_msg=20,
                                   sub_size=32, foot_size=25, gap1=52, gap3=62, top_pad=340, bottom_pad=400)),
    ("1920x1080", 1920, 1080, dict(pad=380, eyebrow_size=26, msg_size=43, bubble_pad=34, gap_msg=16,
                                   sub_size=28, foot_size=23, gap1=40, gap3=48, top_pad=84, bottom_pad=78, col=1160)),
]


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, w, h, kw in SPECS:
            body = hook_g(w, h, **kw)
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            await pg.set_content(f"<style>{BASE}</style>{body}")
            await pg.wait_for_timeout(450)
            out = f"wom-ad-G-outburst-{name}.png"
            await pg.screenshot(path=out)
            await pg.close()
            print("wrote", out)
        await b.close()

if __name__ == '__main__':
    asyncio.run(main())
