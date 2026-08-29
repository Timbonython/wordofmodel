import json, asyncio, os, shutil, subprocess
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
.rule{position:absolute;left:0;right:0;top:0;transform-origin:left center}
.bars{display:flex}
.anim{opacity:0}
"""

JS = """
function clamp(x){return x<0?0:(x>1?1:x)}
function seg(t,a,b){return clamp((t-a)/(b-a))}
function ease(x){return 1-Math.pow(1-x,3)}
function E(id){return document.getElementById(id)}
function rise(id,t,a,b,dy){var p=ease(seg(t,a,b));var e=E(id);if(!e)return;
  e.style.opacity=p;e.style.transform='translateY('+((1-p)*dy).toFixed(2)+'px)';}
function wipe(id,t,a,b){var p=ease(seg(t,a,b));var e=E(id);if(!e)return;
  e.style.opacity=1;e.style.transform='scaleX('+p.toFixed(4)+')';}
function pop(id,t,a,b){var p=ease(seg(t,a,b));var e=E(id);if(!e)return;
  e.style.opacity=p;e.style.transform='scale('+(0.86+0.14*p).toFixed(4)+')';}
"""


def lockup(*a, **k):
    raise RuntimeError(
        "lockup() here inlines the retired five-in-a-row mark. "
        "Use grid_mark() from gen_brand_social. See brand/README.md."
    )


# ============================================================ HOOK A (video)
A_TIMELINE = """
var Q = "who\\u2019s the best [your category]\\nin [your city]?";
var TYPE_A = 1.90, TYPE_B = 4.60;
function setT(t){
  wipe('rule', t, 0.00, 0.55);
  rise('eyebrow', t, 0.35, 0.85, 14);
  rise('h1',      t, 0.55, 1.10, 26);
  rise('h2',      t, 0.72, 1.27, 26);
  rise('box',     t, 1.30, 1.85, 18);
  var n = Math.floor(seg(t, TYPE_A, TYPE_B) * Q.length);
  var s = Q.slice(0, n).replace(/\\n/g, '<br>');
  var done = n >= Q.length;
  var show = t < TYPE_A ? false : (done ? (Math.floor((t - TYPE_B) * 1.9) % 2 === 0) : true);
  E('q').innerHTML = s + (show ? '<i class="caret"></i>' : '');
  rise('sub',  t, 4.85, 5.50, 16);
  rise('foot', t, 5.75, 6.35, 14);
}
"""


def hook_a(w, h, pad, eyebrow_size, head_size, box_size, sub_size, foot_size,
           gap1, gap2, gap3, top_pad, bottom_pad, col=None):
    caret_css = f"""
    .caret{{display:inline-block;width:{int(box_size*0.48)}px;height:{int(box_size*0.95)}px;
      background:var(--green);margin-left:{int(box_size*0.28)}px;
      transform:translateY({int(box_size*0.1)}px)}}"""
    return caret_css, f'''<div class="stage" style="background:var(--paper);padding:{top_pad}px {pad}px {bottom_pad}px">
  <div class="rule" id="rule" style="height:{int((col or w)*0.011)}px;background:var(--ink);opacity:0"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow anim" id="eyebrow" style="color:var(--faint);font-size:{eyebrow_size}px">The one minute version</div>
    <div style="height:{gap1}px"></div>

    <div class="cond anim" id="h1" style="color:var(--ink);font-size:{head_size}px;line-height:.98">Go and ask</div>
    <div class="cond anim" id="h2" style="color:var(--ink);font-size:{head_size}px;line-height:.98">ChatGPT yourself.</div>
    <div style="height:{gap2}px"></div>

    <div class="anim" id="box" style="border:{max(2,int((col or w)*0.003))}px solid var(--ink);background:#fff;padding:{int(box_size*0.85)}px {int(box_size*0.95)}px;min-height:{int(box_size*4.4)}px">
      <div class="mono" id="q" style="color:var(--ink);font-size:{box_size}px;line-height:1.35"></div>
    </div>
    <div style="height:{gap3}px"></div>

    <div class="sans anim" id="sub" style="color:var(--soft);font-size:{sub_size}px;line-height:1.35;max-width:{int(w-pad*2.2)}px">
      Most owners have never done it. Then ask whether the answer named you,
      and whether it recommended you. They are not the same thing.
    </div>
  </div>

  <div class="anim" id="foot" style="display:flex;align-items:center;justify-content:space-between">
    {lockup((col or w)/1080, 'var(--ink)')}
    <div class="eyebrow" style="color:var(--green);font-size:{foot_size}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


# ============================================================ HOOK C (video)
C_TIMELINE = """
function setT(t){
  wipe('rule', t, 0.00, 0.55);
  rise('eyebrow', t, 0.35, 0.85, 14);
  rise('h1', t, 0.55, 1.10, 26);
  rise('h2', t, 0.72, 1.27, 26);
  rise('h3', t, 0.89, 1.44, 26);
  rise('card',  t, 1.55, 2.05, 20);
  rise('clab',  t, 1.90, 2.30, 10);
  rise('row1',  t, 2.20, 2.60, 12);
  pop ('stamp', t, 2.75, 3.05);
  rise('row2',  t, 3.15, 3.55, 12);
  rise('row3',  t, 3.60, 4.00, 12);
  wipe('divider', t, 4.25, 4.70);
  rise('notin', t, 4.80, 5.30, 12);
  rise('sub',   t, 5.60, 6.15, 14);
  rise('foot',  t, 6.45, 7.05, 14);
}
"""


def redact(widths, h, colour='var(--line)'):
    return ''.join(
        f'<i style="width:{x}px;height:{h}px;background:{colour};display:inline-block;border-radius:{int(h*0.15)}px"></i>'
        for x in widths)


def hook_c(w, h, pad, eyebrow_size, head_size, card_pad, row_size, sub_size, foot_size,
           gap1, gap2, gap3, top_pad, bottom_pad, col=None):
    rh = int(row_size * 0.82)
    row_gap = int(row_size * 1.5)
    return "", f'''<div class="stage" style="background:var(--ink);padding:{top_pad}px {pad}px {bottom_pad}px">
  <div class="rule" id="rule" style="height:{int((col or w)*0.011)}px;background:var(--green);opacity:0"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow anim" id="eyebrow" style="color:var(--green);font-size:{eyebrow_size}px">Right now</div>
    <div style="height:{gap1}px"></div>

    <div class="cond anim" id="h1" style="color:var(--paper);font-size:{head_size}px;line-height:.98">Somebody in your</div>
    <div class="cond anim" id="h2" style="color:var(--paper);font-size:{head_size}px;line-height:.98">category is being</div>
    <div class="cond anim" id="h3" style="color:var(--paper);font-size:{head_size}px;line-height:.98">recommended.</div>
    <div style="height:{gap2}px"></div>

    <div class="anim" id="card" style="background:var(--paper);padding:{card_pad}px">
      <div class="eyebrow anim" id="clab" style="color:var(--faint);font-size:{int(row_size*0.62)}px">What the answer looks like</div>
      <div style="height:{int(card_pad*0.62)}px"></div>

      <div class="anim" id="row1" style="display:flex;align-items:center;gap:{int(row_size*0.7)}px;margin-bottom:{row_gap}px">
        <div class="mono" style="color:var(--ink);font-size:{row_size}px">1.</div>
        {redact([int(row_size*4.4), int(row_size*2.6)], rh, 'var(--ink)')}
        <div class="mono anim" id="stamp" style="color:var(--green);font-size:{int(row_size*0.72)}px;letter-spacing:.06em;transform-origin:left center">RECOMMENDED</div>
      </div>
      <div class="anim" id="row2" style="display:flex;align-items:center;gap:{int(row_size*0.7)}px;margin-bottom:{row_gap}px">
        <div class="mono" style="color:var(--soft);font-size:{row_size}px">2.</div>
        {redact([int(row_size*3.1), int(row_size*3.4)], rh)}
      </div>
      <div class="anim" id="row3" style="display:flex;align-items:center;gap:{int(row_size*0.7)}px">
        <div class="mono" style="color:var(--soft);font-size:{row_size}px">3.</div>
        {redact([int(row_size*3.8), int(row_size*2.1)], rh)}
      </div>

      <div style="height:{int(card_pad*0.8)}px"></div>
      <div id="divider" style="height:2px;background:var(--line);transform-origin:left center;transform:scaleX(0);opacity:0"></div>
      <div style="height:{int(card_pad*0.7)}px"></div>
      <div class="sans anim" id="notin" style="color:var(--ink);font-size:{int(row_size*0.86)}px;font-weight:600">You were not in this answer.</div>
    </div>
    <div style="height:{gap3}px"></div>

    <div class="sans anim" id="sub" style="color:#A9ACB4;font-size:{sub_size}px;line-height:1.35;max-width:{int(w-pad*2.2)}px">
      It might be you. Usually it isn&rsquo;t. We send back the real answer, word for word.
    </div>
  </div>

  <div class="anim" id="foot" style="display:flex;align-items:center;justify-content:space-between">
    {lockup((col or w)/1080, 'var(--paper)')}
    <div class="eyebrow" style="color:var(--green);font-size:{foot_size}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


FPS = 30

JOBS = [
    ("wom-video-A-selfcheck-1080x1080", 1080, 1080, 8.5, A_TIMELINE,
     hook_a(1080, 1080, pad=86, eyebrow_size=25, head_size=112, box_size=32, sub_size=30,
            foot_size=22, gap1=34, gap2=42, gap3=44, top_pad=86, bottom_pad=76)),

    ("wom-video-A-selfcheck-1080x1920", 1080, 1920, 8.5, A_TIMELINE,
     hook_a(1080, 1920, pad=92, eyebrow_size=28, head_size=132, box_size=38, sub_size=34,
            foot_size=24, gap1=44, gap2=56, gap3=56, top_pad=340, bottom_pad=420)),

    ("wom-video-C-rival-1080x1080", 1080, 1080, 9.5, C_TIMELINE,
     hook_c(1080, 1080, pad=86, eyebrow_size=24, head_size=88, card_pad=32, row_size=25,
            sub_size=26, foot_size=22, gap1=24, gap2=32, gap3=34, top_pad=76, bottom_pad=76)),

    ("wom-video-C-rival-1080x1920", 1080, 1920, 9.5, C_TIMELINE,
     hook_c(1080, 1920, pad=92, eyebrow_size=27, head_size=100, card_pad=38, row_size=30,
            sub_size=29, foot_size=24, gap1=34, gap2=42, gap3=42, top_pad=340, bottom_pad=420)),
]


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, w, h, dur, timeline, (extra_css, body) in JOBS:
            frames = f"frames_{name}"
            shutil.rmtree(frames, ignore_errors=True)
            os.makedirs(frames)
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            await pg.set_content(
                f"<style>{BASE}{extra_css}</style>{body}<script>{JS}{timeline}</script>")
            await pg.wait_for_timeout(600)
            n = int(dur * FPS)
            for i in range(n):
                await pg.evaluate("t => setT(t)", i / FPS)
                await pg.screenshot(path=f"{frames}/{i:05d}.png")
            await pg.close()
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-framerate", str(FPS), "-i", f"{frames}/%05d.png",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                f"{name}.mp4"], check=True)
            shutil.rmtree(frames, ignore_errors=True)
            print("wrote", name, f"{dur}s", f"{n} frames")
        await b.close()

asyncio.run(main())
