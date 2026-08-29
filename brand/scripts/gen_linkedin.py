import asyncio
from playwright.async_api import async_playwright
from gen_g import BASE
from gen_brand_social import grid_mark, lockup, THEMES

# LinkedIn, verified 29 Aug 2026:
#   company logo            400 x 400
#   company page cover     1128 x 191   (logo overlays the LEFT side)
#   personal background    1584 x 396   (profile photo overlays bottom LEFT)

T = THEMES['ink']


def company_logo(w=400):
    return f'''<div class="stage" style="background:{T['bg']};align-items:center;justify-content:center">
  <div style="display:flex;flex-direction:column;align-items:center;gap:26px">
    {grid_mark(54, 16, off=T['off'])}
    <div class="cond" style="color:{T['fg']};font-size:35px;line-height:1;
         letter-spacing:.03em;text-transform:uppercase">Word of Model</div>
  </div>
</div>'''


COMPANY_LINES = {
    'A': 'Is AI recommending you, or your competitor?',
    'B': 'What AI actually says about your business.',
}


def company_cover(key, w=1128, h=191):
    # left ~230px is covered by the page logo on desktop: start content after it
    return f'''<div class="stage" style="background:{T['bg']};position:relative">
  <div class="rule" style="height:4px"></div>
  <div style="position:absolute;left:250px;right:56px;top:0;bottom:0;
       display:flex;flex-direction:column;justify-content:center">
    <div class="cond" style="color:{T['fg']};font-size:38px;line-height:1.1">{COMPANY_LINES[key]}</div>
    <div style="height:12px"></div>
    <div class="eyebrow" style="color:var(--green);font-size:17px">Free scan &nbsp;·&nbsp; wordofmodel.ai</div>
  </div>
</div>'''


def personal_bg(w=1584, h=396):
    # profile photo overlaps bottom-left: keep that corner empty, weight right
    return f'''<div class="stage" style="background:{T['bg']};position:relative">
  <div class="rule" style="height:6px"></div>

  <div style="position:absolute;left:470px;right:80px;top:0;bottom:0;
       display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow" style="color:var(--green);font-size:20px">Word of Model</div>
    <div style="height:18px"></div>
    <div class="cond" style="color:{T['fg']};font-size:52px;line-height:1.12">
      Your buyers stopped Googling.<br>They started asking.
    </div>
    <div style="height:16px"></div>
    <div class="sans" style="color:{T['mute']};font-size:21px;line-height:1.35">
      I find out what the AIs actually say back — word for word.
    </div>
  </div>

  <div style="position:absolute;left:88px;top:50%;transform:translateY(-50%)">
    {grid_mark(40, 12, off=T['off'])}
  </div>
</div>'''


JOBS = [
    ('wom-li-logo-400',            400,  400, company_logo),
    ('wom-li-cover-A-1128x191',   1128,  191, lambda: company_cover('A')),
    ('wom-li-cover-B-1128x191',   1128,  191, lambda: company_cover('B')),
    ('wom-li-personal-1584x396',  1584,  396, personal_bg),
]


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, w, h, build in JOBS:
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            await pg.set_content(f"<style>{BASE}</style>{build()}")
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f"{name}.png")
            await pg.close()
            print("wrote", name + ".png")
        await b.close()

asyncio.run(main())
