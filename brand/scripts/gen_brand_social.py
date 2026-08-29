import asyncio
from playwright.async_api import async_playwright
from gen_g import BASE

# ---------------------------------------------------------------- the mark
# 3 squares top row, 2 squares bottom row, left aligned. Top-left is green.
def grid_mark(sq, gap, on='var(--green)', off='#3A3D45'):
    def cell(c):
        return f'<i style="width:{sq}px;height:{sq}px;background:{c};display:block"></i>'
    top = ''.join([cell(on), cell(off), cell(off)])
    bot = ''.join([cell(off), cell(off)])
    return f'''<div style="display:flex;flex-direction:column;gap:{gap}px">
      <div style="display:flex;gap:{gap}px">{top}</div>
      <div style="display:flex;gap:{gap}px">{bot}</div>
    </div>'''


def lockup(sq, gap, text_size, colour, off='#3A3D45'):
    return f'''<div style="display:flex;align-items:center;gap:{int(sq*1.5)}px">
      {grid_mark(sq, gap, off=off)}
      <div class="cond" style="color:{colour};font-size:{text_size}px;line-height:1;
           letter-spacing:.02em;text-transform:uppercase">Word of Model</div>
    </div>'''


# ---------------------------------------------------------------- covers
# Facebook page cover. Upload 1640x624.
# Desktop crops to 820x312 and the profile picture overlaps the BOTTOM LEFT,
# so nothing important goes in the lower-left quadrant.
# Mobile crops the sides, so everything stays inside the central ~78%.

COPY = {
    'A': {
        'eyebrow': 'Free scan &nbsp;·&nbsp; No account',
        'h1': 'Is AI recommending you,',
        'h2': 'or your competitor?',
        'url': 'wordofmodel.ai',
    },
    'B': {
        'eyebrow': 'Free scan &nbsp;·&nbsp; No account',
        'h1': 'Your buyers stopped Googling.',
        'h2': 'They started asking ChatGPT.',
        'url': 'wordofmodel.ai',
    },
    'C': {
        'eyebrow': 'Free scan &nbsp;·&nbsp; No account',
        'h1': 'Find out what AI tells',
        'h2': 'your buyers about you.',
        'url': 'wordofmodel.ai',
    },
}

THEMES = {
    'ink':   dict(bg='#15171C', fg='#F7F6F2', mute='#A9ACB4', off='#3A3D45'),
    'paper': dict(bg='#F7F6F2', fg='#15171C', mute='#5C5F68', off='#DEDCD4'),
}


def cover(key, theme, w=1640, h=624):
    c, t = COPY[key], THEMES[theme]
    return f'''<div class="stage" style="background:{t['bg']};position:relative">
  <div class="rule" style="height:8px"></div>

  <!-- safe block: centred, lifted clear of the bottom-left profile overlap -->
  <div style="position:absolute;left:180px;right:180px;top:0;bottom:96px;
       display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div class="eyebrow" style="color:var(--green);font-size:26px">{c['eyebrow']}</div>
    <div style="height:26px"></div>
    <div class="cond" style="color:{t['fg']};font-size:84px;line-height:1.06">{c['h1']}</div>
    <div class="cond" style="color:{t['fg']};font-size:84px;line-height:1.06">{c['h2']}</div>
    <div style="height:26px"></div>
    <div class="eyebrow" style="color:{t['mute']};font-size:27px;letter-spacing:.08em">{c['url']}</div>
  </div>

  <!-- lockup bottom right: the profile picture sits bottom left on desktop -->
  <div style="position:absolute;right:72px;bottom:56px">
    {lockup(20, 7, 30, t['fg'], off=t['off'])}
  </div>
</div>'''


# ---------------------------------------------------------------- profile
def profile(theme, w=500):
    t = THEMES[theme]
    return f'''<div class="stage" style="background:{t['bg']};align-items:center;justify-content:center">
  <div style="display:flex;flex-direction:column;align-items:center;gap:34px">
    {grid_mark(68, 20, off=t['off'])}
    <div class="cond" style="color:{t['fg']};font-size:44px;line-height:1;
         letter-spacing:.03em;text-transform:uppercase">Word of Model</div>
  </div>
</div>'''


JOBS = [
    ('wom-fb-cover-A-ink',    1640, 624, lambda: cover('A', 'ink')),
    ('wom-fb-cover-A-paper',  1640, 624, lambda: cover('A', 'paper')),
    ('wom-fb-cover-B-ink',    1640, 624, lambda: cover('B', 'ink')),
    ('wom-fb-cover-C-ink',    1640, 624, lambda: cover('C', 'ink')),
    ('wom-fb-profile-ink',     500, 500, lambda: profile('ink')),
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
