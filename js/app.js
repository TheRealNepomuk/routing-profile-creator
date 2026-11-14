// Routing Profile Creator — page logic
import { PRESETS, turnsFromSlider, turnHint, autoName, fileNameFor } from "./settings.js";
import { buildOsmandXml, TEMPLATE_URL } from "./exporters/osmand.js";

const $ = (id) => document.getElementById(id);

const el = {
  maxSpeed: $("maxSpeed"), speedValue: $("speedValue"), turns: $("turns"), turnsHint: $("turnsHint"),
  lights: $("optLights"), motorroads: $("optMotorroads"), name: $("profileName"),
  defaultSpeed: $("defaultSpeed"), lightPenalty: $("lightPenalty"),
  sharp: $("sharpTurn"), slight: $("slightTurn"), round: $("roundaboutTurn"),
  download: $("downloadBtn"), status: $("status"),
  sheet: $("sheet"), scrim: $("scrim"), sheetBody: $("sheetBody"), sheetClose: $("sheetClose"),
};

let template = null;
let nameEdited = false;
let vehicle = "motorcycle";

// ---------- settings from the form ----------
const num = (input, fallback, min = 0, max = 1000) => {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

function readSettings() {
  const s = {
    vehicle,
    maxSpeed: +el.maxSpeed.value,
    defaultSpeed: num(el.defaultSpeed, 50, 5, 200),
    turns: { sharp: num(el.sharp, 15, 0, 600), slight: num(el.slight, 8, 0, 600), roundabout: num(el.round, 5, 0, 600) },
    avoidTrafficLights: { enabled: el.lights.checked, penalty: num(el.lightPenalty, 60, 0, 600) },
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

function sync() {
  el.speedValue.textContent = el.maxSpeed.value;
  setFill(el.maxSpeed);
  setFill(el.turns);
  if (!nameEdited) el.name.value = autoName(readSettingsWithoutName());
}

function readSettingsWithoutName() {
  return { vehicle, maxSpeed: +el.maxSpeed.value, blockMotorroads: { enabled: el.motorroads.checked } };
}

function onTurns() {
  const t = +el.turns.value;
  const p = turnsFromSlider(t);
  el.sharp.value = p.sharp; el.slight.value = p.slight; el.round.value = p.roundabout;
  el.turnsHint.textContent = turnHint(t);
  sync();
}

function markCustom() {
  document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", "false"));
}

function applyPreset(key) {
  const p = PRESETS[key];
  document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.preset === key)));
  vehicle = p.vehicle;
  el.maxSpeed.value = p.maxSpeed;
  el.turns.value = p.turnSlider;
  el.lights.checked = p.avoidTrafficLights.enabled;
  el.lightPenalty.value = p.avoidTrafficLights.penalty;
  el.motorroads.checked = p.blockMotorroads.enabled;
  el.defaultSpeed.value = p.defaultSpeed;
  onTurns();
}

document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => applyPreset(c.dataset.preset)));
el.maxSpeed.addEventListener("input", () => { markCustom(); sync(); });
el.turns.addEventListener("input", () => { markCustom(); onTurns(); });
for (const input of [el.lights, el.motorroads]) input.addEventListener("change", () => { markCustom(); sync(); });
for (const input of [el.defaultSpeed, el.lightPenalty, el.sharp, el.slight, el.round]) input.addEventListener("input", markCustom);
el.name.addEventListener("input", () => { nameEdited = el.name.value.trim() !== ""; });

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

applyPreset("small");
