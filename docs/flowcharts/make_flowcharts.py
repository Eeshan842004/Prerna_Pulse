"""Draws the two Prerana Pulse flowcharts as hand-laid SVG inside one HTML page.
Run:  python make_flowcharts.py   (writes flowcharts.html next to this file)
Then render to PNG with Playwright (see the README in this folder)."""
from pathlib import Path
from html import escape

COL = {  # fill, stroke, text
    'band': ('#EEEAFE', '#6C4CF1', '#1E1452'), 'ask': ('#FFF4D6', '#E0A100', '#3D2E00'), 'private': ('#E3F6EE', '#0F9D6B', '#06402C'),
    'adult': ('#E3F0FD', '#1C7ED6', '#0B3B66'), 'teach': ('#E3F0FD', '#1C7ED6', '#0B3B66'), 'couns': ('#FFF0E0', '#E8590C', '#5C2400'),
    'prin': ('#F3E8FF', '#7C3AED', '#3B0764'), 'sos': ('#FDE2E2', '#DC2626', '#7F1D1D'), 'parent': ('#FCE7F3', '#DB2777', '#831843'), 'deliv': ('#F1F5F9', '#64748B', '#1E293B'),
}
FS, LH = 20, 26


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def text(self, cx, cy, lines, color, size=FS, bold_first=True):
        n = len(lines); y0 = cy - (n - 1) * LH * size / FS / 2
        for i, ln in enumerate(lines):
            weight = 800 if (i == 0 and bold_first) else 600
            self.parts.append(f'<text x="{cx}" y="{y0 + i * LH * size / FS:.1f}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="middle" dominant-baseline="middle">{escape(ln)}</text>')

    def box(self, cx, y, w, h, lines, kind, pill=False, size=FS):
        f, s, t = COL[kind]; r = h / 2 if pill else 16
        self.parts.append(f'<rect x="{cx - w / 2}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{f}" stroke="{s}" stroke-width="3"/>')
        self.text(cx, y + h / 2, lines, t, size)

    def diamond(self, cx, cy, w, h, lines, kind, size=FS):
        f, s, t = COL[kind]
        self.parts.append(f'<polygon points="{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}" fill="{f}" stroke="{s}" stroke-width="3"/>')
        self.text(cx, cy, lines, t, size)

    def panel(self, x, y, w, h, title, color):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="24" fill="#FFFFFF" stroke="{color}" stroke-width="2.5" stroke-dasharray="8 6"/>')
        self.parts.append(f'<rect x="{x + 20}" y="{y - 22}" width="{len(title) * 14 + 40}" height="44" rx="22" fill="{color}"/>')
        self.parts.append(f'<text x="{x + 40}" y="{y + 1}" font-size="22" font-weight="800" fill="#fff" dominant-baseline="middle">{escape(title)}</text>')

    def arrow(self, pts, label=None, at=None, dashed=False, color='#475569'):
        d = ' '.join(f'{x},{y}' for x, y in pts)
        dash = ' stroke-dasharray="7 6"' if dashed else ''
        self.parts.append(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="3"{dash} marker-end="url(#ah)" stroke-linejoin="round"/>')
        if label:
            lx, ly = at or ((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
            w = len(label) * 10.5 + 22
            self.parts.append(f'<rect x="{lx - w / 2}" y="{ly - 16}" width="{w}" height="32" rx="16" fill="#fff" stroke="#CBD5E1" stroke-width="2"/>')
            self.parts.append(f'<text x="{lx}" y="{ly + 1}" font-size="17" font-weight="800" fill="#334155" text-anchor="middle" dominant-baseline="middle">{escape(label)}</text>')

    def render(self):
        return (f'<svg viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" xmlns="http://www.w3.org/2000/svg">'
                '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker></defs>' + ''.join(self.parts) + '</svg>')


def chart_band():
    s = Svg(1600, 2330); C = 800
    s.box(C, 20, 460, 70, ['⌚ Child wears the band', ''][:1] + ['charged at home every night'], 'band', pill=True, size=19)
    s.arrow([(C, 90), (C, 128)])
    s.box(C, 130, 620, 100, ['📈 LEARN · first 2 weeks', 'learns HER normal resting heart rate', 'for morning, midday, afternoon · no buzzes'], 'band')
    s.arrow([(C, 230), (C, 268)])
    s.box(C, 270, 620, 80, ['👀 NOTICE · every second', 'heart-rate sensor + motion sensor'], 'band')
    s.arrow([(C, 350), (C, 393)])
    s.diamond(C, 480, 340, 170, ['All 5 checks', 'true?'], 'band')
    s.box(250, 400, 380, 170, ['The 5 checks', '① heart rate ≥ 20% above HER normal', '② for 2 minutes', '③ sitting still for 5 minutes', '④ not PT mode / PT period · ⑤ < 3 today'], 'band', size=17)
    s.arrow([(440, 485), (628, 485)], dashed=True)
    s.arrow([(970, 480), (1240, 480), (1240, 310), (1112, 310)], 'No · keep watching', at=(1240, 400))
    s.arrow([(C, 565), (C, 618)], 'Yes', at=(C, 592))
    s.box(C, 620, 620, 80, ['📳 Private vibration', '3 soft pulses · only the child feels it'], 'ask')
    s.arrow([(C, 700), (C, 738)])
    s.box(C, 740, 620, 105, ['🖥️ Screen: “How are you?”', '★ likely feeling shown FIRST', 'learned from her own past choices · she decides'], 'ask')
    s.arrow([(C, 845), (C, 893)])
    s.diamond(C, 960, 300, 130, ['Child', 'answers?'], 'ask')
    s.arrow([(950, 960), (1100, 960)], 'No', at=(1025, 960))
    s.box(1330, 880, 460, 160, ['No answer → asks again in 10 min', 'still nothing → logged “skipped”', '3 skipped in a row → quiet note', 'to her chosen teacher'], 'adult', size=19)
    s.box(300, 920, 380, 80, ['👆👆 Double tap any time', 'the child opens the menu herself'], 'band', pill=True, size=18)
    s.arrow([(300, 1000), (300, 1070), (440, 1070), (440, 1098)])
    s.arrow([(C, 1025), (C, 1098)], 'Yes', at=(C, 1060))
    s.box(C, 1100, 1040, 95, ['📋 FEELINGS MENU · tap = next word · hold 1 s = choose', 'I’m fine · Worried · Sad · Angry · Scared · Stressed · Jealous · Left out · Unwell · Just active · Talk · Danger'], 'ask', size=18)
    s.box(1460, 1105, 250, 80, ['✊ Hold 5 s', 'any time = SOS'], 'sos', pill=True, size=18)

    xs = [140, 400, 660, 920, 1180, 1440]; W = 238
    s.parts.append('<line x1="140" y1="1235" x2="1440" y2="1235" stroke="#475569" stroke-width="3"/>')
    s.arrow([(C, 1195), (C, 1235)], dashed=False)
    labels = [['🙂 I’m fine'], ['😟 😢 😠 😨', 'difficult feeling'], ['🏃 Just active', '/ PT'], ['🤒 Unwell'], ['💬 Talk to', 'someone'], ['🆘 I’m in', 'danger']]
    kinds = ['private', 'private', 'private', 'ask', 'adult', 'sos']
    for x, lab, k in zip(xs, labels, kinds):
        s.arrow([(x, 1235), (x, 1268)])
        s.box(x, 1270, W, 80, lab, k, size=19)
    s.arrow([(1460, 1185), (1460, 1205), (1515, 1205), (1515, 1268)])

    # 1 fine
    s.arrow([(140, 1350), (140, 1398)])
    s.box(140, 1400, W, 150, ['✅ Logged', 'threshold tuned', 'up a little →', 'fewer needless', 'questions'], 'private', size=18)
    # 2 difficult
    s.arrow([(400, 1350), (400, 1398)])
    s.box(400, 1400, W, 165, ['🫁 1-minute', 'exercise, matched', 'box breathing ·', '3 good things ·', '5-4-3-2-1 grounding'], 'private', size=18)
    s.arrow([(400, 1565), (400, 1603)])
    s.diamond(400, 1670, 230, 130, ['“Feel', 'better?”'], 'private')
    s.arrow([(400, 1735), (400, 1793)], 'Tap = yes', at=(400, 1765))
    s.box(400, 1795, W, 150, ['🔒 PRIVATE', 'nobody is told', '(same feeling on', '5 of 10 school days', '→ counsellor)'], 'private', size=18)
    s.arrow([(515, 1670), (560, 1670), (560, 1980), (500, 1980)], 'Hold', at=(560, 1830))
    s.box(400, 1960, 200, 50, ['→ 💬 Talk'], 'adult', pill=True, size=18)
    # 3 PT
    s.arrow([(660, 1350), (660, 1398)])
    s.box(660, 1400, W, 175, ['⏸ PT mode', '30 / 45 / 60 min', 'noticing paused', 'SOS still works', '(timetable PT', 'periods too)'], 'private', size=18)
    # 4 unwell
    s.arrow([(920, 1350), (920, 1403)])
    s.diamond(920, 1475, 236, 140, ['“Need the', 'nurse?”'], 'ask')
    s.arrow([(920, 1545), (920, 1608)], 'Hold = yes', at=(920, 1578))
    s.box(920, 1610, W, 100, ['🩺 Medical SOS', 'nurse + counsellor', '+ location'], 'sos', size=18)
    s.box(920, 1735, W, 70, ['Tap = no → logged', 'get well soon'], 'private', size=17)
    # 5 talk
    s.arrow([(1180, 1350), (1180, 1398)])
    s.box(1180, 1400, W, 110, ['Choose:', 'My adult (teacher)', 'or Counsellor'], 'adult', size=18)
    s.arrow([(1180, 1510), (1180, 1548)])
    s.box(1180, 1550, W, 210, ['📨 Request sent', 'with a reply clock', '1 buzz = school has it', 'later the band shows:', '“Ms Khan will see', 'you at lunch, Room 12”'], 'adult', size=18)
    # 6 danger
    s.arrow([(1440, 1350), (1440, 1403)])
    s.diamond(1440, 1475, 236, 140, ['“Send SOS?”', 'tap to confirm'], 'sos', size=18)
    s.arrow([(1440, 1545), (1440, 1608)], 'Tap', at=(1440, 1578))
    s.box(1440, 1610, W, 185, ['🆘 SOS SENT', 'band beacons every 5 s', '→ live location', 'in school', 'hold 2 s within', '60 s = cancel'], 'sos', size=18)

    for x, y in [(140, 1550), (400, 2010), (660, 1575), (920, 1805), (1180, 1760), (1440, 1795)]:
        s.arrow([(x, y), (x, 2128)], dashed=True)
    s.box(C, 2130, 1540, 150, ['📡 DELIVERY · every choice leaves as 19 encrypted bytes → nearest gateway → school server',
                               '1 short buzz = the school saved it (signed receipt) · 2 short buzzes = not delivered yet, still trying',
                               'Only the child’s choice leaves the band, never raw heart data · IDs change every 15 minutes'], 'deliv', size=20)
    return s.render()


def chart_loop():
    s = Svg(2100, 1590)
    s.panel(30, 120, 560, 1110, '😟 FEELINGS', '#0F9D6B')
    s.panel(620, 120, 650, 1240, '💬 TALK · the reply clock', '#1C7ED6')
    s.panel(1300, 120, 410, 1240, '🆘 SOS', '#DC2626')
    s.panel(1740, 120, 330, 640, '🤫 SILENCE', '#6C4CF1')
    # feelings
    s.box(310, 165, 440, 70, ['Child picks a feeling', 'on her band'], 'band', pill=True, size=19)
    s.arrow([(310, 235), (310, 278)])
    s.diamond(310, 360, 340, 160, ['Same difficult', 'feeling on 5 of the', 'last 10 school days?'], 'band', size=18)
    s.arrow([(140, 360), (140, 478)], 'No', at=(140, 420))
    s.arrow([(480, 360), (480, 478)], 'Yes (5th day)', at=(480, 420))
    s.box(170, 480, 250, 110, ['🔒 Stays private', 'exercise only', 'nobody is told'], 'private', size=18)
    s.box(450, 480, 250, 140, ['🌱 Counsellor gets', 'a note WITH name', '“Riya chose sad', 'on 5 of 10 days”'], 'couns', size=18)
    s.arrow([(450, 620), (450, 658)])
    s.box(450, 660, 250, 110, ['Opens her page', 'reason logged', '14-day feelings'], 'couns', size=18)
    s.arrow([(450, 770), (450, 808)])
    s.box(450, 810, 250, 90, ['📣 Call to talk', 'time + room → band'], 'couns', size=18)
    s.arrow([(450, 900), (450, 938)])
    s.box(450, 940, 250, 110, ['👪 May inform', 'the parent: only what', 'the counsellor chooses'], 'parent', size=17)
    s.arrow([(170, 590), (170, 638)], dashed=True)
    s.box(170, 640, 250, 110, ['Every answer also', 'counts for class', 'weather (no names)'], 'private', size=18)
    s.arrow([(170, 750), (170, 788)])
    s.diamond(170, 870, 280, 160, ['Class tense', '3 days?', '(groups < 10 hidden)'], 'private', size=16)
    s.arrow([(170, 950), (170, 1018)], 'Yes', at=(170, 984))
    s.box(170, 1020, 250, 140, ['⛈️ Class teacher:', 'class weather +', '10-min activity', 'NO names'], 'teach', size=18)
    # talk
    s.box(770, 165, 280, 80, ['💬 Talk to someone', 'My adult / Counsellor'], 'band', pill=True, size=18)
    s.arrow([(770, 245), (770, 288)])
    s.box(770, 290, 280, 120, ['👩‍🏫 Chosen teacher', 'respond by 3:30 pm', 'reminders 50% · 80%'], 'teach', size=18)
    s.arrow([(770, 410), (770, 443)])
    s.diamond(770, 505, 230, 120, ['Responded', 'in time?'], 'teach', size=18)
    s.arrow([(770, 565), (770, 613)], 'No', at=(770, 590))
    s.box(770, 615, 280, 125, ['🧑‍⚕️ Counsellor', 'by 12:00 next day', 'teacher + child told'], 'couns', size=18)
    s.arrow([(770, 740), (770, 773)])
    s.diamond(770, 835, 230, 120, ['Responded?'], 'couns', size=18)
    s.arrow([(770, 895), (770, 943)], 'No', at=(770, 920))
    s.box(770, 945, 280, 100, ['🏫 Principal', 'by 4 pm next day'], 'prin', size=18)
    s.arrow([(770, 1045), (770, 1078)])
    s.diamond(770, 1140, 230, 120, ['Responded?'], 'prin', size=18)
    s.arrow([(770, 1200), (770, 1243)], 'No', at=(770, 1222))
    s.box(770, 1245, 280, 90, ['⚠️ Management flag', 'nobody answered'], 'prin', size=18)
    s.box(1120, 290, 260, 150, ['📣 CALL TO TALK', 'when + where', 'the clock stops', '(opening does not)'], 'teach', size=18)
    s.arrow([(885, 505), (950, 505), (950, 365), (988, 365)], 'Yes', at=(950, 440))
    s.arrow([(885, 835), (1000, 835), (1000, 440)], 'Yes', at=(1000, 640))
    s.arrow([(885, 1140), (1025, 1140), (1025, 440)], 'Yes', at=(1025, 1000))
    s.arrow([(1160, 440), (1160, 478)])
    s.box(1160, 480, 190, 170, ['⌚ Band shows', '“Ms Mehta will', 'see you at', 'lunch, Room 12”'], 'band', size=17)
    s.arrow([(1160, 650), (1160, 688)])
    s.box(1160, 690, 190, 110, ['Child holds', 'Okay → adult', 'sees “saw it ✓”'], 'band', size=17)
    s.arrow([(1160, 800), (1160, 838)])
    s.box(1160, 840, 190, 130, ['🗣️ Talk in', 'person', 'Talked ✓ or', 'Needs counsellor'], 'teach', size=17)
    # sos
    s.box(1505, 165, 330, 80, ['🆘 Hold 5 s + tap', '(or Unwell → nurse)'], 'band', pill=True, size=18)
    s.arrow([(1505, 245), (1505, 283)])
    s.box(1505, 285, 350, 140, ['🔴 ALERT AT ONCE', 'counsellor + principal', '+ class teacher', '(+ nurse if medical)'], 'sos', size=18)
    s.arrow([(1505, 425), (1505, 463)])
    s.box(1505, 465, 350, 140, ['📍 Live location on map', 'strongest gateway', 'updates every 5 s', '“Block A stairs → Library”'], 'sos', size=18)
    s.arrow([(1505, 605), (1505, 648)])
    s.diamond(1505, 730, 300, 160, ['Someone taps', '“I’m going”', 'within 10 min?'], 'sos', size=18)
    s.arrow([(1505, 810), (1505, 868)], 'No', at=(1505, 838))
    s.box(1490, 870, 280, 110, ['📱 SMS + call to all', 'every 10 minutes', 'until someone goes'], 'sos', size=18)
    s.arrow([(1350, 925), (1325, 925), (1325, 730), (1352, 730)], 'repeat', at=(1325, 830))
    s.arrow([(1655, 730), (1685, 730), (1685, 1080), (1677, 1080)], 'Yes', at=(1685, 900))
    s.box(1505, 1020, 340, 120, ['🏃 Others see who’s going', 'band: “Ms Khan', 'is coming”'], 'sos', size=18)
    s.arrow([(1505, 1140), (1505, 1178)])
    s.box(1505, 1180, 340, 100, ['✅ Reached the child', 'private note'], 'couns', size=18)
    # silence
    s.box(1905, 165, 290, 80, ['3 questions skipped', 'in a row'], 'band', pill=True, size=18)
    s.arrow([(1905, 245), (1905, 283)])
    s.box(1905, 285, 290, 100, ['Chosen teacher:', '“Maybe say hi”'], 'teach', size=18)
    s.box(1905, 450, 290, 80, ['🔋 Band silent a', 'whole school day'], 'band', pill=True, size=18)
    s.arrow([(1905, 530), (1905, 568)])
    s.box(1905, 570, 290, 100, ['Class teacher:', 'check battery or fit'], 'teach', size=18)
    # bottom
    s.arrow([(1160, 970), (1160, 1384), (940, 1384), (940, 1393)], dashed=True)
    s.arrow([(1505, 1280), (1505, 1372), (990, 1372), (990, 1393)], dashed=True)
    s.box(540, 1395, 1020, 120, ['📊 PRINCIPAL · response report',
                                 'on-time %, median time to respond, SOS times · counts only, no names',
                                 'for the Supreme Court 2025 compliance file'], 'prin', size=19)
    s.box(1590, 1395, 940, 120, ['👪 PARENTS · never alerted automatically',
                                 'consent switches · band worn / battery',
                                 'only messages the counsellor chooses to share'], 'parent', size=19)
    return s.render()


LEGEND1 = [('band', 'Band senses / decides'), ('ask', 'Question on the band'), ('private', 'Private: stays on the wrist'), ('adult', 'Goes to an adult'), ('sos', 'SOS'), ('deliv', 'Delivery')]
LEGEND2 = [('band', 'From the band'), ('private', 'Private / no names'), ('teach', 'Teacher'), ('couns', 'Counsellor'), ('prin', 'Principal / management'), ('sos', 'SOS'), ('parent', 'Parent')]


def legend(items):
    return '<div class="legend">' + ''.join(f'<span><i style="background:{COL[k][0]};border-color:{COL[k][1]}"></i>{escape(t)}</span>' for k, t in items) + '</div>'


html = f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Prerana Pulse flowcharts</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap" rel="stylesheet">
<style>
body {{ margin: 0; background: #F8F7FF; font-family: 'Plus Jakarta Sans', sans-serif; color: #0F172A; }}
.sheet {{ display: inline-block; padding: 40px 44px 32px; background: #F8F7FF; }}
h1 {{ margin: 0 0 6px; font-size: 44px; font-weight: 800; letter-spacing: -.02em; }}
.sub {{ margin: 0 0 18px; color: #475569; font-size: 21px; font-weight: 600; }}
.legend {{ display: flex; gap: 22px; flex-wrap: wrap; margin: 0 0 22px; font-size: 18px; font-weight: 800; }}
.legend span {{ display: inline-flex; align-items: center; gap: 8px; }}
.legend i {{ width: 22px; height: 22px; border-radius: 6px; border: 3px solid; }}
.chart {{ background: #fff; border-radius: 26px; padding: 26px; box-shadow: 0 8px 28px rgba(30,20,90,.08); }}
svg text {{ font-family: 'Plus Jakarta Sans', 'Segoe UI Emoji', sans-serif; }}
.foot {{ margin-top: 14px; font-size: 16px; color: #64748B; font-weight: 600; }}
</style></head><body>
<div class="sheet" id="sheet1"><h1>⌚ How the Prerana Pulse band works</h1>
<p class="sub">The band notices, asks privately, and the child names the feeling. One button: tap = next · hold 1 s = choose · double tap = menu · hold 5 s = SOS.</p>
{legend(LEGEND1)}<div class="chart">{chart_band()}</div>
<div class="foot">Prerana Pulse · Team Monarch prototype, PRASUNEX Innovathon 2026 · The band notices a change; the child names the feeling. It never diagnoses.</div></div>
<br>
<div class="sheet" id="sheet2"><h1>👩‍🏫 How teachers and counsellors stay in the loop</h1>
<p class="sub">Every signal from the band has an owner and a deadline. Silence moves it up on its own. Parents are never alerted automatically.</p>
{legend(LEGEND2)}<div class="chart">{chart_loop()}</div>
<div class="foot">Every staff read is logged with a reason · history can’t be edited · teachers never see an individual child’s feelings · Childline 1098 · Emergency 112 · Tele-MANAS 14416</div></div>
<script>document.fonts.ready.then(() => {{ document.body.dataset.ready = '1'; }});</script>
</body></html>'''
Path(__file__).with_name('flowcharts.html').write_text(html, encoding='utf-8')
print('wrote flowcharts.html')
