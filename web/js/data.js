// Generated from backend/data so the in-browser demo and the server use the same roster.
export const ROSTER = [
 {
  "erp_ref": "T01",
  "name": "Ms Anjali Mehta",
  "role": "teacher",
  "class": "7B",
  "title": "Class teacher, 7B",
  "chosen": true
 },
 {
  "erp_ref": "T02",
  "name": "Mr Rohan Verma",
  "role": "teacher",
  "title": "Sports teacher",
  "chosen": true
 },
 {
  "erp_ref": "T03",
  "name": "Ms Priya Nair",
  "role": "teacher",
  "title": "Hindi teacher",
  "chosen": true
 },
 {
  "erp_ref": "C01",
  "name": "Ms Farah Khan",
  "role": "counsellor",
  "title": "School counsellor",
  "chosen": true
 },
 {
  "erp_ref": "P01",
  "name": "Mr Suresh Iyer",
  "role": "principal",
  "title": "Principal"
 },
 {
  "erp_ref": "V01",
  "name": "Ms Kavita Rao",
  "role": "pocso",
  "title": "Vice principal, POCSO officer"
 },
 {
  "erp_ref": "N01",
  "name": "Nurse Meena Das",
  "role": "nurse",
  "title": "School nurse"
 },
 {
  "erp_ref": "M01",
  "name": "Mrs Leela D'Souza",
  "role": "management",
  "title": "Management committee"
 },
 {
  "erp_ref": "A01",
  "name": "Mr Arjun Patel",
  "role": "admin",
  "title": "IT and devices"
 },
 {
  "erp_ref": "S7B01",
  "name": "Riya Sharma",
  "role": "student",
  "class": "7B",
  "band": 1001,
  "adult": "T01"
 },
 {
  "erp_ref": "S7B02",
  "name": "Aarav Gupta",
  "role": "student",
  "class": "7B",
  "band": 1002,
  "adult": "T02"
 },
 {
  "erp_ref": "S7B03",
  "name": "Kabir Singh",
  "role": "student",
  "class": "7B",
  "band": 1003,
  "adult": "C01"
 },
 {
  "erp_ref": "S7B04",
  "name": "Meera Joshi",
  "role": "student",
  "class": "7B",
  "band": 1004,
  "adult": "T01",
  "nurse_on_help": true
 },
 {
  "erp_ref": "S7B05",
  "name": "Zoya Ali",
  "role": "student",
  "class": "7B",
  "band": 1005
 },
 {
  "erp_ref": "S6A01",
  "name": "Ananya Bose",
  "role": "student",
  "class": "6A",
  "band": 1006,
  "adult": "T03"
 },
 {
  "erp_ref": "S8A01",
  "name": "Ishaan Kapoor",
  "role": "student",
  "class": "8A",
  "band": 1007,
  "adult": "C01"
 },
 {
  "erp_ref": "S8A02",
  "name": "Sara Thomas",
  "role": "student",
  "class": "8A"
 },
 {
  "erp_ref": "S4A01",
  "name": "Dev Malhotra",
  "role": "student",
  "class": "4A",
  "band": 1008,
  "adult": "T03"
 }
];
export const ACTIVITIES = [
 {
  "title": "Two kind things",
  "minutes": 10,
  "goal": "Rebuild warmth after a tense week, without singling anyone out.",
  "steps": [
   "Ask everyone to write one kind thing someone in class did this week, no names needed.",
   "Collect the slips in a box and read five aloud.",
   "Ask: what is one small thing we could do for each other tomorrow?",
   "End with a 1-minute quiet breathing round."
  ]
 },
 {
  "title": "Weather report",
  "minutes": 10,
  "goal": "Give feelings words in a low-pressure way.",
  "steps": [
   "Draw five weather symbols on the board: sunny, cloudy, windy, rainy, stormy.",
   "Each student silently picks the one that matches their week, on paper only.",
   "Talk about what helps when the weather inside is stormy.",
   "Remind the class they can message any trusted adult from the tablet."
  ]
 },
 {
  "title": "Circle of change",
  "minutes": 10,
  "goal": "Surface group friction safely, for example being left out.",
  "steps": [
   "Read a two-line story about a child left out of a group chat.",
   "Ask in pairs: how might they feel, and what could a classmate do?",
   "Collect three ideas on the board and agree on one as a class.",
   "Thank the class and do not ask anyone about themselves."
  ]
 }
];
export const FEELINGS = {"junior": ["happy", "sad", "scared", "angry", "worried", "left out", "hurt", "tired", "confused", "lonely"], "teen": ["tense", "pressure", "blank", "left out", "embarrassed", "angry", "anxious", "low", "unsafe", "hurt", "lonely", "overwhelmed", "jealous", "numb", "okay-ish"]};
export const RULES = {
 "goes_quiet": {
  "version": 1,
  "text": "3 band questions in a row left unanswered: a quiet note to the chosen adult"
 },
 "keeps_not_okay": {
  "version": 1,
  "text": "'Not great' on 5 of the last 10 school days: the child is asked first, then their adult"
 },
 "class_tension": {
  "version": 1,
  "text": "Share of 'not okay' answers at least 2x the school median for 3 school days: the class teacher gets an activity"
 }
};
