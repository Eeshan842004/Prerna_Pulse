"""Builds docs/Prerana_Pulse_v2_walkthrough.mp4:
title -> flowchart 1 (slow scroll) -> flowchart 2 -> the full Story Mode recorded live -> end card.
Needs: the web app served at http://localhost:8090 (python -m http.server -d web 8090),
Playwright for Python, and imageio-ffmpeg (pip install imageio-ffmpeg).
Usage: python make_video.py [Slow|Normal]"""
import subprocess, sys, time, shutil
from pathlib import Path
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent
WORK = HERE / 'build'; WORK.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
URL = 'http://localhost:8090/'
SPEED = sys.argv[1] if len(sys.argv) > 1 else 'Slow'
OUT = DOCS / 'Prerana_Pulse_v2_walkthrough.mp4'
W, H, FPS = 1920, 1080, 30

SLIDE = '''<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap" rel="stylesheet">
<style>body{{margin:0;width:1920px;height:1080px;display:grid;place-items:center;font-family:'Plus Jakarta Sans',sans-serif;
background:radial-gradient(circle at 20% 20%,#8B6CFF,#4B2FD6 45%,#1E1452);color:#fff;text-align:center}}
.k{{font-size:30px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;opacity:.8}} h1{{font-size:{size}px;margin:18px 80px;line-height:1.08;letter-spacing:-.02em}}
p{{font-size:38px;font-weight:600;max-width:1400px;margin:0 auto;opacity:.92;line-height:1.35}} .f{{margin-top:50px;font-size:26px;opacity:.7}}</style></head>
<body><div><div class="k">{kicker}</div><h1>{title}</h1><p>{sub}</p><div class="f">{foot}</div></div>
<script>document.fonts.ready.then(()=>document.body.dataset.ready='1')</script></body></html>'''
SLIDES = {
    'title': dict(kicker='Team Monarch · PRASUNEX Innovathon 2026', title='Prerana Pulse', size=150,
                  sub='A phone-free way for any student to ask for help,<br>and a reply the school can’t ignore.', foot='A wristband that notices · a child who names the feeling · adults who must answer'),
    's1': dict(kicker='Part 1', title='How the band works', size=110, sub='It notices, asks privately, and the child names the feeling.', foot=''),
    's2': dict(kicker='Part 2', title='Teachers and counsellors in the loop', size=100, sub='Every signal has an owner and a deadline. Silence moves it up on its own.', foot=''),
    's3': dict(kicker='Part 3', title='Live demo: the story of Riya', size=110, sub='Band on the left, one adult’s phone on the right.<br>The steps and “What just happened” are on the right edge.', foot='Everything you see runs on the real rules engine'),
    'end': dict(kicker='Prerana Pulse', title='Every child can ask.<br>Every request gets an answer.', size=96,
                sub='Childline 1098 · Emergency 112 · Tele-MANAS 14416', foot='Team Monarch prototype · demo data, made-up people · not a PRASUNEX product'),
}


def ff(*args):
    subprocess.run([FF, '-y', '-loglevel', 'error', *args], check=True)


def still(png, seconds, out):
    ff('-loop', '1', '-t', str(seconds), '-i', str(png), '-vf', f'scale={W}:{H},format=yuv420p', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', str(out))


def pan(png, seconds, out, width):
    # fit the chart to `width`, centre it on a 1920-wide page, then scroll from top to bottom
    hold = 2.5; move = seconds - 2 * hold
    vf = (f"scale={width}:-2,pad={W}:max(ih\\,{H}):(ow-iw)/2:0:color=0xF8F7FF,"
          f"crop={W}:{H}:0:'min(ih-{H}\\,max(0\\,(t-{hold})*(ih-{H})/{move}))',format=yuv420p")
    ff('-loop', '1', '-t', str(seconds), '-i', str(png), '-vf', vf, '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', str(out))


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': W, 'height': H})
        for k, v in SLIDES.items():
            (WORK / f'{k}.html').write_text(SLIDE.format(**v), encoding='utf-8')
            pg.goto((WORK / f'{k}.html').as_uri()); pg.wait_for_selector('body[data-ready="1"]'); pg.wait_for_timeout(300)
            pg.screenshot(path=str(WORK / f'{k}.png'))
        pg.close()
        print('slides done')
        # record the story
        ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir=str(WORK / 'rec'), record_video_size={'width': W, 'height': H})
        pg = ctx.new_page(); t0 = time.time()
        pg.goto(URL + '#story'); pg.wait_for_selector('[data-demo=play]'); pg.wait_for_timeout(3500)
        if SPEED == 'Normal': pg.click('text=Normal')
        start = time.time() - t0; pg.click('[data-demo=play]')
        while True:
            pg.wait_for_timeout(2000)
            if pg.query_selector('.n-err'): raise SystemExit('story step failed: ' + pg.inner_text('.sp-head'))
            if pg.query_selector('.end-card'): break
            if time.time() - t0 > 900: raise SystemExit('story took too long')
        pg.wait_for_timeout(4000); end = time.time() - t0
        video = pg.video.path(); ctx.close(); b.close()
        print(f'story recorded: {end - start:.0f} s')
    still(WORK / 'title.png', 6, WORK / 'a_title.mp4')
    still(WORK / 's1.png', 3.5, WORK / 'b_s1.mp4')
    pan(DOCS / 'flowcharts' / '1_how_the_band_works.png', 30, WORK / 'c_f1.mp4', 1500)
    still(WORK / 's2.png', 3.5, WORK / 'd_s2.mp4')
    pan(DOCS / 'flowcharts' / '2_teachers_and_counsellors_in_the_loop.png', 24, WORK / 'e_f2.mp4', 1920)
    still(WORK / 's3.png', 5, WORK / 'f_s3.mp4')
    ff('-ss', f'{max(0, start - 0.5):.2f}', '-i', str(video), '-t', f'{end - start + 0.5:.2f}', '-vf', f'scale={W}:{H},fps={FPS},format=yuv420p',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', str(WORK / 'g_demo.mp4'))
    still(WORK / 'end.png', 6, WORK / 'h_end.mp4')
    parts = sorted(WORK.glob('[a-h]_*.mp4'))
    (WORK / 'list.txt').write_text(''.join(f"file '{x.as_posix()}'\n" for x in parts), encoding='utf-8')
    ff('-f', 'concat', '-safe', '0', '-i', str(WORK / 'list.txt'), '-c', 'copy', '-movflags', '+faststart', str(OUT))
    print('wrote', OUT, f'{OUT.stat().st_size / 1e6:.1f} MB')
    shutil.rmtree(WORK / 'rec', ignore_errors=True)


if __name__ == '__main__':
    main()
