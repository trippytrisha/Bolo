/* Bolo: a voice agent that compares apps and gets things done.
   Prototype: prices, times and bookings are simulated estimates.
   Profile and history are stored only in this browser. */

"use strict";

/* ===================== storage ===================== */
const KEY = "bolo.agent.v1";
const fresh = () => ({ profile: { name: "", home: "", work: "", bike: "", usuals: "", meds: "" }, history: [], lastGrocery: [] });
const db = load();
function load() {
  try { const r = localStorage.getItem(KEY); if (r) return Object.assign(fresh(), JSON.parse(r)); } catch (_) { /* blocked */ }
  return fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* private mode */ } }

/* ===================== helpers ===================== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rupee = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const list = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const hash = (s) => { let h = 2166136261; for (const c of String(s).toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };
const jitter = (seed, pct) => 1 + (((hash(seed) % 1000) / 1000) * 2 - 1) * pct;
const timeStr = (d) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(/\s?(am|pm)/i, (m) => " " + m.trim().toUpperCase());
const csv = (s) => String(s || "").split(/,|\band\b|\baur\b/i).map((x) => x.trim()).filter(Boolean);
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ===================== reference data (estimates) ===================== */
const LINKS = {
  Uber: "https://m.uber.com/ul/", Ola: "https://book.olacabs.com/", Rapido: "https://www.rapido.bike/",
  Blinkit: "https://blinkit.com/", Zepto: "https://www.zeptonow.com/", Instamart: "https://www.swiggy.com/instamart",
  Swiggy: "https://www.swiggy.com/", Zomato: "https://www.zomato.com/",
  "Tata 1mg": "https://www.1mg.com/", PharmEasy: "https://pharmeasy.in/", "Apollo 24|7": "https://www.apollo247.com/",
};
const LOGO = {
  Uber: ["lg-uber", "Uber"], Rapido: ["lg-rapido", "R"], Ola: ["lg-ola", "O"],
  Blinkit: ["lg-blinkit", "blink"], Zepto: ["lg-zepto", "zepto"], Instamart: ["lg-instamart", "IM"],
  Swiggy: ["lg-swiggy", "S"], Zomato: ["lg-zomato", "z"],
  "Tata 1mg": ["lg-1mg", "1mg"], PharmEasy: ["lg-pharmeasy", "PE"], "Apollo 24|7": ["lg-apollo", "A"],
};
const rideLabel = (o) => (/\b(auto|cab|bike)\b/i.test(o.name) ? o.name : `${o.name} ${o.type}`);
const logo = (app) => { const [c, t] = LOGO[app] || ["lg-uber", app[0]]; return `<span class="logo-sq ${c}">${esc(t)}</span>`; };

const RIDES = [
  { app: "Uber", type: "cab", name: "Uber Go", base: 50, km: 18, tags: ["Comfortable", "Reliable"] },
  { app: "Uber", type: "auto", name: "Uber Auto", base: 30, km: 13, tags: ["Auto"] },
  { app: "Rapido", type: "bike", name: "Rapido", base: 20, km: 9, tags: ["Bike"] },
  { app: "Rapido", type: "auto", name: "Rapido Auto", base: 28, km: 12.5, tags: ["Auto"] },
  { app: "Rapido", type: "cab", name: "Rapido Cab", base: 45, km: 17, tags: ["Cab"] },
  { app: "Ola", type: "cab", name: "Ola", base: 55, km: 19, tags: ["Prime", "Comfortable"] },
  { app: "Ola", type: "auto", name: "Ola Auto", base: 30, km: 13.5, tags: ["Auto"] },
];

const CATALOG = {
  milk: ["Milk 1 L", 68, "🥛", ["doodh"]], bread: ["Brown bread", 50, "🍞", []], eggs: ["Eggs, 6 pcs", 54, "🥚", ["egg", "anda", "ande"]],
  bhindi: ["Bhindi 500 g", 40, "🥬", ["okra", "lady finger"]], paneer: ["Paneer 200 g", 90, "🧀", []], mushrooms: ["Mushrooms 200 g", 45, "🍄", ["mushroom"]],
  lauki: ["Lauki, 1 pc", 35, "🥒", ["bottle gourd"]], palak: ["Palak 250 g", 25, "🥬", ["spinach"]], gobhi: ["Gobhi, 1 pc", 40, "🥦", ["cauliflower", "gobi"]],
  tomatoes: ["Tomatoes 500 g", 30, "🍅", ["tomato", "tamatar"]], onions: ["Onions 1 kg", 45, "🧅", ["onion", "pyaz", "pyaaz"]],
  potatoes: ["Potatoes 1 kg", 38, "🥔", ["potato", "aloo"]], curd: ["Curd 400 g", 40, "🥣", ["dahi", "yogurt"]], bananas: ["Bananas, 6 pcs", 48, "🍌", ["banana", "kela"]],
  butter: ["Butter 100 g", 58, "🧈", ["makhan"]], atta: ["Atta 5 kg", 280, "🌾", ["flour"]], rice: ["Rice 1 kg", 95, "🍚", ["chawal"]],
  coffee: ["Instant coffee 50 g", 165, "☕", []], tea: ["Tea 250 g", 140, "🍵", ["chai patti"]], noodles: ["Instant noodles, 4 pk", 56, "🍜", ["maggi"]],
  apples: ["Apples, 4 pcs", 120, "🍎", ["apple", "seb"]], chips: ["Potato chips", 20, "🍟", []],
};
const VEG = ["bhindi", "lauki", "palak", "gobhi", "paneer", "mushrooms"];
const GROCERS = [
  { app: "Blinkit", mult: 1.0, handling: 9, delivery: 25 },
  { app: "Zepto", mult: 0.98, handling: 12, delivery: 30 },
  { app: "Instamart", mult: 1.01, handling: 8, delivery: 25 },
];
const KITCHENS = ["Golden Wok", "The Noodle Box", "Dragon Bowl", "Urban Tadka", "Spice Route Kitchen", "Hungry Hub"];
const PHARMA = ["Tata 1mg", "PharmEasy", "Apollo 24|7"];

function findItem(word) {
  const w = word.toLowerCase().trim();
  for (const [k, v] of Object.entries(CATALOG)) if (w.includes(k) || v[3].some((a) => w.includes(a))) return k;
  return null;
}
function itemInfo(key) {
  if (CATALOG[key]) { const [n, p, e] = CATALOG[key]; return { key, name: n, price: p, emoji: e }; }
  return { key, name: cap(key), price: 60, emoji: "🛒" };
}

/* ===================== navigation ===================== */
let current = "home";
function go(name) {
  if (!$("s-" + name)) name = "home";
  if (current === "talk" && name !== "talk") stopVoice();
  current = name;
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "s-" + name));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.go === name));
  const inner = name === "results" || name === "done";
  $("backBtn").hidden = !inner;
  $("menuBtn").hidden = inner;
  if (name === "home") renderHome();
  if (name === "activity") renderActivity();
  if (name === "profile") renderProfile();
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });
$("backBtn").addEventListener("click", () => { stopVoice(); ctx = null; go("home"); });
$("menuBtn").addEventListener("click", () => ($("menuSheet").hidden = false));
$("closeMenu").addEventListener("click", () => ($("menuSheet").hidden = true));
$("menuSheet").addEventListener("click", (e) => { if (e.target.id === "menuSheet") $("menuSheet").hidden = true; });
$("resetBtn").addEventListener("click", () => {
  if (!confirm("Clear your profile and history?")) return;
  Object.assign(db, fresh()); save(); $("menuSheet").hidden = true; go("home"); toast("All cleared");
});

/* ===================== voice I/O ===================== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, listening = false, voiceMode = false, voiceList = [];
if ("speechSynthesis" in window) {
  const loadVoices = () => (voiceList = speechSynthesis.getVoices());
  loadVoices(); speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice() {
  return voiceList.find((v) => v.lang === "en-IN") || voiceList.find((v) => /India/i.test(v.name)) ||
    voiceList.find((v) => /^en/i.test(v.lang) && /female|samantha|google/i.test(v.name)) || voiceList.find((v) => /^en/i.test(v.lang));
}
function speak(text, then) {
  const done = () => { talkState(null, "speaking"); if (then) then(); };
  if (!("speechSynthesis" in window)) { setTimeout(done, 300); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/₹/g, "rupees ").replace(/\|7/g, " 24 7"));
  const v = pickVoice(); if (v) u.voice = v;
  u.lang = (v && v.lang) || "en-IN"; u.rate = 1.03; u.pitch = 1.05;
  let finished = false;
  const fin = () => { if (!finished) { finished = true; clearTimeout(guard); done(); } };
  u.onend = fin; u.onerror = fin;
  const guard = setTimeout(fin, 1200 + text.length * 75); // some browsers never fire onend
  talkState("speaking");
  speechSynthesis.speak(u);
}
function listen() {
  if (!SR) { toast("Voice works in Chrome. You can type instead."); $("talkInput").focus(); return; }
  if (listening) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  recog = new SR();
  recog.lang = "en-IN"; recog.interimResults = true; recog.maxAlternatives = 1;
  let finalText = "";
  recog.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
    if (current === "talk") $("talkSub").textContent = "“" + t + "”";
    if (e.results[e.results.length - 1].isFinal) finalText = t;
  };
  recog.onerror = (e) => {
    listening = false; markListening(false);
    if (e.error === "not-allowed") toast("Allow microphone access to talk to Bolo");
  };
  recog.onend = () => {
    listening = false; markListening(false);
    if (finalText.trim()) handle(finalText.trim());
    else if (current === "talk" && ctx && ctx.awaiting) $("talkSub").textContent = "I didn't catch that. Tap the orb or pick an answer.";
  };
  listening = true; voiceMode = true; markListening(true);
  try { recog.start(); } catch (_) { listening = false; markListening(false); }
}
function stopVoice() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (recog && listening) { try { recog.abort(); } catch (_) { /* ignore */ } }
  listening = false; markListening(false);
}
function markListening(on) {
  if (current === "talk") talkState(on ? "listening" : null, on ? null : "listening");
  $("resMic").classList.toggle("live", on && current === "results");
}
// Ask something out loud, then listen for the answer if the user is talking.
function say(text, after) { speak(text, () => { if (after) after(); else if (voiceMode) listen(); }); }

/* ===================== talk screen ===================== */
function talkState(add, remove) {
  const s = $("s-talk");
  if (remove) s.classList.remove(remove);
  if (add) { if (add !== "speaking") s.classList.remove("listening", "thinking"); s.classList.add(add); }
}
function showTalk(title, sub, chips = []) {
  if (current !== "talk") go("talk");
  $("talkTitle").textContent = title;
  $("talkSub").textContent = sub || "";
  $("talkChips").innerHTML = chips.map((c) => `<button class="chip" data-reply="${esc(c)}">${esc(c)}</button>`).join("");
  $("talkInput").value = "";
}
$("talkChips").addEventListener("click", (e) => { const c = e.target.closest("[data-reply]"); if (c) { stopVoice(); handle(c.dataset.reply); } });
$("orbTalk").addEventListener("click", () => (listening ? stopVoice() : listen()));
$("orbHome").addEventListener("click", () => {
  voiceMode = true; ctx = null;
  showTalk("Listening…", "Say something like “Book me a cab to college by 12:30 pm”");
  listen();
});
$("stopBtn").addEventListener("click", () => { stopVoice(); ctx = null; go("home"); });
$("talkForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("talkInput").value.trim(); if (v) { stopVoice(); voiceMode = false; handle(v); } });
$("homeForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("homeInput").value.trim(); if (v) { voiceMode = false; ctx = null; $("homeInput").value = ""; handle(v); } });
document.querySelectorAll(".sug").forEach((b) => b.addEventListener("click", () => { voiceMode = false; ctx = null; handle(b.dataset.say); }));
$("resMic").addEventListener("click", () => (listening ? stopVoice() : listen()));

/* ===================== the agent ===================== */
let ctx = null; // the conversation in progress
const YES = /\b(yes|yeah|yep|haan|han|ha|ji|ok|okay|sure|book|confirm|order( it)?|go ahead|kar do|karo|theek|done|place)\b/i;
const NO = /\b(no|nope|nahi|nahin|cancel|stop|mat|leave it|never ?mind)\b/i;

function detectIntent(t) {
  if (/\b(medicine|medicines|dawai|dawa|dawaiyan|dawaiyaan|tablet|tablets|1mg|pharmacy|pharmeasy|apollo|refill)\b/.test(t)) return "meds";
  if (/\b(ride|cab|taxi|auto|bike|uber|ola|rapido|drop me|take me|pick me|jaana|jana|chalo|travel)\b/.test(t) || /\bgo to\b/.test(t)) return "ride";
  if (/\b(usual|usuals|blinkit|zepto|instamart|grocer|groceries|sabzi|vegetables|ration)\b/.test(t) || findItem(t)) return "grocery";
  if (/\b(craving|hungry|bhook|khana|food|eat|swiggy|zomato|order|dinner|lunch|breakfast|snack)\b/.test(t)) return "food";
  return null;
}

function handle(raw) {
  const text = raw.trim();
  const t = text.toLowerCase();
  if (ctx && ctx.stage === "results") return onResultsReply(t, text);
  if (ctx && ctx.awaiting) { fillSlot(ctx, ctx.awaiting, t, text); ctx.awaiting = null; return next(); }
  const intent = detectIntent(t);
  if (!intent) {
    showTalk("I can help with that soon", `“${text}”`, ["Find me a ride", "Order my usuals", "Reorder my medicine", "I'm craving momos"]);
    ctx = null;
    return say("Right now I can book rides, order your usual groceries, get food you're craving, or reorder your medicines. What would you like?");
  }
  ctx = { intent, request: text, slots: {}, asked: {} };
  parseInitial(ctx, t, text);
  next();
}

/* ---------- slot filling ---------- */
function parseInitial(c, t, text) {
  const s = c.slots;
  if (c.intent === "ride") {
    if (/\bbike\b/.test(t)) s.type = "bike"; else if (/\bauto\b/.test(t)) s.type = "auto"; else if (/\b(cab|taxi|car)\b/.test(t)) s.type = "cab";
    const app = /\buber\b/.test(t) ? "Uber" : /\bola\b/.test(t) ? "Ola" : /\brapido\b/.test(t) ? "Rapido" : null;
    if (app) s.app = app;
    readDrop(s, t, text);
    readTime(s, t);
  }
  if (c.intent === "grocery") {
    const app = /\bzepto\b/.test(t) ? "Zepto" : /\binstamart\b/.test(t) ? "Instamart" : /\bblinkit\b/.test(t) ? "Blinkit" : null;
    if (app) s.app = app;
    if (!/\busual/.test(t)) {
      const items = csv(t.replace(/^(order|get|buy|add|i need|i want|mujhe|bolo)\s+/, "").replace(/\bfrom (blinkit|zepto|instamart)\b/, "")).map(findItem).filter(Boolean);
      if (items.length) s.items = [...new Set(items)];
    }
  }
  if (c.intent === "food") {
    const m = t.match(/(?:craving|crave|want|order|get me|have|khana hai|for)\s+(?:some\s+|a\s+|an\s+|me\s+)?([a-z][a-z\s]{1,30}?)(?:\s+from\b|\s+on\b|\s+please\b|[.!?]|$)/);
    if (m && !/^(something|food|anything|dinner|lunch)$/.test(m[1].trim())) s.dish = m[1].trim();
    const app = /\bswiggy\b/.test(t) ? "Swiggy" : /\bzomato\b/.test(t) ? "Zomato" : null;
    if (app) s.app = app;
  }
  if (c.intent === "meds") {
    const m = text.match(/(?:order|reorder|refill|get)\s+(?:my\s+)?(.+?)(?:\s+from\b|[.!?]|$)/i);
    if (m && !/^(medicines?|dawai|dawa|my medicines?)$/i.test(m[1].trim())) s.med = m[1].trim();
    else if (db.profile.meds) s.med = csv(db.profile.meds)[0];
  }
}
function readDrop(s, t, text) {
  const p = db.profile;
  if (/\b(college|office|work|campus|uni|university)\b/.test(t)) { s.drop = p.work || null; if (!p.work) s.needWork = true; return; }
  if (/\b(home|ghar)\b/.test(t)) { s.drop = p.home || null; if (!p.home) s.needHome = true; return; }
  const m = text.match(/\b(?:to|till|until|for)\s+(?!be\b|book\b|go\b)([A-Za-z0-9][\w\s,'.-]{1,40}?)(?=\s+(?:by|at|in|urgently|now|asap|right|please|before)\b|[.!?]|$)/i);
  if (m) s.drop = cap(m[1].trim());
}
function readTime(s, t) {
  if (/\b(urgent|urgently|asap|right now|now|jaldi|abhi|immediately|fast|quick)\b/.test(t)) { s.urgent = true; s.when = "now"; }
  const by = t.match(/\b(?:by|before|at)\s+(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm|baje)?\b/);
  if (by) {
    let h = +by[1]; const m = +(by[2] || 0); const ap = by[3];
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (!ap || ap === "baje") { const now = new Date(); if (h < 12 && h + 12 > now.getHours() && h <= now.getHours()) h += 12; }
    const d = new Date(); d.setHours(h, m, 0, 0); if (d < Date.now() - 6e4) d.setDate(d.getDate() + 1);
    s.arriveBy = d.getTime(); s.when = "by";
  }
  const inMin = t.match(/\bin\s+(\d{1,3})\s*(min|minutes|mins)\b/);
  if (inMin) { s.leaveAt = Date.now() + +inMin[1] * 6e4; s.when = "later"; }
}

function fillSlot(c, slot, t, text) {
  const s = c.slots, p = db.profile;
  if (slot === "work") { p.work = cap(text.replace(/^(it'?s|my college is|my office is|college is)\s+/i, "")); save(); s.drop = p.work; s.needWork = false; }
  else if (slot === "home") { p.home = cap(text.replace(/^(it'?s|i live in|in)\s+/i, "")); save(); s.drop = p.home; s.needHome = false; }
  else if (slot === "drop") {
    if (/\b(college|office|work)\b/.test(t) && p.work) s.drop = p.work;
    else if (/\b(home|ghar)\b/.test(t) && p.home) s.drop = p.home;
    else s.drop = cap(text.replace(/^(to|take me to|drop me (at|to)|i'?m going to|going to)\s+/i, ""));
    if (!s.when) readTime(s, t);
  }
  else if (slot === "when") { readTime(s, t); if (!s.when) { s.when = "now"; } }
  else if (slot === "bike") {
    const yes = YES.test(t) && !NO.test(t);
    p.bike = yes ? "yes" : "no"; save();
  }
  else if (slot === "usuals") { p.usuals = text; save(); }
  else if (slot === "dish") s.dish = text.replace(/^(i want|i'?m craving|some|craving)\s+/i, "").trim();
  else if (slot === "med") { s.med = text.trim(); if (!p.meds) { p.meds = s.med; save(); } }
}

function ask(slot, q, chips) { ctx.awaiting = slot; ctx.asked[slot] = true; showTalk(q, "", chips); say(q); }

function next() {
  const c = ctx, s = c.slots, p = db.profile;
  if (c.intent === "ride") {
    if (s.needWork) return ask("work", "What's your college or office called? I'll remember it.", []);
    if (s.needHome) return ask("home", "Where do you live? I'll remember it for next time.", []);
    if (!s.drop) return ask("drop", "Sure. Where should I drop you?", [p.work, p.home, "Connaught Place", "Nearest metro"].filter(Boolean));
    if (!s.when) return ask("when", "Do you need it right now, or by a certain time?", ["Right now, it's urgent", "In 15 minutes", "By 12:30 pm"]);
    if (!s.type && !p.bike) return ask("bike", "Are you comfortable on a bike taxi? It's usually the cheapest and fastest.", ["Yes, bike is fine", "No, cab or auto only"]);
    return think(rideResults);
  }
  if (c.intent === "grocery") {
    if (!s.items && !p.usuals) return ask("usuals", "I don't know your usuals yet. What do you normally order?", ["Milk, bread, eggs, bhindi", "Milk, curd, bananas", "Atta, rice, onions"]);
    return think(groceryResults);
  }
  if (c.intent === "food") {
    if (!s.dish) return ask("dish", "Ooh. What are you craving?", ["Spring rolls", "Momos", "Biryani", "Pizza"]);
    return think(foodResults);
  }
  if (c.intent === "meds") {
    if (!s.med) return ask("med", "Which medicine should I reorder? I'll remember it.", ["Vitamin D3 60K", "Paracetamol 650"]);
    return think(medResults);
  }
}

function think(fn) {
  showTalk("Bolo is thinking…", "Checking the best options for you.");
  talkState("thinking");
  setTimeout(() => { talkState(null, "thinking"); fn(); }, 1500);
}

/* ===================== results ===================== */
function openResults(boloText, bodyHtml, ctaLabel, spoken) {
  ctx.stage = "results";
  $("resUser").textContent = ctx.request;
  $("resBolo").textContent = boloText;
  $("resBody").innerHTML = bodyHtml;
  $("ctaBtn").innerHTML = `${esc(ctaLabel)} <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  go("results");
  say(spoken || boloText);
}
$("ctaBtn").addEventListener("click", () => { stopVoice(); confirmCtx(); });

function onResultsReply(t, text) {
  const c = ctx;
  if (NO.test(t) && !YES.test(t)) { stopVoice(); ctx = null; go("home"); return speak("Okay, cancelled. I'm here when you need me."); }
  if (c.intent === "ride") {
    const pick = c.options.findIndex((o) => t.includes(o.app.toLowerCase()) && (!/\b(auto|bike|cab)\b/.test(t) || t.includes(o.type)));
    if (/cheap|sasta/.test(t)) return selectRide(c.cheapest, true);
    if (/fast|jaldi|quick/.test(t)) return selectRide(c.fastest, true);
    if (pick >= 0) return selectRide(pick, true);
  }
  if (c.intent === "grocery") {
    const add = t.match(/\b(add|plus|also|aur)\s+(.+)/), rem = t.match(/\b(remove|hata|hatao|without|no more|drop)\s+(.+)/);
    if (rem) { const k = findItem(rem[2]) || rem[2].trim(); const it = c.basket.find((b) => b.key === k); if (it) it.qty = 0; renderBasket(); return say(`Removed ${itemInfo(k).name.split(" ")[0].toLowerCase()}. Anything else, or shall I place the order?`); }
    if (add) { const keys = csv(add[2]).map((w) => findItem(w) || w); keys.forEach(addToBasket); renderBasket(); return say(`Added ${list(keys.map((k) => itemInfo(k).name.split(",")[0].toLowerCase()))}. Total is now ${rupee(basketTotal(c.app).total)}. Shall I order?`); }
    const app = GROCERS.find((g) => t.includes(g.app.toLowerCase()));
    if (app && !YES.test(t)) { c.app = app.app; renderBasket(); return say(`Switched to ${app.app}. That's ${rupee(basketTotal(app.app).total)} with fees. Shall I order?`); }
  }
  if (c.intent === "food" || c.intent === "meds") {
    const i = c.options.findIndex((o) => t.includes(o.app.toLowerCase().split(" ")[0]) || (o.place && t.includes(o.place.toLowerCase().split(" ")[0])));
    if (/cheap|sasta/.test(t)) { c.sel = c.cheapest; renderPicks(); return say(`Going with the cheapest, ${c.options[c.sel].place || c.options[c.sel].app}. Shall I order?`); }
    if (i >= 0 && !YES.test(t)) { c.sel = i; renderPicks(); return say(`${c.options[i].place || c.options[i].app} it is. Shall I order?`); }
  }
  if (YES.test(t)) return confirmCtx();
  say("Sorry, should I go ahead? You can say yes, no, or pick a different option.");
}

/* ---------- rides ---------- */
function rideResults() {
  const c = ctx, s = c.slots, p = db.profile;
  const km = Math.round((4 + (hash(s.drop) % 140) / 10) * 10) / 10;
  const travel = Math.round(km * 3.2 + 5);
  let allowed = s.type ? [s.type] : ["cab", "auto", "bike"];
  if (!s.type && p.bike === "no") allowed = ["cab", "auto"];
  const day = new Date().toDateString();
  let opts = RIDES.filter((r) => allowed.includes(r.type) && (!s.app || r.app === s.app)).map((r) => ({
    ...r,
    price: Math.round((r.base + r.km * km) * jitter(r.name + day + s.drop, 0.07)),
    eta: 2 + (hash(r.name + s.drop + day) % 7),
  }));
  // keep the best option per app and type, then the top four
  opts.sort((a, b) => a.price - b.price);
  const cheapestOpt = opts[0];
  if (s.urgent) opts.sort((a, b) => a.eta - b.eta || a.price - b.price);
  opts = opts.slice(0, 4);
  if (cheapestOpt && !opts.includes(cheapestOpt)) opts[3] = cheapestOpt;
  c.km = km; c.travel = travel;
  c.cheapest = opts.reduce((m, o, i) => (o.price < opts[m].price ? i : m), 0);
  c.fastest = opts.reduce((m, o, i) => (o.eta < opts[m].eta ? i : m), 0);
  c.options = opts;
  c.sel = s.urgent ? c.fastest : c.cheapest;

  let timing = "";
  if (s.when === "by") {
    const leaveBy = new Date(s.arriveBy - (travel + 5) * 6e4);
    if (leaveBy < Date.now()) { timing = ` You're cutting it close, so I've put the fastest pickup first.`; c.sel = c.fastest; }
    else timing = ` To reach by ${timeStr(new Date(s.arriveBy))}, leave by ${timeStr(leaveBy)}.`;
  }
  const best = opts[c.sel];
  const when = s.when === "by" ? ` for ${timeStr(new Date(s.arriveBy))}` : "";
  const boloText = `Here are the best options I found${when}.${timing}`;
  const why = c.sel === c.cheapest && c.sel === c.fastest ? "cheapest and fastest" : c.sel === c.cheapest ? "cheapest" : "fastest";
  const spoken = `${rideLabel(best)} is the ${why} at ${rupee(best.price)}, ${best.eta} minutes away.${timing} Shall I book it?`;
  openResults(boloText, `<div id="picks"></div><p class="note">Estimated fares for about ${km} km to ${esc(s.drop)}. Prices in the apps may differ.</p>`, "Confirm & Book", spoken);
  renderPicks();
}
function selectRide(i, voice) {
  ctx.sel = i; renderPicks();
  const o = ctx.options[i];
  if (voice) say(`${rideLabel(o)}, ${rupee(o.price)}, ${o.eta} minutes away. Shall I book it?`);
}
function renderPicks() {
  const c = ctx, box = $("picks") || $("resBody");
  if (!c || !c.options) return;
  box.innerHTML = c.options.map((o, i) => {
    const tags = [];
    if (i === c.cheapest) tags.push(`<span class="tag tag-green">Cheapest</span>`);
    if (i === c.fastest && c.intent !== "meds") tags.push(`<span class="tag tag-green">Fastest</span>`);
    const extra = (o.tags || []).map((x, j) => (j === 0 && c.intent === "ride" && ["Prime"].includes(x) ? `<span class="tag tag-grey">${x}</span>` : `<span>${esc(x)}</span>`)).join(" · ");
    const sub = c.intent === "ride" ? `${o.eta} min away` : o.sub;
    return `<button class="opt ${i === c.sel ? "sel" : ""}" data-pick="${i}">
      ${logo(o.app)}
      <span class="o-name">${esc(o.place || o.name)}</span>
      <span class="o-price">${rupee(o.price)}</span>
      <span class="radio" style="grid-row: span 2"></span>
      <span class="o-sub">${esc(sub)}</span>
      <span></span>
      <span class="o-tags">${tags.join("")}${extra}</span>
    </button>`;
  }).join("");
}
$("resBody").addEventListener("click", (e) => {
  const p = e.target.closest("[data-pick]");
  if (p) { ctx.sel = +p.dataset.pick; renderPicks(); return; }
  const q = e.target.closest("[data-q]");
  if (q) { const [k, d] = q.dataset.q.split("|"); const it = ctx.basket.find((b) => b.key === k); it.qty = Math.max(0, it.qty + +d); renderBasket(); return; }
  const a = e.target.closest("[data-add]");
  if (a) { addToBasket(a.dataset.add); renderBasket(); return; }
  const g = e.target.closest("[data-app]");
  if (g) { ctx.app = g.dataset.app; renderBasket(); }
});

/* ---------- groceries ---------- */
function addToBasket(k) {
  const it = ctx.basket.find((b) => b.key === k);
  if (it) it.qty = Math.max(1, it.qty + (it.qty ? 1 : 1)); else ctx.basket.push({ key: k, qty: 1 });
}
function basketTotal(app) {
  const g = GROCERS.find((x) => x.app === app);
  const items = ctx.basket.reduce((sum, b) => sum + Math.round(itemInfo(b.key).price * g.mult) * b.qty, 0);
  const delivery = items >= 199 || !items ? 0 : g.delivery;
  const handling = items ? g.handling : 0;
  return { items, delivery, handling, total: items + delivery + handling };
}
function groceryResults() {
  const c = ctx, s = c.slots;
  const keys = s.items || csv(db.profile.usuals).map((w) => findItem(w) || w.toLowerCase());
  c.basket = [...new Set(keys)].map((k) => ({ key: k, qty: 1 }));
  const totals = GROCERS.map((g) => ({ app: g.app, total: basketTotal(g.app).total }));
  const cheapest = totals.reduce((m, x) => (x.total < m.total ? x : m));
  c.app = s.app || cheapest.app;
  // suggest a change from last week's vegetable
  const lastVeg = (db.lastGrocery || []).find((k) => VEG.includes(k));
  const ideas = VEG.filter((v) => v !== lastVeg && !c.basket.some((b) => b.key === v)).slice(0, 3);
  c.ideas = ideas;
  const names = c.basket.map((b) => itemInfo(b.key).name.split(/,| \d/)[0].toLowerCase());
  const usualWord = s.items ? "Here's your order" : "Here are your usuals";
  let spoken = `${usualWord} from ${c.app}: ${list(names)}. That's ${rupee(basketTotal(c.app).total)} with fees.`;
  if (lastVeg) spoken += ` You had ${lastVeg} last week. Craving something else? Maybe ${list(ideas.slice(0, 2))}.`;
  else spoken += ` Want to add anything, like ${list(ideas.slice(0, 2))}?`;
  if (s.app && cheapest.app !== s.app && basketTotal(s.app).total - cheapest.total >= 5) spoken += ` By the way, ${cheapest.app} is ${rupee(basketTotal(s.app).total - cheapest.total)} cheaper today.`;
  spoken += " Shall I place the order?";
  const boloText = `${usualWord}${lastVeg ? `. You had ${lastVeg} last week, so here are a few swaps too.` : "."} Check it once before I order.`;
  openResults(boloText, `<div id="basket"></div>`, "Confirm & Order", spoken);
  renderBasket();
}
function renderBasket() {
  const c = ctx, t = basketTotal(c.app);
  const rows = c.basket.map((b) => {
    const it = itemInfo(b.key); const g = GROCERS.find((x) => x.app === c.app);
    return `<div class="item ${b.qty ? "" : "off"}"><span class="em">${it.emoji}</span><span>${esc(it.name)}</span>
      <span class="qty"><button data-q="${b.key}|-1" aria-label="Less">−</button>${b.qty}<button data-q="${b.key}|1" aria-label="More">+</button></span>
      <span class="pr">${rupee(Math.round(it.price * g.mult) * b.qty)}</span></div>`;
  }).join("");
  const cmp = GROCERS.map((g) => {
    const x = basketTotal(g.app);
    return `<button class="cmp ${g.app === c.app ? "sel" : ""}" data-app="${g.app}"><b>${g.app}</b><span>${rupee(x.total)}</span><small>incl. fees</small></button>`;
  }).join("");
  const ideas = (c.ideas || []).filter((k) => !c.basket.some((b) => b.key === k && b.qty)).map((k) => `<button class="addchip" data-add="${k}">${itemInfo(k).emoji} + ${esc(itemInfo(k).name.split(/[ ,]/)[0])}</button>`).join("");
  $("basket").innerHTML = `
    <div class="card"><div class="items">${rows}</div>
      <div class="totals"><span>Total on ${esc(c.app)}</span><span>${rupee(t.total)}</span></div>
      <div class="fees">Items ${rupee(t.items)} · handling ${rupee(t.handling)} · delivery ${t.delivery ? rupee(t.delivery) : "free"}</div></div>
    ${ideas ? `<p class="sec-title">Craving something different?</p><div class="sug-row">${ideas}</div>` : ""}
    <p class="sec-title">Same basket on other apps</p><div class="compare">${cmp}</div>
    <p class="note">Estimated prices, fees included. Say “add paneer”, “remove eggs” or “switch to Zepto”.</p>`;
}

/* ---------- food ---------- */
function foodResults() {
  const c = ctx, s = c.slots, dish = s.dish;
  const pool = KITCHENS.slice().sort((a, b) => hash(a + dish) - hash(b + dish)).slice(0, 3);
  const base = 140 + (hash(dish) % 180);
  c.options = pool.map((place, i) => {
    const app = s.app || (hash(place) % 2 ? "Swiggy" : "Zomato");
    const price = Math.round(base * jitter(place + dish, 0.15)) + 25;
    const eta = 20 + (hash(place + dish + "eta") % 22);
    return { app, place, price, eta, sub: `${cap(dish)} · ${app} · ${eta} min`, tags: [] };
  });
  c.cheapest = c.options.reduce((m, o, i) => (o.price < c.options[m].price ? i : m), 0);
  c.fastest = c.options.reduce((m, o, i) => (o.eta < c.options[m].eta ? i : m), 0);
  c.sel = c.cheapest;
  const o = c.options[c.sel];
  openResults(`Found ${dish} near you. Prices include delivery.`, `<div id="picks"></div><p class="note">Estimated prices including delivery. Say “the fastest one” or name a place.</p>`, "Confirm & Order",
    `${cap(dish)} from ${o.place} on ${o.app} is the best deal at ${rupee(o.price)}, arriving in about ${o.eta} minutes.${c.fastest !== c.sel ? ` ${c.options[c.fastest].place} is quicker at ${c.options[c.fastest].eta} minutes.` : ""} Shall I order?`);
  renderPicks();
}

/* ---------- medicines ---------- */
function medResults() {
  const c = ctx, med = c.slots.med;
  const base = 90 + (hash(med) % 360);
  c.options = PHARMA.map((app) => {
    const fast = hash(app + med) % 3 === 0;
    return { app, name: app, price: Math.round(base * jitter(app + med, 0.12)), sub: `${med} · ${fast ? "Delivery today" : "Delivery tomorrow"}`, tags: [] };
  });
  c.cheapest = c.options.reduce((m, o, i) => (o.price < c.options[m].price ? i : m), 0);
  c.fastest = -1;
  c.sel = c.cheapest;
  const o = c.options[c.sel];
  openResults(`Same as last time: ${med}. I compared three pharmacies.`, `<div id="picks"></div><p class="note">Estimated prices. Prescription medicines need a valid prescription uploaded in the pharmacy app.</p>`, "Confirm & Order",
    `${med} is cheapest on ${o.app} at ${rupee(o.price)}, ${o.sub.split("· ")[1].toLowerCase()}. Shall I reorder it?`);
  renderPicks();
}

/* ===================== confirmation ===================== */
function confirmCtx() {
  const c = ctx;
  if (!c) return;
  if (c.intent === "ride") return doneRide();
  if (c.intent === "grocery") return doneGrocery();
  return donePick();
}
function record(entry) { db.history.unshift({ ...entry, at: Date.now() }); db.history = db.history.slice(0, 40); save(); }
const ICON = {
  from: `<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/></svg>`,
  live: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg>`,
  open: `<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>`,
  chev: `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`,
};
function actions(app, shareText) {
  return `<a class="act" href="${LINKS[app] || "#"}" target="_blank" rel="noopener"><span>${ICON.open}Open ${esc(app)} to finish</span>${ICON.chev}</a>
    <button class="act" id="shareBtn"><span>${ICON.share}Share details</span>${ICON.chev}</button>`;
}
function wireShare(text) {
  $("shareBtn").onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: "Bolo", text }); else { await navigator.clipboard.writeText(text); toast("Details copied"); } }
    catch (_) { /* cancelled */ }
  };
}
function doneRide() {
  const c = ctx, o = c.options[c.sel], s = c.slots;
  const from = db.profile.home || "Current location";
  $("doneSub").textContent = `Your ${o.app} ride has been booked.`;
  $("doneBody").innerHTML = `
    <div class="mapcard">
      <svg viewBox="0 0 360 130" preserveAspectRatio="none">
        <g stroke="#D9DCE2" stroke-width="7" fill="none"><path d="M0 40 H360"/><path d="M0 98 H360"/><path d="M70 0 V130"/><path d="M200 0 V130"/><path d="M300 0 V130"/><path d="M20 130 L140 0"/></g>
        <path d="M54 72 C 110 72, 120 86, 170 82 S 250 100, 300 100" stroke="#1B1D22" stroke-width="3" fill="none"/>
        <circle cx="54" cy="72" r="7" fill="#3B6CF6" stroke="#fff" stroke-width="3"/>
        <circle cx="300" cy="100" r="7" fill="#1B1D22" stroke="#fff" stroke-width="3"/>
      </svg>
      <div class="eta-chip"><b>~ ${c.travel} min</b><br>${c.km} km</div>
    </div>
    <div class="detail">
      <div class="d-head">${logo(o.app)}<span class="o-name">${esc(o.app)}</span><span class="o-price">${rupee(o.price)}</span><span class="o-sub">${cap(o.type)} · Arriving in ${o.eta} min</span></div>
      <div class="d-row">${ICON.from}<div><small>From</small>${esc(from)}</div></div>
      <div class="d-row">${ICON.from}<div><small>To</small>${esc(s.drop)}</div></div>
    </div>
    <button class="act" id="liveBtn"><span>${ICON.live}View live location</span>${ICON.chev}</button>
    ${actions(o.app)}`;
  const share = `I'm on a ${rideLabel(o)} from ${from} to ${s.drop}, arriving in about ${c.travel + o.eta} minutes.`;
  wireShare(share);
  $("liveBtn").onclick = () => toast(`Live tracking opens in ${o.app} once booked there`);
  record({ app: o.app, title: `${rideLabel(o)} to ${s.drop}`, amount: o.price });
  finish(`All set! Your ${rideLabel(o)} is arriving in ${o.eta} minutes.`);
}
function doneGrocery() {
  const c = ctx, t = basketTotal(c.app), items = c.basket.filter((b) => b.qty);
  if (!items.length) { toast("Your basket is empty"); return; }
  db.lastGrocery = items.map((b) => b.key);
  $("doneSub").textContent = `Your ${c.app} order has been placed.`;
  $("doneBody").innerHTML = `
    <div class="detail solo">
      <div class="d-head">${logo(c.app)}<span class="o-name">${items.length} items</span><span class="o-price">${rupee(t.total)}</span><span class="o-sub">Arriving in about ${10 + (hash(c.app) % 9)} min</span></div>
      <div class="items">${items.map((b) => { const it = itemInfo(b.key); return `<div class="item"><span class="em">${it.emoji}</span><span>${esc(it.name)}</span><span>×${b.qty}</span><span></span></div>`; }).join("")}</div>
    </div>
    ${actions(c.app)}`;
  wireShare(`Bolo order on ${c.app}: ${items.map((b) => itemInfo(b.key).name + " x" + b.qty).join(", ")}. Total ${rupee(t.total)}.`);
  record({ app: c.app, title: `Groceries: ${list(items.map((b) => itemInfo(b.key).name.split(/,| \d/)[0].toLowerCase()))}`, amount: t.total });
  finish(`Done! Your ${c.app} order is on its way.`);
}
function donePick() {
  const c = ctx, o = c.options[c.sel];
  const what = c.intent === "food" ? `${cap(c.slots.dish)} from ${o.place}` : c.slots.med;
  $("doneSub").textContent = `Your ${o.app} order has been placed.`;
  $("doneBody").innerHTML = `
    <div class="detail solo">
      <div class="d-head">${logo(o.app)}<span class="o-name">${esc(what)}</span><span class="o-price">${rupee(o.price)}</span><span class="o-sub">${c.intent === "food" ? `Arriving in about ${o.eta} min` : esc(o.sub.split("· ")[1])}</span></div>
    </div>
    ${actions(o.app)}`;
  wireShare(`Bolo order on ${o.app}: ${what}, ${rupee(o.price)}.`);
  record({ app: o.app, title: what, amount: o.price });
  finish(c.intent === "food" ? `Done! Your ${c.slots.dish} will arrive in about ${o.eta} minutes. Enjoy!` : `Done! ${what} has been reordered.`);
}
function finish(line) {
  ctx = null;
  go("done");
  speak(line);
}

/* ===================== home, activity, profile ===================== */
function renderHome() {
  const n = db.profile.name.trim().split(" ")[0];
  $("greet").innerHTML = `Hey ${n ? esc(n) : "there"},<br>what can I do<br>for you today?`;
  $("setupCard").hidden = !!(db.profile.name && (db.profile.home || db.profile.work));
}
function renderActivity() {
  const box = $("activityList");
  if (!db.history.length) { box.innerHTML = `<p class="empty">Nothing yet.<br>Tap the orb and ask Bolo for a ride, your usuals or a craving.</p>`; return; }
  box.innerHTML = db.history.map((h) => `
    <div class="card hist">${logo(h.app)}<span class="o-name">${esc(h.title)}</span><span class="o-price">${rupee(h.amount)}</span>
      <span class="o-sub">${esc(h.app)} · ${new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div>`).join("");
}
const PF = { pName: "name", pHome: "home", pWork: "work", pBike: "bike", pUsuals: "usuals", pMeds: "meds" };
function renderProfile() { for (const [id, k] of Object.entries(PF)) $(id).value = db.profile[k] || ""; }
$("profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  for (const [id, k] of Object.entries(PF)) db.profile[k] = $(id).value.trim();
  save(); toast("Saved. Bolo will remember this."); go("home");
});

/* ===================== boot ===================== */
go("home");
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
