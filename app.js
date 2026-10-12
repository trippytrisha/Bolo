/* Bolo, the consumer guardian.
   Price X-ray, Ride Watch and Money Back. Everything is stored only in this
   browser (localStorage); nothing is sent to any server. */

"use strict";

/* ================= storage ================= */
const STORE_KEY = "bolo.guardian.v1";
const blank = () => ({ compare: [], checks: 0, trips: [], cases: [], activeRide: null, name: "" });
const state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (_) { /* storage blocked or corrupt */ }
  return blank();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* private mode */ }
}

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) && n > 0 ? n : 0; };
const rupee = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const clock = (t) => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch (_) { toast("Select the text and copy it manually"); }
}

/* ================= reference data ================= */
// Categories from the Guidelines for Prevention and Regulation of Dark Patterns, 2023 (CCPA).
const PATTERNS = {
  drip: { name: "Drip pricing", text: "Charges revealed only late in the purchase, or a final amount higher than the price shown at the start." },
  basket: { name: "Basket sneaking", text: "A product, service, pass, donation or tip added at checkout without your clear consent." },
  bait: { name: "Bait and switch", text: "One outcome advertised, such as a short wait or a delivery time, and a worse one delivered." },
};
const DEFICIENCY = "This is a deficiency in service under the Consumer Protection Act, 2019.";

const FEES = [
  { id: "delivery", label: "Delivery fee", color: "#2EA8E6", keys: ["delivery"] },
  { id: "handling", label: "Handling fee", color: "#E0457B", keys: ["handling"] },
  { id: "platform", label: "Platform fee", color: "#5B5BD6", keys: ["platform"] },
  { id: "smallcart", label: "Small cart fee", color: "#F4A300", keys: ["small cart", "small order", "minimum order"] },
  { id: "surge", label: "Surge / high demand", color: "#E5484D", keys: ["surge", "high demand", "peak"] },
  { id: "rain", label: "Rain / weather fee", color: "#0EA5E9", keys: ["rain", "weather"] },
  { id: "packaging", label: "Packaging fee", color: "#A855F7", keys: ["packaging", "packing"] },
  { id: "convenience", label: "Convenience fee", color: "#14B8A6", keys: ["convenience"] },
  { id: "tax", label: "Taxes / GST", color: "#94A3B8", keys: ["gst", "tax"] },
  { id: "tip", label: "Tip (pre-added)", color: "#FB923C", keys: ["tip"] },
  { id: "pass", label: "Pass / membership", color: "#DB2777", keys: ["pass", "membership", "subscription"] },
  { id: "donation", label: "Donation", color: "#84CC16", keys: ["donat", "feeding india", "charity"] },
];
const feeById = (id) => FEES.find((f) => f.id === id) || { id, label: id, color: "#94A3B8" };

const ISSUES = {
  hidden_fee: { label: "Hidden or late-added fee", pattern: "drip", verb: "was charged a fee that was only shown at the final checkout step" },
  sneaked: { label: "Pass, tip or item added without consent", pattern: "basket", verb: "found a pass, tip or item added to my order without my consent" },
  overcharge: { label: "Charged more than the quoted fare", pattern: "drip", verb: "was charged more than the fare quoted when I booked" },
  cancel_fee: { label: "Unfair cancellation fee", pattern: null, verb: "was charged a cancellation fee for a ride the driver did not complete" },
  late: { label: "Much later than promised", pattern: "bait", verb: "received the service much later than the time promised" },
  missing: { label: "Missing, wrong or damaged item", pattern: null, verb: "received a missing, wrong or damaged item" },
  refund: { label: "Refund not received", pattern: null, verb: "have not received a refund that is due to me" },
};
const STATUSES = ["Open", "Complained", "Escalated", "Refunded", "Closed"];

const RIDE_EVENTS = [
  { id: "asked_dest", icon: "🗺️", label: "Asked where I'm going", hot: true },
  { id: "cash", icon: "💵", label: "Refused UPI / wants cash", hot: true },
  { id: "stalled", icon: "🐢", label: "Driver not moving", hot: true },
  { id: "asked_cancel", icon: "🙅", label: "Asked me to cancel", hot: true },
  { id: "cancelled", icon: "❌", label: "Driver cancelled", hot: true },
  { id: "arrived", icon: "✅", label: "Driver arrived", hot: false },
];
const evLabel = (id) => (RIDE_EVENTS.find((e) => e.id === id) || { label: id }).label;

/* ================= navigation ================= */
function go(view) {
  if (!$("view-" + view)) view = "home";
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.go === view));
  if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  window.scrollTo(0, 0);
  renderAll();
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) go(g.dataset.go);
});

window.addEventListener("hashchange", () => {
  const v = location.hash.slice(1);
  if ($("view-" + v) && !$("view-" + v).classList.contains("active")) go(v);
});

/* ================= home ================= */
function moneyTotals() {
  let stake = 0, back = 0, open = 0;
  for (const c of state.cases) {
    if (c.status === "Refunded") back += c.amount;
    else if (c.status !== "Closed") { stake += c.amount; open++; }
  }
  return { stake, back, open };
}
function renderHome() {
  const t = moneyTotals();
  $("stStake").textContent = rupee(t.stake);
  $("stBack").textContent = rupee(t.back);
  $("stRides").textContent = state.trips.length + (state.activeRide ? 1 : 0);
  $("stChecks").textContent = state.checks;
  const b = $("activeBanner");
  if (state.activeRide) {
    b.innerHTML = `<span>🛺 Watching your ${esc(state.activeRide.app)} ${esc(state.activeRide.type.toLowerCase())}</span><button data-go="ride">Open</button>`;
    b.classList.remove("hidden");
  } else b.classList.add("hidden");
}

/* ---------- voice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
if (SR) {
  recog = new SR();
  recog.lang = "en-IN";
  recog.interimResults = true;
  recog.onresult = (e) => {
    const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
    $("heard").textContent = "“" + text + "”";
    if (e.results[e.results.length - 1].isFinal) route(text);
  };
  recog.onend = () => $("orb").classList.remove("listening");
  recog.onerror = () => { $("orb").classList.remove("listening"); $("hint").textContent = "Couldn't hear that. Tap a tile below instead."; };
}
function route(text) {
  const t = text.toLowerCase();
  if (/refund|complain|money back|paisa|wapas|shikayat|overcharg/.test(t)) return go("money");
  if (/driver|cab|ride|auto|bike|rapido|uber|ola|pickup|late|nahi aa|cancel/.test(t)) return go("ride");
  if (/price|bill|fee|checkout|cart|charge|handling|delivery|zepto|blinkit|instamart|zomato|swiggy|kitna/.test(t)) return go("price");
  $("hint").textContent = "Try: “check this bill”, “my driver is late” or “refund chahiye”.";
}
$("orb").addEventListener("click", () => {
  if (!recog) { $("hint").textContent = "Voice works in Chrome. Tap a tile below instead."; return; }
  $("heard").textContent = "";
  $("orb").classList.add("listening");
  try { recog.start(); } catch (_) { /* already listening */ }
});

/* ================= PRICE X-RAY ================= */
let feeDraft = []; // [{id, amount}]

function renderFeeChips() {
  $("feeChips").innerHTML = FEES.map((f) =>
    `<button class="chip" data-fee="${f.id}"><span class="sw" style="background:${f.color}"></span>${f.label}</button>`).join("") +
    `<button class="chip" data-fee="other">＋ Other</button>`;
}
function renderFeeRows() {
  $("feeRows").innerHTML = feeDraft.map((r, i) => {
    const f = feeById(r.id);
    return `<div class="feerow">
      <i class="sw" style="background:${f.color}"></i>
      <span>${esc(r.label || f.label)}</span>
      <input type="number" inputmode="decimal" min="0" placeholder="₹" value="${r.amount || ""}" data-row="${i}">
      <button class="x" data-del="${i}" aria-label="Remove">✕</button>
    </div>`;
  }).join("");
}
$("feeChips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-fee]");
  if (!c) return;
  let id = c.dataset.fee, label;
  if (id === "other") {
    label = prompt("Name of the charge", "Service fee");
    if (!label) return;
    id = "other-" + uid();
  }
  feeDraft.push({ id, label, amount: 0 });
  renderFeeRows();
  const inputs = $("feeRows").querySelectorAll("input");
  inputs[inputs.length - 1].focus();
});
$("feeRows").addEventListener("input", (e) => {
  if (e.target.dataset.row !== undefined) feeDraft[+e.target.dataset.row].amount = num(e.target.value);
});
$("feeRows").addEventListener("click", (e) => {
  const d = e.target.closest("[data-del]");
  if (!d) return;
  feeDraft.splice(+d.dataset.del, 1);
  renderFeeRows();
});

function analyzeQuote(q) {
  const fees = q.fees.filter((f) => f.amount > 0);
  const extra = fees.reduce((s, f) => s + f.amount, 0);
  const total = q.base + extra;
  const pct = q.base ? (extra / q.base) * 100 : 0;
  const flags = [];
  const has = (id) => fees.some((f) => f.id === id);
  if (q.late && extra > 0) flags.push({ kind: "bad", pattern: "drip", text: `${rupee(extra)} in charges appeared only at the last step.` });
  if (q.pre && (has("pass") || has("tip") || has("donation")))
    flags.push({ kind: "bad", pattern: "basket", text: "A pass, tip or donation was already ticked for you. Untick it before paying." });
  else if (q.pre) flags.push({ kind: "bad", pattern: "basket", text: "Something was pre-selected for you. Check every ticked box before paying." });
  if (pct >= 25) flags.push({ kind: "warn", text: `Fees add ${Math.round(pct)}% on top of the price you were shown.` });
  if (has("smallcart")) flags.push({ kind: "tip", text: "A small cart fee applies. Adding an item you need anyway may cost less than the fee." });
  if (has("surge") || has("rain")) flags.push({ kind: "tip", text: "Demand or weather charges change quickly. Check another app or retry in a few minutes." });
  if (!flags.length) flags.push({ kind: "good", text: extra ? "No red flags found in the charges you entered." : "No extra charges. What you saw is what you pay." });
  return { fees, extra, total, pct, flags };
}

$("pAnalyze").addEventListener("click", () => {
  const base = num($("pBase").value);
  if (!base) { toast("Enter the price you were shown first"); $("pBase").focus(); return; }
  const q = {
    id: uid(), app: $("pApp").value, base,
    fees: feeDraft.map((f) => ({ ...f })), late: $("fLate").checked, pre: $("fPre").checked, at: Date.now(),
  };
  state.compare.push(q);
  state.checks++;
  save();
  resetPriceForm(false);
  renderPrice();
  $("priceResults").scrollIntoView({ behavior: "smooth", block: "start" });
  toast(state.compare.length > 1 ? "Added to comparison" : "Add the same cart from another app to compare");
});
$("pReset").addEventListener("click", () => resetPriceForm(true));
function resetPriceForm(all) {
  feeDraft = [];
  $("pBase").value = "";
  $("fLate").checked = false;
  $("fPre").checked = false;
  $("scanStatus").textContent = "Beta: reads the charges for you. You can also type them below.";
  renderFeeRows();
  if (all) { state.compare = []; save(); renderPrice(); }
}

function renderPrice() {
  const box = $("priceResults");
  if (!state.compare.length) { box.innerHTML = ""; return; }
  const rows = state.compare.map((q) => ({ q, a: analyzeQuote(q) })).sort((x, y) => x.a.total - y.a.total);
  const best = rows[0].a.total;
  const multi = rows.length > 1;
  box.innerHTML = rows.map(({ q, a }, i) => {
    const segs = [{ label: "Price shown", amount: q.base, color: "#0F9D8A" }]
      .concat(a.fees.map((f) => ({ label: f.label || feeById(f.id).label, amount: f.amount, color: feeById(f.id).color })));
    const bar = segs.map((s) => `<i style="width:${(s.amount / a.total) * 100}%;background:${s.color}" title="${esc(s.label)}"></i>`).join("");
    const legend = segs.map((s) => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.label)} <b>${rupee(s.amount)}</b></span>`).join("");
    const flags = a.flags.map((f) => `<div class="flag ${f.kind}">${f.pattern ? `<b>${PATTERNS[f.pattern].name}</b>` : ""}${esc(f.text)}</div>`).join("");
    const badge = !multi ? "" : i === 0 ? `<span class="badge b-best">Best deal</span>` : `<span class="badge b-more">${rupee(a.total - best)} more</span>`;
    const canLog = a.flags.some((f) => f.pattern);
    return `<div class="result ${multi && i === 0 ? "best" : ""}">
      <div class="r-head">
        <div><div class="r-app">${esc(q.app)}</div>${badge}</div>
        <div class="r-total">${rupee(a.total)}<small>${a.extra ? `+${rupee(a.extra)} (${Math.round(a.pct)}%) over shown price` : "no extra charges"}</small></div>
      </div>
      <div class="bar">${bar}</div>
      <div class="legend">${legend}</div>
      <div class="flags">${flags}</div>
      <div class="r-actions">
        ${canLog ? `<button class="btn small g-money" data-logq="${q.id}">Log for refund</button>` : ""}
        <button class="btn small ghost" data-rmq="${q.id}">Remove</button>
      </div>
    </div>`;
  }).join("") + `<p class="help">Prices you enter stay on this phone. Add the same cart from another app to see which is really cheapest.</p>`;
}
$("priceResults").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rmq]");
  if (rm) { state.compare = state.compare.filter((q) => q.id !== rm.dataset.rmq); save(); renderPrice(); return; }
  const lg = e.target.closest("[data-logq]");
  if (!lg) return;
  const q = state.compare.find((x) => x.id === lg.dataset.logq);
  const a = analyzeQuote(q);
  const sneaky = a.fees.filter((f) => ["pass", "tip", "donation"].includes(f.id));
  const rest = a.fees.filter((f) => !sneaky.includes(f));
  const list = (fs) => fs.map((f) => `${f.label || feeById(f.id).label} ${rupee(f.amount)}`).join(", ");
  const head = `Price shown was ${rupee(q.base)}; final amount ${rupee(a.total)}.`;
  let added = 0;
  if (q.pre && sneaky.length) {
    addCase({ app: q.app, type: "sneaked", amount: sneaky.reduce((s, f) => s + f.amount, 0), date: today(),
      note: `${head} Pre-selected without my consent: ${list(sneaky)}.` });
    added++;
  }
  const lateFees = q.pre && sneaky.length ? rest : a.fees;
  if ((q.late || !added) && lateFees.length) {
    addCase({ app: q.app, type: "hidden_fee", amount: lateFees.reduce((s, f) => s + f.amount, 0), date: today(),
      note: `${head} Charges added: ${list(lateFees)}.` + (q.late ? " These appeared only at the final checkout step." : "") });
    added++;
  }
  toast(added > 1 ? "2 cases added to Money Back" : "Case added to Money Back");
  return;
  toast("Case added to Money Back");
});

/* ---------- screenshot scan (beta) ---------- */
$("scanInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const st = $("scanStatus");
  st.textContent = "Loading the reader…";
  try {
    if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    st.textContent = "Reading your screenshot…";
    const { data } = await window.Tesseract.recognize(file, "eng", {
      logger: (m) => { if (m.status === "recognizing text") st.textContent = `Reading… ${Math.round(m.progress * 100)}%`; },
    });
    const found = parseReceipt(data.text);
    if (found.base) $("pBase").value = found.base;
    feeDraft = found.fees;
    renderFeeRows();
    st.textContent = found.base || found.fees.length
      ? `Found ${found.fees.length} charge${found.fees.length === 1 ? "" : "s"}${found.base ? " and the item total" : ""}. Check the amounts below.`
      : "Couldn't find prices in that image. Please type them below.";
  } catch (_) {
    st.textContent = "The reader needs an internet connection. Please type the charges below.";
  }
  e.target.value = "";
});
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
function parseReceipt(text) {
  const out = { base: 0, fees: [] };
  const seen = new Set();
  for (const raw of text.split(/\n+/)) {
    const line = raw.toLowerCase();
    const m = line.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*$/);
    if (!m) continue;
    const amt = num(m[1]);
    if (!amt) continue;
    if (/item total|items total|subtotal|sub total|cart value|mrp total/.test(line)) { out.base = amt; continue; }
    if (/to pay|grand total|bill total|total payable|amount payable/.test(line)) continue;
    if (/free|waived|saved|discount|off\b/.test(line)) continue;
    const f = FEES.find((fee) => fee.keys.some((k) => line.includes(k)));
    if (f && !seen.has(f.id)) { seen.add(f.id); out.fees.push({ id: f.id, amount: amt }); }
  }
  return out;
}

/* ================= RIDE WATCH ================= */
let ticker = null;

$("rStart").addEventListener("click", () => {
  const eta = Math.max(1, Math.round(num($("rEta").value) || 5));
  state.activeRide = {
    id: uid(), app: $("rApp").value, type: $("rType").value, eta,
    fare: num($("rFare").value), drop: $("rDrop").value.trim(),
    startedAt: Date.now(), events: [{ t: Date.now(), kind: "started" }], phase: "waiting",
  };
  save();
  renderRide();
});

function rideStatus(r) {
  const mins = (Date.now() - r.startedAt) / 60000;
  const ev = (k) => r.events.some((e) => e.kind === k);
  if (r.phase === "riding") return { cls: "st-ride", text: "On the ride" };
  if (ev("cancelled")) return { cls: "st-bad", text: "Driver cancelled" };
  if (mins > r.eta + 2) return { cls: "st-bad", text: `Late by ${Math.floor(mins - r.eta)} min` };
  if (mins > r.eta) return { cls: "st-late", text: "Pickup time passed" };
  if (ev("stalled") || ev("asked_cancel") || ev("cash") || ev("asked_dest")) return { cls: "st-late", text: "Trouble reported" };
  return { cls: "st-ok", text: "On time so far" };
}
function needsRebook(r) {
  if (r.phase !== "waiting") return false;
  const mins = (Date.now() - r.startedAt) / 60000;
  return mins > r.eta + 2 || r.events.some((e) => ["stalled", "asked_cancel", "cancelled", "cash", "asked_dest"].includes(e.kind));
}
function rebookLinks(r) {
  const drop = encodeURIComponent(r.drop || "");
  const links = {
    Uber: r.drop ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${drop}` : "https://m.uber.com/ul/",
    Ola: "https://book.olacabs.com/",
    Rapido: "https://www.rapido.bike/",
    "Namma Yatri": "https://nammayatri.in/",
    inDrive: "https://indrive.com/",
  };
  return Object.entries(links).filter(([app]) => app !== r.app)
    .map(([app, url]) => `<a href="${url}" target="_blank" rel="noopener">Open ${app}</a>`).join("");
}

function renderRide() {
  const r = state.activeRide;
  $("rideForm").classList.toggle("hidden", !!r);
  $("rideLive").classList.toggle("hidden", !r);
  clearInterval(ticker);
  if (r) {
    drawLive();
    ticker = setInterval(drawLive, 1000);
  }
  renderRideHistory();
}

function drawLive() {
  const r = state.activeRide;
  if (!r) return;
  const elapsed = Math.floor((Date.now() - r.startedAt) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0"), ss = String(elapsed % 60).padStart(2, "0");
  const frac = Math.min(1, elapsed / (r.eta * 60));
  const st = rideStatus(r);
  const ringColor = st.cls === "st-bad" ? "#E5484D" : st.cls === "st-late" ? "#F59E0B" : st.cls === "st-ride" ? "#2EA8E6" : "#1FA463";
  const C = 2 * Math.PI * 56;
  const live = $("rideLive");
  // keep the end-of-ride inputs intact while the timer ticks
  const keep = live.querySelector(".endbox") ? { f: $("eFare")?.value, c: $("eCancel")?.value } : null;
  const cancelled = r.events.some((e) => e.kind === "cancelled");
  const eventButtons = r.phase === "waiting" && !cancelled
    ? `<div class="evgrid">${RIDE_EVENTS.map((e) => `<button class="ev ${e.hot ? "hot" : "goodev"}" data-ev="${e.id}"><span>${e.icon}</span>${e.label}</button>`).join("")}</div>`
    : "";
  const endBox = r.phase === "riding" || cancelled
    ? `<div class="endbox">
        ${r.phase === "riding" ? `<label>Final fare charged (₹)<input id="eFare" type="number" inputmode="decimal" placeholder="${r.fare || "e.g. 210"}"></label>` : ""}
        ${cancelled ? `<label>Cancellation fee charged to you, if any (₹)<input id="eCancel" type="number" inputmode="decimal" placeholder="0"></label>` : ""}
        <button class="btn g-ride wide" id="rEnd">${r.phase === "riding" ? "Ride finished" : "Close this ride"}</button>
      </div>`
    : `<button class="btn ghost wide" id="rAbort">Stop watching</button>`;
  live.innerHTML = `<div class="live">
    <div class="live-top">
      <div class="ringwrap">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="56" fill="none" stroke="var(--line)" stroke-width="12"/>
          <circle cx="66" cy="66" r="56" fill="none" stroke="${ringColor}" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
        </svg>
        <div class="tm"><div><b>${mm}:${ss}</b><small>of ${r.eta} min<br>promised</small></div></div>
      </div>
      <div class="live-info">
        <h3>${esc(r.app)} ${esc(r.type)}</h3>
        <p>${r.drop ? "To " + esc(r.drop) : "Drop not set"}${r.fare ? " · quoted " + rupee(r.fare) : ""}</p>
        <span class="status ${st.cls}">${st.text}</span>
      </div>
    </div>
    ${needsRebook(r) ? `<div class="rebook"><h4>⚡ Don't wait. Rebook now</h4>
      <p>Your record is saved with timestamps. Open another app, and if you also try a different ride type you may get picked up sooner.</p>
      <div class="rebook-links">${rebookLinks(r)}</div></div>` : ""}
    ${eventButtons}
    <ul class="timeline">${r.events.map((e) => `<li class="${e.kind !== "started" && e.kind !== "arrived" && e.kind !== "riding" ? "hot" : ""}"><time>${clock(e.t)}</time>${e.kind === "started" ? "Started watching" : e.kind === "riding" ? "Ride started" : esc(evLabel(e.kind))}</li>`).join("")}</ul>
    ${endBox}
  </div>`;
  if (keep) { if ($("eFare")) $("eFare").value = keep.f || ""; if ($("eCancel")) $("eCancel").value = keep.c || ""; }
  // the end-of-ride form doesn't need a ticking timer
  if (r.phase === "riding" || cancelled) clearInterval(ticker);
}

$("rideLive").addEventListener("click", (e) => {
  const r = state.activeRide;
  if (!r) return;
  const b = e.target.closest("[data-ev]");
  if (b) {
    const kind = b.dataset.ev;
    r.events.push({ t: Date.now(), kind });
    if (kind === "arrived") { r.events.push({ t: Date.now(), kind: "riding" }); r.phase = "riding"; }
    save();
    drawLive();
    toast(kind === "arrived" ? "Have a safe ride" : "Logged with time");
    return;
  }
  if (e.target.id === "rAbort") {
    if (confirm("Stop watching this ride? Nothing will be saved.")) { state.activeRide = null; save(); renderRide(); }
    return;
  }
  if (e.target.id === "rEnd") finishRide();
});

function finishRide() {
  const r = state.activeRide;
  const finalFare = num($("eFare")?.value);
  const cancelFee = num($("eCancel")?.value);
  const waited = Math.round(((r.events.find((e) => e.kind === "arrived" || e.kind === "cancelled")?.t || Date.now()) - r.startedAt) / 60000);
  const issues = [];
  const timeline = r.events.map((e) => `${clock(e.t)}  ${e.kind === "started" ? "Booked and started watching" : e.kind === "riding" ? "Ride started" : evLabel(e.kind)}`).join("\n");
  const base = `${r.type} booked on ${r.app}${r.drop ? " to " + r.drop : ""}; pickup promised in ${r.eta} min, actual wait ${waited} min.`;
  if (finalFare && r.fare && finalFare > r.fare)
    issues.push({ type: "overcharge", amount: finalFare - r.fare, note: `${base} Quoted fare ${rupee(r.fare)}, charged ${rupee(finalFare)}.` });
  if (cancelFee && r.events.some((e) => ["cancelled", "asked_cancel", "stalled", "asked_dest", "cash"].includes(e.kind)))
    issues.push({ type: "cancel_fee", amount: cancelFee, note: `${base} Cancellation fee of ${rupee(cancelFee)} charged although the driver did not complete the pickup.` });
  if (waited > r.eta + 5 && !issues.length)
    issues.push({ type: "late", amount: 0, note: `${base}` });
  for (const i of issues) addCase({ app: r.app, type: i.type, amount: i.amount, date: today(), note: i.note, timeline });
  state.trips.unshift({ id: r.id, app: r.app, type: r.type, drop: r.drop, eta: r.eta, waited, startedAt: r.startedAt, issues: issues.length, events: r.events });
  state.trips = state.trips.slice(0, 30);
  state.activeRide = null;
  save();
  renderRide();
  toast(issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""} sent to Money Back` : "Ride saved. All good!");
}

function renderRideHistory() {
  if (!state.trips.length) { $("rideHistory").innerHTML = ""; return; }
  $("rideHistory").innerHTML = `<h3 class="hist-title">Past rides</h3>` + state.trips.slice(0, 8).map((t) => `
    <div class="hist">
      <div><b>${esc(t.app)} ${esc(t.type)}</b><br><span class="muted">${new Date(t.startedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${t.drop ? " · " + esc(t.drop) : ""}</span></div>
      <div style="text-align:right">${t.waited} min wait<br>${t.issues ? `<span class="badge b-more">${t.issues} issue${t.issues > 1 ? "s" : ""}</span>` : `<span class="badge b-best">no issues</span>`}</div>
    </div>`).join("");
}

/* ================= MONEY BACK ================= */
function addCase(c) {
  state.cases.unshift({ id: uid(), status: "Open", created: today(), complainedAt: null, ...c, amount: num(c.amount) });
  save();
  renderMoney();
  renderHome();
}

$("cType").innerHTML = Object.entries(ISSUES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
$("cDate").value = today();
$("cAdd").addEventListener("click", () => {
  const app = $("cApp").value.trim();
  if (!app) { toast("Which app was it?"); $("cApp").focus(); return; }
  addCase({ app, type: $("cType").value, amount: $("cAmt").value, date: $("cDate").value || today(), note: $("cNote").value.trim() });
  $("cApp").value = ""; $("cAmt").value = ""; $("cNote").value = ""; $("cDate").value = today();
  $("newCase").open = false;
  toast("Case saved");
});
$("myName").addEventListener("input", (e) => { state.name = e.target.value; save(); });

function renderMoney() {
  const t = moneyTotals();
  $("mStake").textContent = rupee(t.stake);
  $("mBack").textContent = rupee(t.back);
  $("mOpen").textContent = t.open;
  $("myName").value = state.name || "";
  const list = $("caseList");
  if (!state.cases.length) {
    list.innerHTML = `<div class="empty">No cases yet. Use Price X-ray or Ride Watch, or log one above, and Bolo will help you claim it back.</div>`;
    return;
  }
  list.innerHTML = state.cases.map((c) => {
    const issue = ISSUES[c.type];
    const follow = c.status === "Complained" && c.complainedAt && daysSince(c.complainedAt) >= 7;
    return `<div class="case st-${c.status}">
      <div class="c-head">
        <div><b>${esc(c.app)}</b><div class="c-meta">${issue.label} · ${fmtDate(c.date)}</div>
          ${issue.pattern ? `<span class="badge b-info">${PATTERNS[issue.pattern].name}</span>` : ""}
          ${follow ? `<span class="badge b-follow">Follow up today</span>` : ""}</div>
        <div class="c-amt">${c.amount ? rupee(c.amount) : "—"}</div>
      </div>
      ${c.note ? `<div class="c-note">${esc(c.note)}</div>` : ""}
      <div class="c-row">
        <button class="btn small g-money" data-draft="${c.id}">✍️ Draft complaint</button>
        <select data-status="${c.id}" aria-label="Status">${STATUSES.map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        <button class="btn small ghost" data-delc="${c.id}">Delete</button>
      </div>
    </div>`;
  }).join("");
}
$("caseList").addEventListener("change", (e) => {
  const id = e.target.dataset.status;
  if (!id) return;
  const c = state.cases.find((x) => x.id === id);
  c.status = e.target.value;
  if (c.status === "Complained" && !c.complainedAt) c.complainedAt = today();
  save();
  renderMoney();
  renderHome();
  if (c.status === "Refunded") toast(`🎉 ${rupee(c.amount)} recovered`);
});
$("caseList").addEventListener("click", (e) => {
  const d = e.target.closest("[data-delc]");
  if (d) {
    if (confirm("Delete this case?")) { state.cases = state.cases.filter((c) => c.id !== d.dataset.delc); save(); renderMoney(); renderHome(); }
    return;
  }
  const dr = e.target.closest("[data-draft]");
  if (dr) openDraft(state.cases.find((c) => c.id === dr.dataset.draft));
});

function legalLine(issue) {
  if (!issue.pattern) return DEFICIENCY;
  const p = PATTERNS[issue.pattern];
  return `This appears to be "${p.name}" (${p.text.charAt(0).toLowerCase() + p.text.slice(1, -1)}), a practice listed in the Guidelines for Prevention and Regulation of Dark Patterns, 2023, issued under the Consumer Protection Act, 2019.`;
}
function drafts(c) {
  const issue = ISSUES[c.type];
  const name = state.name || "[Your name]";
  const amt = c.amount ? rupee(c.amount) : "the amount concerned";
  const ask = c.type === "late" && !c.amount
    ? "I request an explanation and appropriate compensation."
    : `I request a refund of ${amt} to my original payment method.`;
  const evidence = [c.note, c.timeline ? "Timestamped record:\n" + c.timeline : ""].filter(Boolean).join("\n\n");
  const support =
`Subject: ${issue.label}, ${fmtDate(c.date)}, refund request

Hello ${c.app} Support,

On ${fmtDate(c.date)}, I ${issue.verb}.

${evidence}

${legalLine(issue)}

${ask} Please confirm the resolution in writing.

Regards,
${name}`;
  const escalation =
`Grievance against: ${c.app}
Nature of complaint: ${issue.label}
Date of transaction: ${fmtDate(c.date)}
Amount involved: ${c.amount ? rupee(c.amount) : "Not applicable"}

On ${fmtDate(c.date)}, I ${issue.verb}. ${legalLine(issue)}

Details:
${evidence || "[Add details]"}

I raised this with ${c.app} on ${c.complainedAt ? fmtDate(c.complainedAt) : "[date you complained]"} and have not received a satisfactory resolution. ${ask}

${name}`;
  return { support, escalation };
}
function openDraft(c) {
  const d = drafts(c);
  $("sheetTitle").textContent = `Complaint to ${c.app}`;
  $("sheetBody").innerHTML = `
    <div class="draft-title">1. Send to ${esc(c.app)} support <button class="btn small g-money" data-copy="support">Copy</button></div>
    <div class="draft">${esc(d.support)}</div>
    <p class="help">Paste this into the app's Help or Support chat, or its support email. Then mark the case as "Complained" so Bolo reminds you to follow up after 7 days.</p>
    <div class="draft-title">2. If they don't resolve it, escalate <button class="btn small g-money" data-copy="escalation">Copy</button></div>
    <div class="draft">${esc(d.escalation)}</div>
    <p class="help">File it with the government's National Consumer Helpline at <a href="https://consumerhelpline.gov.in/" target="_blank" rel="noopener">consumerhelpline.gov.in</a> or by calling 1915. Keep screenshots of the bill or ride as evidence.</p>`;
  $("sheetBody").dataset.case = c.id;
  $("sheet").classList.remove("hidden");
  $("sheetBody").onclick = (e) => {
    const b = e.target.closest("[data-copy]");
    if (b) copy(drafts(c)[b.dataset.copy]);
  };
}
$("sheetClose").addEventListener("click", () => $("sheet").classList.add("hidden"));
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") $("sheet").classList.add("hidden"); });

/* ================= boot ================= */
function renderAll() { renderHome(); renderPrice(); renderRide(); renderMoney(); }
renderFeeChips();
renderFeeRows();
go(location.hash.slice(1) || "home");

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
