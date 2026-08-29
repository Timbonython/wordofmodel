import asyncio, os, shutil, subprocess, sys
from gen_g import BASE, bubble, dots, lockup, SPECS
from playwright.async_api import async_playwright

FPS = 30
DUR = 9.0

TIMELINE = """
function clamp(x){return x<0?0:(x>1?1:x)}
function seg(t,a,b){return clamp((t-a)/(b-a))}
function ease(x){return 1-Math.pow(1-x,3)}
function E(id){return document.getElementById(id)}

function fade(id,t,a,b,dy){
  var p=ease(seg(t,a,b)); var e=E(id); if(!e)return;
  e.style.opacity=p;
  e.style.transform='translateY('+((1-p)*(dy||0)).toFixed(2)+'px)';
}
function pop(id,t,a,b,origin){
  var p=ease(seg(t,a,b)); var e=E(id); if(!e)return;
  e.style.opacity=p;
  var s=(0.90+0.10*p).toFixed(4);
  e.style.transformOrigin=origin;
  e.style.transform='scale('+s+') translateY('+((1-p)*10).toFixed(2)+'px)';
}
function hide(id,t,a,b){
  var p=ease(seg(t,a,b)); var e=E(id); if(!e)return;
  e.style.opacity=(1-p).toFixed(4);
}

function setT(t){
  fade('b0', t, 0.15, 0.80, 8);          // eyebrow

  // typing indicator: in at 0.9, out at 1.65
  var d=E('dots');
  if(d){ d.style.opacity = (seg(t,0.90,1.25) * (1-seg(t,1.60,1.78))).toFixed(4); }

  pop('b1', t, 1.70, 2.02, 'left bottom');   // outburst
  pop('b2', t, 2.34, 2.62, 'left bottom');   // "Why?"
  // 2.6 -> 4.2 is the beat. Nothing moves.
  pop('b3', t, 4.25, 4.62, 'right bottom');  // the calm reply
  fade('b4', t, 5.05, 5.70, 10);             // offer line
}
"""


def body_for(kw, w):
    C = kw.get('col') or w
    maxw = int(C * 0.80)
    pad, msg, bpad = kw['pad'], kw['msg_size'], kw['bubble_pad']
    gm = kw['gap_msg']

    b1 = bubble('AI recommended my sh*t competitor?!!', msg, bpad, maxw, 'in', 'id="b1"')
    b2 = bubble('Why?', msg, bpad, maxw, 'in', 'id="b2"')
    b3 = bubble('Fair question. We send back the actual answer, word for word.',
                msg, bpad, maxw, 'out', 'id="b3"')
    dt = dots(msg, bpad)

    return f'''<div class="stage" style="background:var(--ink);padding:{kw['top_pad']}px {pad}px {kw['bottom_pad']}px">
  <div class="rule" style="height:{int(C*0.011)}px"></div>

  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow" id="b0" style="color:var(--green);font-size:{kw['eyebrow_size']}px;opacity:0">Roughly how it goes</div>
    <div style="height:{kw['gap1']}px"></div>

    <div style="position:relative">
      {b1}
      <div id="dots" style="position:absolute;left:0;top:0;opacity:0">{dt}</div>
    </div>
    <div style="height:{gm}px"></div>
    {b2}
    <div style="height:{int(gm*1.7)}px"></div>
    {b3}

    <div style="height:{kw['gap3']}px"></div>
    <div class="sans" id="b4" style="color:#A9ACB4;font-size:{kw['sub_size']}px;line-height:1.35;
         max-width:{int(C*0.86)}px;opacity:0">
      Free scan. One question your buyers actually type, two AI engines, no account.
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between">
    {lockup(C/1080, 'var(--paper)')}
    <div class="eyebrow" style="color:var(--green);font-size:{kw['foot_size']}px">Free scan / wordofmodel.ai</div>
  </div>
</div>'''


async def render(name, w, h, kw):
    frames = f"/tmp/gframes_{name}"
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames)

    html = (f"<style>{BASE}\n#b1,#b2,#b3{{opacity:0}}</style>"
            + body_for(kw, w)
            + f"<script>{TIMELINE}</script>")

    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        await pg.set_content(html)
        await pg.wait_for_timeout(500)
        n = int(DUR * FPS)
        for i in range(n):
            await pg.evaluate(f"setT({i / FPS:.4f})")
            await pg.screenshot(path=f"{frames}/f{i:04d}.png")
        await pg.close()
        await b.close()

    out = f"wom-video-G-outburst-{name}.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", str(FPS), "-i", f"{frames}/f%04d.png",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", out
    ], check=True)
    shutil.rmtree(frames, ignore_errors=True)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for name, w, h, kw in SPECS:
        if only and only != name:
            continue
        await render(name, w, h, kw)

asyncio.run(main())
