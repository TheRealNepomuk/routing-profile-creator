// Routing Profile Creator — page logic
import { START, OSMAND_DEFAULTS, turnsFromSharp, autoName, fileNameFor } from "./settings.js";
import { buildOsmandXml, TEMPLATE_URL } from "./exporters/osmand.js";

const $ = (id) => document.getElementById(id);

const el = {
  maxSpeed: $("maxSpeed"), speedValue: $("speedValue"), defaultSpeed: $("defaultSpeed"),
  turns: $("turns"), turnValue: $("turnValue"), turnDetail: $("turnDetail"),
  lights: $("lights"), lightValue: $("lightValue"),
  slight: $("slightTurn"), round: $("roundaboutTurn"),
  motorroads: $("optMotorroads"), name: $("profileName"),
  download: $("downloadBtn"), status: $("status"),
  sheet: $("sheet"), scrim: $("scrim"), sheetBody: $("sheetBody"), sheetClose: $("sheetClose"),
};

let template = null;
let nameEdited = false;
const vehicle = START.vehicle;

// ---------- settings from the form ----------
const num = (input, fallback, min = 0, max = 1000) => {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

function readSettings() {
  const s = {
    vehicle,
    maxSpeed: +el.maxSpeed.value,
    defaultSpeed: num(el.defaultSpeed, START.defaultSpeed, 5, 200),
    turns: { sharp: +el.turns.value, slight: num(el.slight, 8, 0, 600), roundabout: num(el.round, 5, 0, 600) },
    trafficLightCost: +el.lights.value,
    blockMotorroads: { enabled: el.motorroads.checked },
  };
  s.name = el.name.value.trim() || autoName(s);
  return s;
}

// ---------- UI sync ----------
function setFill(range) {
  const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty("--fill", pct + "%");
}

function turnText() {
  return `Sharp turns. Slight turns get ${num(el.slight, 0)} s, roundabouts ${num(el.round, 0)} s.`;
}

function sync() {
  el.speedValue.textContent = el.maxSpeed.value;
  el.turnValue.textContent = el.turns.value;
  el.lightValue.textContent = el.lights.value;
  el.turnDetail.textContent = turnText();
  [el.maxSpeed, el.turns, el.lights].forEach(setFill);
  if (!nameEdited) {
    el.name.value = autoName({ vehicle, maxSpeed: +el.maxSpeed.value, blockMotorroads: { enabled: el.motorroads.checked } });
  }
}

function onTurnSlider() {
  const t = turnsFromSharp(+el.turns.value);
  el.slight.value = t.slight;
  el.round.value = t.roundabout;
  sync();
}

function applyStart() {
  el.maxSpeed.value = START.maxSpeed;
  el.defaultSpeed.value = START.defaultSpeed;
  el.turns.value = START.turns.sharp;
  el.slight.value = START.turns.slight;
  el.round.value = START.turns.roundabout;
  el.lights.value = START.trafficLightCost;
  el.motorroads.checked = START.blockMotorroads.enabled;
  sync();
}

el.maxSpeed.addEventListener("input", sync);
el.turns.addEventListener("input", onTurnSlider);
el.lights.addEventListener("input", sync);
el.slight.addEventListener("input", sync);
el.round.addEventListener("input", sync);
el.motorroads.addEventListener("change", sync);
el.name.addEventListener("input", () => { nameEdited = el.name.value.trim() !== ""; });

document.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.reset === "turns") {
    el.turns.value = OSMAND_DEFAULTS.turns.sharp;
    el.slight.value = OSMAND_DEFAULTS.turns.slight;
    el.round.value = OSMAND_DEFAULTS.turns.roundabout;
  } else if (b.dataset.reset === "lights") {
    el.lights.value = OSMAND_DEFAULTS.trafficLightCost;
  }
  sync();
}));

// ---------- platform & instructions ----------
function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const selectStep = (name) =>
  `<li>In OsmAnd open <b>Menu → Settings</b>, pick your profile (e.g. <b>Motorcycle</b>), then <b>Navigation settings → Navigation type</b> and choose <b>${esc(name)}</b>.</li>`;

const INSTRUCTIONS = {
  ios: (name, file) => `
    <p class="lead">Safari saved <b>${esc(file)}</b>. Now hand it to OsmAnd.</p>
    <ol class="steps">
      <li>Tap the <b>download arrow</b> in Safari's address bar, then tap <b>${esc(file)}</b>.</li>
      <li>Tap <b>Share</b> and choose <b>OsmAnd</b>.</li>
      ${selectStep(name)}
      <li>Your switches are under <b>Route parameters → Avoid roads…</b></li>
    </ol>
    <p class="note"><b>OsmAnd doesn't confirm the import.</b> No message is normal, the profile was still added.
    If it's not in the list, fully close OsmAnd (swipe it away) and open it again.</p>
    <p class="small">Can't find the download? Open the <b>Files</b> app → <b>Downloads</b>.</p>`,
  android: (name, file) => `
    <p class="lead"><b>${esc(file)}</b> is in your Downloads. Now hand it to OsmAnd.</p>
    <ol class="steps">
      <li>Tap the download notification, or open the file from <b>Downloads</b>, and choose <b>OsmAnd</b>.</li>
      ${selectStep(name)}
      <li>Your switches are under <b>Route parameters</b>.</li>
    </ol>`,
  desktop: (name, file) => `
    <p class="lead"><b>${esc(file)}</b> is in your downloads folder. OsmAnd needs it on your phone.</p>
    <ol class="steps">
      <li>Send the file to your phone, e.g. by AirDrop, LocalSend or email.</li>
      <li>On the phone, open the file, tap <b>Share</b> and choose <b>OsmAnd</b>.</li>
      ${selectStep(name)}
    </ol>`,
};

// ---------- sheet ----------
let lastFocus = null;
function openSheet(name, file) {
  el.sheetBody.innerHTML = INSTRUCTIONS[platform()](name, file);
  lastFocus = document.activeElement;
  el.scrim.hidden = false;
  el.sheet.hidden = false;
  el.sheetClose.focus();
}
function closeSheet() {
  el.sheet.hidden = true;
  el.scrim.hidden = true;
  if (lastFocus) lastFocus.focus();
}
el.sheetClose.addEventListener("click", closeSheet);
el.scrim.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.sheet.hidden) closeSheet(); });

// ---------- download ----------
function download() {
  if (!template) return;
  const s = readSettings();
  let xml;
  try {
    xml = buildOsmandXml(s, template);
  } catch (err) {
    el.status.textContent = "Couldn't create the file: " + err.message;
    return;
  }
  const fileName = fileNameFor(s.name);
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  openSheet(s.name, fileName);
}
el.download.addEventListener("click", download);

// ---------- start ----------
// Load the template up front so the download happens directly in the tap (iOS needs that).
el.download.disabled = true;
fetch(TEMPLATE_URL)
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
  .then((t) => { template = t; el.download.disabled = false; el.status.textContent = ""; })
  .catch(() => { el.status.textContent = "Couldn't load the base profile. Check your connection and reload the page."; });

applyStart();
