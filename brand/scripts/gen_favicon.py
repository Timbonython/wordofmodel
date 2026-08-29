import json, asyncio, sys
from playwright.async_api import async_playwright
from PIL import Image

F = json.load(open('fonts.json'))

FONTCSS = """
@font-face{font-family:'PlexCond';src:url(data:font/woff2;base64,%(cond700)s) format('woff2');font-weight:700;font-display:block}
""" % F

HEAD = f"""<style>{FONTCSS}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:100%;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}}
.sq{{width:100%;height:100%;background:#15171C;display:flex;align-items:center;justify-content:center}}
</style>"""


def mark_w(S, ps=1.0):
    font = round(S * 0.55 * ps)
    bar_w = round(S * 0.40 * ps)
    bar_h = max(2, round(S * 0.085 * ps))
    gap = max(1, round(S * 0.10 * ps))
    return HEAD + f"""<div class="sq"><div style="display:flex;flex-direction:column;align-items:center">
      <div style="font-family:'PlexCond';font-weight:700;color:#F7F6F2;font-size:{font}px;
                  line-height:.78;letter-spacing:-.02em">W</div>
      <div style="height:{gap}px"></div>
      <div style="width:{bar_w}px;height:{bar_h}px;background:#2E7D5B"></div>
    </div></div>"""


def mark_q(S, ps=1.0):
    """Open quotation mark. Word of Model is word of mouth, and two thick commas
    survive 16px in a way four diagonal strokes never will."""
    font = round(S * 1.62 * ps)
    # the glyph's ink sits in the top third of its em box, so nudge it back to optical centre
    drop = round(font * 0.255)
    return HEAD + f"""<div class="sq"><div style="position:relative;width:{S}px;height:{S}px">
      <div style="position:absolute;left:50%;top:50%;
                  transform:translate(-50%,-50%) translateY({drop}px);
                  font-family:'PlexCond';font-weight:700;color:#F7F6F2;font-size:{font}px;
                  line-height:1;letter-spacing:-.06em;white-space:nowrap">&ldquo;</div>
    </div></div>"""


VARIANTS = {'w': mark_w, 'q': mark_q}
SIZES = [(512, 'icon1.png', 1.0), (192, 'icon.png', 1.0), (180, 'apple-icon.png', 0.88),
         (48, 'ico-48.png', 1.0), (32, 'ico-32.png', 1.0), (16, 'ico-16.png', 1.02)]


async def main(which):
    fn = VARIANTS[which]
    pre = f"{which}-"
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=[
            "--disable-lcd-text", "--disable-font-subpixel-positioning",
            "--force-color-profile=srgb"])
        for S, name, ps in SIZES:
            pg = await b.new_page(viewport={'width': S, 'height': S}, device_scale_factor=1)
            await pg.set_content(fn(S, ps))
            await pg.wait_for_timeout(350)
            await pg.screenshot(path=pre + name)
            await pg.close()
        await b.close()

    ims = [Image.open(f'{pre}ico-{s}.png').convert('RGBA') for s in (16, 32, 48)]
    ims[2].save(f'{pre}favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
                append_images=[ims[0], ims[1]])

    TILE, GAP = 288, 24
    srcs = [16, 32, 48, 180]
    sheet = Image.new('RGB', (len(srcs) * TILE + (len(srcs) + 1) * GAP, TILE + 2 * GAP), '#DEDCD4')
    for i, s in enumerate(srcs):
        f = f'{pre}apple-icon.png' if s == 180 else f'{pre}ico-{s}.png'
        sheet.paste(Image.open(f).convert('RGB').resize((TILE, TILE), Image.NEAREST),
                    (GAP + i * (TILE + GAP), GAP))
    sheet.save(f'{pre}proof.png')
    print("wrote", which)

asyncio.run(main(sys.argv[1]))
