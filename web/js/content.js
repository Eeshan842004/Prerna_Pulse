// Shared school content for the band, the engine and the apps: feeling words with their
// exercises, the timetable, gateway places on the school map, and class activities.
// All of it is demo data for a made-up school.
import { ACTIVITIES } from './data.js';

// Feeling codes match the band protocol (type 1 "feeling", low 4 bits of arg).
export const FEELINGS = [
  { code: 1, key: 'fine', e: '🙂', c: '#DDF5EA', en: 'I’m fine', hi: 'मैं ठीक हूँ', difficult: false,
    m: ['All good right now.', 'अभी सब ठीक है।'] },
  { code: 2, key: 'worried', e: '😟', c: '#FFE9D6', en: 'Worried', hi: 'चिंतित', difficult: true, ex: 'box',
    m: ['Your mind keeps thinking something bad might happen.', 'मन बार-बार सोचे कि कुछ बुरा हो सकता है।'] },
  { code: 3, key: 'sad', e: '😢', c: '#DCE8FB', en: 'Sad', hi: 'उदास', difficult: true, ex: 'good3',
    m: ['You feel heavy and want to cry or be alone.', 'मन भारी लगे, रोने या अकेले रहने का मन करे।'] },
  { code: 4, key: 'angry', e: '😠', c: '#FDE0DC', en: 'Angry', hi: 'गुस्सा', difficult: true, ex: 'breathe46',
    m: ['Something feels unfair and your body gets hot.', 'कुछ गलत लगे और शरीर गरम हो जाए।'] },
  { code: 5, key: 'scared', e: '😨', c: '#EDE4FF', en: 'Scared', hi: 'डर लग रहा है', difficult: true, ex: 'ground',
    m: ['You feel something or someone could hurt you.', 'लगे कि कोई या कुछ चोट पहुँचा सकता है।'] },
  { code: 6, key: 'stressed', e: '😫', c: '#FFF0D9', en: 'Stressed', hi: 'तनाव', difficult: true, ex: 'calm1',
    m: ['Too much to do and too little time.', 'काम बहुत और समय कम।'] },
  { code: 7, key: 'jealous', e: '😒', c: '#E9F5D8', en: 'Jealous', hi: 'जलन', difficult: true, ex: 'kind',
    m: ['You wish you had what someone else has.', 'मन करे कि जो दूसरे के पास है, वो तुम्हारे पास हो।'] },
  { code: 8, key: 'left_out', e: '😶', c: '#F1E8DD', en: 'Left out', hi: 'अकेला / अलग-थलग', difficult: true, ex: 'slow_talk',
    m: ['Others do things together without you.', 'दूसरे तुम्हारे बिना साथ में कुछ करें।'] },
  { code: 9, key: 'unwell', e: '🤒', c: '#FDECEC', en: 'Unwell', hi: 'तबीयत ठीक नहीं', difficult: false,
    m: ['Your body does not feel right.', 'शरीर ठीक नहीं लग रहा।'] },
  { code: 10, key: 'just_active', e: '🏃', c: '#E3F0FD', en: 'Just active / PT', hi: 'अभी दौड़ा / पीटी', difficult: false,
    m: ['You were running or playing.', 'तुम दौड़ रहे थे या खेल रहे थे।'] },
];
export const BY_CODE = Object.fromEntries(FEELINGS.map((f) => [f.code, f]));
export const BY_KEY = Object.fromEntries(FEELINGS.map((f) => [f.key, f]));
export const DIFFICULT = new Set(FEELINGS.filter((f) => f.difficult).map((f) => f.code));
export const JUNIOR_CODES = [1, 3, 4, 5, 9]; // + Talk: six items for classes 3 to 5
export const feelWord = (code, lang) => { const f = BY_CODE[code]; return f ? (lang === 'hi' ? f.hi : f.en) : '?'; };

// One-minute exercises, done on the wrist. Each step: text [en, hi], seconds, and the buzz rhythm.
export const EXERCISES = {
  box: { name: ['Box breathing', 'बॉक्स साँस'], steps: [[['Breathe in', 'साँस लो'], 4, 'in'], [['Hold', 'रोको'], 4, 'hold'], [['Breathe out', 'साँस छोड़ो'], 4, 'out'], [['Hold', 'रोको'], 4, 'hold']], rounds: 4 },
  good3: { name: ['3 good things', '3 अच्छी बातें'], steps: [[['Think of 1 good thing', '1 अच्छी बात सोचो'], 10, null], [['…a 2nd good thing', '…दूसरी अच्छी बात'], 10, null], [['…a 3rd good thing', '…तीसरी अच्छी बात'], 10, null], [['Breathe in slowly', 'धीरे साँस लो'], 5, 'in'], [['Breathe out slowly', 'धीरे छोड़ो'], 7, 'out'], [['Breathe in slowly', 'धीरे साँस लो'], 5, 'in'], [['Breathe out slowly', 'धीरे छोड़ो'], 7, 'out']], rounds: 1 },
  breathe46: { name: ['4–6 breathing', '4–6 साँस'], steps: [[['In for 4', '4 तक साँस लो'], 4, 'in'], [['Out for 6', '6 तक छोड़ो'], 6, 'out'], [['In for 4', '4 तक साँस लो'], 4, 'in'], [['Out for 6', '6 तक छोड़ो'], 6, 'out'], [['In for 4', '4 तक साँस लो'], 4, 'in'], [['Out for 6', '6 तक छोड़ो'], 6, 'out'], [['Squeeze your fists', 'मुट्ठी भींचो'], 8, 'hold'], [['Now let go', 'अब ढीला छोड़ो'], 8, 'out'], [['In for 4', '4 तक साँस लो'], 4, 'in'], [['Out for 6', '6 तक छोड़ो'], 6, 'out']], rounds: 1 },
  ground: { name: ['5-4-3-2-1', '5-4-3-2-1'], steps: [[['5 things you see', '5 चीज़ें जो दिखें'], 14, null], [['4 you can touch', '4 जो छू सको'], 12, null], [['3 you can hear', '3 जो सुन सको'], 12, null], [['2 you can smell', '2 जिनकी गंध आए'], 10, null], [['1 slow breath', '1 धीमी साँस'], 12, 'out']], rounds: 1 },
  calm1: { name: ['1-minute calm', '1 मिनट शांति'], steps: [[['Drop your shoulders', 'कंधे ढीले करो'], 8, null], [['Breathe in', 'साँस लो'], 5, 'in'], [['Breathe out', 'साँस छोड़ो'], 7, 'out'], [['Unclench your jaw', 'जबड़ा ढीला करो'], 8, null], [['Breathe in', 'साँस लो'], 5, 'in'], [['Breathe out', 'साँस छोड़ो'], 7, 'out'], [['One small step next', 'अगला छोटा कदम'], 10, null], [['Breathe out', 'साँस छोड़ो'], 10, 'out']], rounds: 1 },
  kind: { name: ['Name it, breathe', 'नाम दो, साँस लो'], steps: [[['It’s okay to feel jealous', 'जलन होना ठीक है'], 10, null], [['Breathe in', 'साँस लो'], 5, 'in'], [['Breathe out', 'साँस छोड़ो'], 7, 'out'], [['Breathe in', 'साँस लो'], 5, 'in'], [['Breathe out', 'साँस छोड़ो'], 7, 'out'], [['One kind thought for them', 'उनके लिए एक अच्छा विचार'], 13, null], [['One for you too', 'एक अपने लिए भी'], 13, null]], rounds: 1 },
  slow_talk: { name: ['Slow breathing', 'धीमी साँस'], steps: [[['Breathe in slowly', 'धीरे साँस लो'], 5, 'in'], [['Breathe out slowly', 'धीरे छोड़ो'], 7, 'out']], rounds: 4, offerTalk: true },
};
export const exerciseFor = (code) => EXERCISES[BY_CODE[code]?.ex] || null;
export const exerciseSeconds = (ex) => ex.steps.reduce((s, x) => s + x[1], 0) * (ex.rounds || 1);

// School timetable (comes from the ERP; sample). PT, Games, Yoga and Dance pause sensing.
export const PAUSING = new Set(['PT', 'Games', 'Yoga', 'Dance']);
const DAY_PLAN = [['08:00', '08:20', 'Assembly'], ['08:20', '09:00', 'English'], ['09:00', '09:40', 'Hindi'], ['09:40', '10:20', 'Science'], ['10:20', '11:20', 'Maths'],
  ['11:20', '12:00', 'PT'], ['12:00', '12:40', 'Lunch'], ['12:40', '13:20', 'Social Studies'], ['13:20', '14:00', 'Computer'], ['14:00', '14:40', 'Art'], ['14:40', '15:30', 'Library']];
export function timetableFor(className) {
  const plan = DAY_PLAN.map((p) => [...p]);
  if (className !== '7B') { // other classes have PT at a different time
    const i = 1 + ([...className].reduce((s, c) => s + c.charCodeAt(0), 0) % 4); // English..Maths slot
    [plan[i][2], plan[5][2]] = [plan[5][2], plan[i][2]];
  }
  return plan.map(([start, end, subject]) => ({ start, end, subject, pauses: PAUSING.has(subject) }));
}
export const SUBJECT_HI = { Assembly: 'प्रार्थना सभा', English: 'अंग्रेज़ी', Hindi: 'हिंदी', Science: 'विज्ञान', Maths: 'गणित', PT: 'पीटी', Lunch: 'लंच', 'Social Studies': 'सामाजिक विज्ञान', Computer: 'कंप्यूटर', Art: 'कला', Library: 'पुस्तकालय', Games: 'खेल', 'Before school': 'स्कूल से पहले', 'After school': 'स्कूल के बाद' };

// Gateways and their place on the school map (an SVG of 400 x 260). RSSI comes from distance.
export const GATEWAYS = [
  { id: 'gw-7b', kind: 'esp32-hub', name: ['Classroom 7B corridor', 'कक्षा 7B गलियारा'], x: 78, y: 62 },
  { id: 'gw-stairs', kind: 'esp32-hub', name: ['Block A stairs', 'ब्लॉक A सीढ़ियाँ'], x: 168, y: 62 },
  { id: 'gw-library', kind: 'school-pc', name: ['Library corridor', 'पुस्तकालय गलियारा'], x: 262, y: 62 },
  { id: 'gw-lab', kind: 'school-pc', name: ['Computer lab', 'कंप्यूटर लैब'], x: 338, y: 140 },
  { id: 'gw-playground', kind: 'esp32-hub', name: ['Playground gate', 'खेल मैदान गेट'], x: 118, y: 210 },
  { id: 'gw-office', kind: 'office-root', name: ['School office (UPS + 4G)', 'स्कूल ऑफ़िस (UPS + 4G)'], x: 300, y: 216 },
  { id: 'gw-blockb', kind: 'esp32-hub', name: ['Block B corridor', 'ब्लॉक B गलियारा'], x: 30, y: 150 },
];
export const GW = Object.fromEntries(GATEWAYS.map((g) => [g.id, g]));
export const gwName = (id, lang) => (GW[id] ? GW[id].name[lang === 'hi' ? 1 : 0] : id);
// Signal strength a band at gateway `near` would give at gateway `g` (simple path-loss model).
export function rssiFrom(near, g) {
  const a = GW[near], b = GW[g]; if (!a || !b) return -120;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.round(-42 - d * 0.24);
}
export const IN_RANGE = -86;

// Class activities (the reviewed library), with Hindi.
export const ACTIVITY_LIST = ACTIVITIES.map((a, i) => ({ ...a, code: ['two_kind', 'weather', 'circle'][i] || `a${i}` }));
export const ACTIVITY_HI = {
  'Two kind things': { title: 'दो अच्छी बातें', goal: 'तनाव भरे हफ़्ते के बाद अपनापन लौटाना, किसी का नाम लिए बिना।',
    steps: ['सब लिखें कि इस हफ़्ते कक्षा में किसी ने क्या अच्छा किया, नाम ज़रूरी नहीं।', 'पर्चियाँ डिब्बे में इकट्ठी करें और पाँच ज़ोर से पढ़ें।', 'पूछें: कल हम एक-दूसरे के लिए कौन-सी छोटी बात कर सकते हैं?', '1 मिनट शांत साँस के साथ खत्म करें।'] },
  'Weather report': { title: 'मौसम रिपोर्ट', goal: 'भावनाओं को आसान तरीके से शब्द देना।',
    steps: ['बोर्ड पर पाँच मौसम बनाएँ: धूप, बादल, हवा, बारिश, तूफ़ान।', 'हर बच्चा चुपचाप कागज़ पर अपने हफ़्ते का मौसम चुने।', 'बात करें: जब अंदर तूफ़ान हो तो क्या मदद करता है?', 'याद दिलाएँ कि बैंड पर “किसी से बात करनी है” हमेशा है।'] },
  'Circle of change': { title: 'बदलाव का घेरा', goal: 'समूह की खटपट को सुरक्षित तरीके से सामने लाना, जैसे किसी को अलग करना।',
    steps: ['एक बच्चे की दो लाइन की कहानी पढ़ें जिसे ग्रुप से बाहर रखा गया।', 'जोड़ियों में पूछें: उसे कैसा लगा होगा, और सहपाठी क्या कर सकते थे?', 'बोर्ड पर तीन सुझाव लिखें और कक्षा एक पर सहमत हो।', 'कक्षा को धन्यवाद दें और किसी से उसके बारे में न पूछें।'] },
};
// Activity chosen by the top feeling in the class.
export const ACTIVITY_FOR = { left_out: 'Circle of change', jealous: 'Circle of change', angry: 'Two kind things', sad: 'Two kind things', worried: 'Weather report', stressed: 'Weather report', scared: 'Weather report' };

// Feeling of the week: a 2-minute talk for assembly or the start of class.
export const WEEK_FEELING = { code: 8, script: [
  ['Ask: has anyone ever been left out of a game? (hands up, no names)', 'पूछें: क्या कभी किसी को खेल से बाहर रखा गया? (हाथ उठाएँ, नाम नहीं)'],
  ['Say: “Left out” is when others do things together without you. It hurts, and it is not your fault.', 'कहें: “अलग-थलग” मतलब जब दूसरे तुम्हारे बिना साथ में कुछ करें। दुख होता है, और यह तुम्हारी गलती नहीं।'],
  ['Ask: what is one way to include someone today?', 'पूछें: आज किसी को साथ लेने का एक तरीका क्या है?'],
  ['Remind: on your band, “Talk to someone” is always there.', 'याद दिलाएँ: बैंड पर “किसी से बात करनी है” हमेशा है।']] };

// Call-to-talk quick choices.
export const WHEN = [['now', ['now', 'अभी']], ['break', ['next break', 'अगले ब्रेक में']], ['lunch', ['lunch', 'लंच में']], ['after', ['after school', 'छुट्टी के बाद']]];
export const WHERE = [['counselling', ['Counselling room', 'काउंसलिंग रूम']], ['staff', ['Staff room', 'स्टाफ़ रूम']], ['room12', ['Room 12', 'कमरा 12']]];
