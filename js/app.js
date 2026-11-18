// Routing Profile Creator — page logic
import { SECTIONS, ALL_FIELDS, flatFields, autoName, fileNameFor } from "./settings.js";
import { buildOsmandXml, readDefaults, TEMPLATE_URL } from "./exporters/osmand.js";
import { encodeSettings, decodeSettings, findCode } from "./code.js";

const $ = (id) => document.getElementById(id);

// Anonymous usage counts (GoatCounter, script in index.html). Only the event name is sent, never
// settings or names. Silently does nothing if the script is blocked or not loaded yet.
function track(event) {
  try { window.goatcounter?.count?.({ path: event, title: event, event: true }); } catch { /* ignore */ }
}
const el = {
  sections: $("sections"), name: $("profileName"),
  download: $("downloadBtn"), status: $("status"),
  sheet: $("sheet"), scrim: $("scrim"), sheetTitle: $("sheetTitle"), sheetBody: $("sheetBody"), sheetClose: $("sheetClose"),
  help: $("helpBtn"), open: $("openBtn"), openFile: $("openFile"), link: $("linkBtn"),
  save: $("saveBtn"), saveView: $("saveView"), saveStatus: $("saveStatus"),
  reset: $("resetBtn"), sheetHead: $("sheetHead"), sheetScroll: $("sheetScroll"),
};

let template = null;
let defaults = {};
const values = {};
let nameEdited = false;
const sections = SECTIONS;
const shown = () => sections.flatMap((s) => s.groups.flatMap((g) => flatFields(g.fields)));
const cards = () => sections.flatMap((s) => s.groups.flatMap((g) => g.fields.filter((f) => f.card)));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtVal(f, v) {
  if (f.control === "toggle") return v ? "On" : "Off";
  if (f.offAtZero && Number(v) === 0) return f.offAtZero;
  const n = +Number(v).toFixed(2);
  return f.unit === "×" ? `${n}×` : `${n} ${f.unit}`;
}
// Info texts: a blank line starts a new paragraph; a paragraph of "- " lines becomes a bullet list.
const paras = (text) => text.split("\n\n").map((t) => {
  const lines = t.split("\n");
  return lines.every((l) => l.startsWith("- "))
    ? `<ul>${lines.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>`
    : `<p>${esc(t)}</p>`;
}).join("");
const isChanged = (f) => defaults[f.id] !== undefined && values[f.id] !== defaults[f.id];

// ---------- rendering ----------
let uid = 0;
function infoBlock(id, html, cls) {
  return `<div class="${cls}" id="${id}" hidden>${html}</div>`;
}
function infoButton(target, label) {
  return `<button type="button" class="info-btn" aria-expanded="false" aria-controls="${target}" aria-label="About ${esc(label)}">i</button>`;
}

function renderField(f) {
  const fid = "f-" + f.id, iid = "i-" + f.id;
  let end = "", below = "";
  if (f.control === "slider") {
    end = `<output class="f-val" for="${fid}" id="v-${f.id}"></output>`;
    below = `<input class="range" id="${fid}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${esc(f.label)}">`;
    if (f.box) {
      const bid = "i-" + f.box.id;
      below += `<div class="f-box"><label class="f-limit"><input class="check" id="f-${f.box.id}" type="checkbox"> ${esc(f.box.label)}</label>`
        + (f.box.info ? infoButton(bid, f.box.label) : "") + `</div>`
        + (f.box.info ? infoBlock(bid, paras(f.box.info), "f-info") : "");
    }
  } else if (f.control === "toggle") {
    end = `<input class="switch" id="${fid}" type="checkbox">`;
  }
  const info = (f.info ? paras(f.info) : "") +
    `<p class="f-default"><span id="d-${f.id}"></span><button type="button" class="link-btn" data-reset="${f.id}">Use default</button></p>`;
  return `<div class="f" data-field="${f.id}">
    <div class="f-row"><label class="f-label" for="${fid}">${esc(f.label)}</label>${infoButton(iid, f.label)}<span class="f-end">${end}</span></div>
    ${below}${infoBlock(iid, info, "f-info")}
  </div>`;
}

// A card bundles every setting for one road type or surface, folded, with a summary of its values.
function renderCard(c) {
  return `<details class="card" data-card="${c.id}">
    <summary><span class="card-title">${esc(c.label)}</span><span class="card-sum" id="cs-${c.id}"></span><span class="chev"></span></summary>
    <div class="card-body">${c.info ? `<p class="card-desc">${esc(c.info)}</p>` : ""}${c.fields.map(renderField).join("")}</div>
  </details>`;
}

// ---------- relations between settings ----------
// Nothing moves by itself: the page only shows what OsmAnd will make of the values.
// - Road speeds outside [minimum speed, max cruising speed] are clamped by OsmAnd: grey zones on
//   the track, value greyed out.
// - Settings that have no effect are dimmed: a blocked obstacle's seconds, a not-allowed road's
//   speed and preference, the "Ignore speed limits" box of a surface speed that is Off.
const isRoadSpeed = (f) => f.control === "slider" && f.unit === "km/h" && f.id !== "maxSpeed" && f.id !== "minSpeed";
const isClamped = (f) => {
  const v = Number(values[f.id]);
  return !(f.offAtZero && v === 0) && (v > values.maxSpeed || v < values.minSpeed);
};
const pct = (f, v) => Math.min(100, Math.max(0, ((v - f.min) / (f.max - f.min)) * 100));
const fieldEl = (id) => $("f-" + id).closest(".f");

function updateRelations() {
  for (const f of shown()) {
    if (isRoadSpeed(f)) {
      const input = $("f-" + f.id);
      input.style.setProperty("--lo", pct(f, values.minSpeed) + "%");
      input.style.setProperty("--hi", pct(f, values.maxSpeed) + "%");
      fieldEl(f.id).classList.toggle("clamped", isClamped(f));
    }
    if (f.target.kind === "block") fieldEl(f.of).classList.toggle("inactive", !!values[f.id]);
    if (f.offAtZero && f.box) fieldEl(f.id).classList.toggle("box-off", Number(values[f.id]) === 0);
  }
  for (const c of cards()) {
    const allow = c.fields.find((f) => f.id.startsWith("allow_"));
    if (allow) for (const f of c.fields) if (f !== allow) fieldEl(f.id).classList.toggle("off", !values[allow.id]);
  }
}

// Short summary of a card's values, e.g. "80 km/h · 1.2× · not allowed" (HTML: clamped speeds greyed).
function cardSummary(c) {
  const parts = [];
  for (const f of flatFields(c.fields)) {
    const v = values[f.id];
    if (v === undefined || /^Ramp /.test(f.label)) continue;
    if (f.target.kind === "override") { if (v) parts.push("no limits"); }
    else if (f.target.kind === "block") { if (v) parts.push("blocked"); }
    else if (f.control === "toggle") { if (!v) parts.push("not allowed"); }
    else if (!(f.offAtZero && Number(v) === 0) && f.unit !== "s") {
      const t = esc((f.sumPrefix || "") + fmtVal(f, v));
      parts.push(isRoadSpeed(f) && isClamped(f) ? `<span class="dim">${t}</span>` : t);
    }
  }
  return parts.join(" · ") || "Off";
}

function renderGroup(g) {
  const gid = "g-" + (++uid);
  const head = g.title || g.info
    ? `<div class="group-head">${g.title ? `<h3>${esc(g.title)}</h3>` : ""}${g.info ? infoButton(gid, g.title || "this section") : ""}${g.collapsed ? '<span class="chev"></span>' : ""}</div>`
    : "";
  const info = g.info ? infoBlock(gid, paras(g.info), "group-info") : "";
  const fields = g.fields.map((f) => (f.card ? renderCard(f) : renderField(f))).join("");
  if (g.collapsed) return `<details class="group"><summary>${head}</summary>${info}${fields}</details>`;
  return `<div class="group">${head}${info}${fields}</div>`;
}

function render() {
  el.sections.innerHTML = sections.map((s) => `
    <details class="panel glass sec" data-section="${s.id}">
      <summary><span class="sec-title">${esc(s.title)}</span><span class="sec-sum" id="sum-${s.id}"></span><span class="chev"></span></summary>
      <div class="sec-body">${s.intro ? `<p class="sec-intro">${esc(s.intro)}</p>` : ""}${s.groups.map(renderGroup).join("")}</div>
    </details>`).join("");
}

// ---------- state ↔ UI ----------
function setFill(range) {
  const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty("--fill", pct + "%");
}

function showField(f) {
  const input = $("f-" + f.id);
  if (f.control === "toggle") input.checked = !!values[f.id];
  else input.value = values[f.id];
  if (f.control === "slider") { $("v-" + f.id).textContent = fmtVal(f, values[f.id]); setFill(input); }
  (f.of ? input.closest(".f-limit") : input.closest(".f")).classList.toggle("changed", isChanged(f));
  const d = $("d-" + f.id);
  if (d) d.textContent = defaults[f.id] === undefined ? "" : `OsmAnd default: ${fmtVal(f, defaults[f.id])}`;
}

function updateSummaries() {
  for (const s of sections) {
    const fields = s.groups.flatMap((g) => flatFields(g.fields));
    const n = fields.filter(isChanged).length;
    const sum = $("sum-" + s.id);
    sum.textContent = n ? `${n} changed` : "OsmAnd default";
    sum.classList.toggle("changed", n > 0);
  }
  for (const c of cards()) {
    const sum = $("cs-" + c.id);
    sum.innerHTML = cardSummary(c);
    sum.classList.toggle("changed", flatFields(c.fields).some(isChanged));
  }
  updateRelations();
  if (!nameEdited) el.name.value = autoName(values, defaults);
  syncUrl();
}

function refreshAll() {
  shown().forEach(showField);
  updateSummaries();
}

function bindInputs() {
  for (const f of shown()) {
    const input = $("f-" + f.id);
    const onChange = () => {
      if (f.control === "toggle") values[f.id] = input.checked;
      else {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        values[f.id] = Math.min(f.max, Math.max(f.min, v));
      }
      showField(f);
      updateSummaries();
    };
    input.addEventListener(f.control === "toggle" ? "change" : "input", onChange);
  }
}

function bind() {
  bindInputs();
  el.sections.addEventListener("click", (e) => {
    const info = e.target.closest(".info-btn");
    if (info) {
      e.preventDefault(); // inside <summary> it would toggle the group
      const box = $(info.getAttribute("aria-controls"));
      const open = info.getAttribute("aria-expanded") !== "true";
      info.setAttribute("aria-expanded", String(open));
      box.hidden = !open;
      if (open && box.closest("details.group:not([open])")) box.closest("details.group").open = true;
      return;
    }
    const reset = e.target.closest("[data-reset]");
    if (reset) {
      const f = ALL_FIELDS.find((x) => x.id === reset.dataset.reset);
      values[f.id] = defaults[f.id];
      showField(f);
      updateSummaries();
    }
  });
  el.name.addEventListener("input", () => { nameEdited = el.name.value.trim() !== ""; syncUrl(); });
}

// ---------- platform & instructions ----------
// Opened from the home-screen icon (web app) instead of the browser.
const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return standalone() ? "iosApp" : "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

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
  // Home-screen version: iOS opens the downloaded file right away, with a share button.
  iosApp: (name, file) => `
    <p class="lead"><b>${esc(file)}</b> opens right away. Now hand it to OsmAnd.</p>
    <ol class="steps">
      <li>In the file preview, tap <b>Share</b> and choose <b>OsmAnd</b>.</li>
      ${selectStep(name)}
      <li>Your switches are under <b>Route parameters → Avoid roads…</b></li>
    </ol>
    <p class="note"><b>OsmAnd doesn't confirm the import.</b> No message is normal, the profile was still added.
    If it's not in the list, fully close OsmAnd (swipe it away) and open it again.</p>`,
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
// One sheet, two uses: "Save & share" (name, download, link) and text pages (instructions, help).
let lastFocus = null;
// closeLabel: when the sheet has its own orange button, closing becomes the quiet grey action.
function showSheet(title, saveMode, closeLabel = saveMode ? "Close" : null) {
  el.sheetTitle.textContent = title;
  el.saveView.hidden = !saveMode;
  el.sheetBody.hidden = saveMode;
  el.sheetClose.textContent = closeLabel || "Done";
  el.sheetClose.className = closeLabel ? "btn-secondary sheet-close" : "btn-primary";
  if (el.sheet.hidden) { lastFocus = document.activeElement; lockPage(); }
  el.sheetScroll.scrollTop = 0;
  el.scrim.hidden = false;
  el.sheet.hidden = false;
  el.sheetClose.focus({ preventScroll: true });
}
function openSheet(title, html, closeLabel = null) {
  el.sheetBody.innerHTML = html;
  showSheet(title, false, closeLabel);
}
function openSave() {
  if (!template) return;
  el.saveStatus.textContent = "";
  showSheet("Save & share", true);
}
el.save.addEventListener("click", openSave);
function closeSheet() {
  if (el.sheet.hidden) return;
  el.sheet.hidden = true;
  el.scrim.hidden = true;
  el.sheet.classList.remove("settling");
  el.sheet.style.removeProperty("--drag");
  unlockPage();
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
el.sheetClose.addEventListener("click", closeSheet);

// While a sheet is open the page behind must not move: on iPhone a swipe on the dark area would
// otherwise scroll the page and keep the sheet from getting swipes. Pinning the body is the
// reliable way on iOS (overflow: hidden alone isn't).
let lockedY = 0;
function lockPage() {
  lockedY = window.scrollY;
  Object.assign(document.body.style, { position: "fixed", top: `-${lockedY}px`, left: "0", right: "0" });
}
function unlockPage() {
  for (const k of ["position", "top", "left", "right"]) document.body.style.removeProperty(k);
  window.scrollTo(0, lockedY);
}

// Swipe down to close: from the handle/title anywhere, from the content once it's scrolled to the
// top. Far enough down or a quick flick closes, otherwise the sheet springs back.
let drag = null;
el.sheet.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) { drag = null; return; }
  const y = e.touches[0].clientY;
  drag = { startY: y, lastY: y, lastT: e.timeStamp, v: 0, active: false, head: el.sheetHead.contains(e.target) };
}, { passive: true });
el.sheet.addEventListener("touchmove", (e) => {
  if (!drag) return;
  const y = e.touches[0].clientY, dy = y - drag.startY;
  if (!drag.active) {
    if (dy > 6 && (drag.head || el.sheetScroll.scrollTop <= 0)) {
      drag.active = true;
      drag.startY = y - 1; // start following from here, no jump
      el.sheet.classList.remove("settling");
    } else return; // normal scrolling of the content
  }
  e.preventDefault();
  const dt = Math.max(1, e.timeStamp - drag.lastT);
  drag.v = (y - drag.lastY) / dt; // px per ms, positive = downwards
  drag.lastY = y; drag.lastT = e.timeStamp;
  el.sheet.style.setProperty("--drag", Math.max(0, y - drag.startY) + "px");
}, { passive: false });
const endDrag = () => {
  if (!drag || !drag.active) { drag = null; return; }
  const pulled = Math.max(0, drag.lastY - drag.startY), flick = drag.v > 0.5 && pulled > 30;
  drag = null;
  el.sheet.classList.add("settling");
  if (pulled > Math.min(140, el.sheet.offsetHeight * 0.3) || flick) {
    el.sheet.style.setProperty("--drag", el.sheet.offsetHeight + "px");
    setTimeout(closeSheet, 200);
  } else {
    el.sheet.style.setProperty("--drag", "0px");
  }
};
el.sheet.addEventListener("touchend", endDrag);
el.sheet.addEventListener("touchcancel", endDrag);
el.scrim.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.sheet.hidden) closeSheet(); });

// ---------- download ----------
function download() {
  if (!template) return;
  const name = el.name.value.trim() || autoName(values, defaults);
  let xml;
  try {
    // Always write a code, even an empty one, so the file can be opened here again.
    xml = buildOsmandXml({ name, values, code: currentCode() || "rpc1:" }, template);
  } catch (err) {
    el.saveStatus.textContent = "Couldn't create the file: " + err.message;
    return;
  }
  const fileName = fileNameFor(name);
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  track("download");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  openSheet("Finish in OsmAnd", INSTRUCTIONS[platform()](name, fileName) + COFFEE);
}

const COFFEE = `
  <div class="coffee">
    <span>Useful? Support the project:</span>
    <a class="coffee-btn" href="https://buymeacoffee.com/therealnepomuk" target="_blank" rel="noopener" data-track="coffee">
      <img src="assets/bmc-cup.svg" alt="" width="15" height="22"> Buy me a coffee
    </a>
  </div>`;
el.download.addEventListener("click", download);

// ---------- settings code: URL, open a file, share link ----------
// The current settings live in the URL (#rpc1:…), so a reload keeps them and the address is
// the share link. Downloaded files carry the same code in their header comment.
const currentCode = () => encodeSettings(values, defaults, nameEdited ? el.name.value.trim() : null);

// Some apps encode the ":" when passing a link on.
const hashCode = () => findCode(location.hash.replace(/^#rpc1%3A/i, "#rpc1:"));

function syncUrl() {
  if (!template) return;
  const code = currentCode();
  history.replaceState(null, "", code ? "#" + code : location.pathname + location.search);
}

let statusTimer = 0;
function say(msg, stay = false) {
  clearTimeout(statusTimer);
  el.status.textContent = msg;
  if (!stay) statusTimer = setTimeout(() => { el.status.textContent = ""; }, 8000);
}

/** Replaces all settings with the ones in the code. Returns false if it can't be read. */
function applyCode(code, from) {
  let s;
  try { s = decodeSettings(code); } catch { return false; }
  for (const f of ALL_FIELDS) values[f.id] = f.id in s.values ? s.values[f.id] : defaults[f.id];
  nameEdited = !!s.name;
  if (s.name) el.name.value = s.name;
  refreshAll();
  const n = Object.keys(s.values).length;
  say((n ? `Loaded ${n} changed setting${n === 1 ? "" : "s"} from ${from}.` : `Loaded ${from}: all OsmAnd defaults.`)
    + (s.skipped.length ? ` ${s.skipped.length} unknown entr${s.skipped.length === 1 ? "y was" : "ies were"} skipped.` : ""));
  return true;
}

// Explain first what can be opened, then pick the file (the picker opens inside this tap).
const OPEN_INFO = `
  <p class="lead">Pick a routing file you downloaded from this page. All its settings come back, ready to change.</p>
  <p class="note">For now this only works with files made with Routing Profile Creator, because they carry your settings inside. OsmAnd's own routing files and other custom profiles can't be opened yet.</p>
  <button class="btn-primary sheet-action" id="pickFile" type="button">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3.5 7.5v10a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7v.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    Choose a file
  </button>`;
el.open.addEventListener("click", () => openSheet("Open a profile file", OPEN_INFO, "Cancel"));
el.sheetBody.addEventListener("click", (e) => {
  if (!e.target.closest("#pickFile")) return;
  closeSheet();
  el.openFile.click();
});
el.openFile.addEventListener("change", async () => {
  const file = el.openFile.files[0];
  el.openFile.value = ""; // so the same file can be picked again
  if (!file || !template) return;
  let text;
  try { text = await file.text(); } catch { say("Couldn't read that file."); return; }
  const code = findCode(text);
  if (!code || !applyCode(code, file.name)) {
    say(`${file.name} has no settings code. Only files made with this page since November 2026 can be opened again.`);
    return;
  }
  track("open-file");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

el.link.addEventListener("click", async () => {
  track("share-link");
  syncUrl();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    el.saveStatus.textContent = currentCode() ? "Link copied. Whoever opens it gets your settings." : "Link copied. You haven't changed anything yet, so it opens the OsmAnd defaults.";
  } catch {
    el.saveStatus.innerHTML = `Copy this link to share your settings:
      <input class="text" type="text" readonly value="${esc(url)}" onfocus="this.select()">`;
  }
});

window.addEventListener("hashchange", () => {
  const code = hashCode();
  if (code && template && code !== currentCode()) applyCode(code, "the link");
});

// ---------- home screen tip ----------
// iPhone in the browser only: the home-screen version is the better way to use the page (the file
// opens straight in the share menu instead of going to Downloads). Hidden for good once dismissed.
const TIP_KEY = "rpc.a2hsHidden";
(() => {
  let hidden = false;
  try { hidden = localStorage.getItem(TIP_KEY) === "1"; } catch { /* storage blocked: show it */ }
  if (platform() !== "ios" || hidden) return;
  const tip = $("a2hs");
  tip.hidden = false;
  $("a2hsClose").addEventListener("click", () => {
    tip.hidden = true;
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* not remembered, fine */ }
  });
})();

// ---------- reset ----------
const RESET_INFO = `
  <p class="lead">Every value goes back to OsmAnd's car profile, and the profile name is built again. This can't be undone.</p>
  <button class="btn-primary sheet-action" id="resetConfirm" type="button">Reset all settings</button>`;
el.reset.addEventListener("click", () => {
  if (!template) return;
  if (!currentCode()) { say("Nothing to reset: everything is at OsmAnd's defaults."); return; }
  openSheet("Reset all settings?", RESET_INFO, "Cancel");
});
el.sheetBody.addEventListener("click", (e) => {
  if (!e.target.closest("#resetConfirm")) return;
  for (const f of ALL_FIELDS) values[f.id] = defaults[f.id];
  nameEdited = false;
  refreshAll();
  closeSheet();
  say("All settings are back to OsmAnd's defaults.");
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-track]");
  if (t) track(t.dataset.track);
});

// ---------- contact ----------
// "Contact" links open a small sheet: write an email, or copy the address (for people without a
// mail app). The address is only put together on click, so it never sits in the page source.
const MAIL = ["oat-upon-dagger", "duck.com"];
const mailAddress = () => MAIL.join("@");
const CONTACT = `
  <p class="lead">Missing an option, found a bug, or want trucks or another vehicle? I'm happy to hear from you.</p>
  <button class="btn-primary sheet-action" id="mailWrite" type="button">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    Write an email
  </button>
  <button class="btn-secondary sheet-action" id="mailCopy" type="button">Copy email address</button>
  <div class="save-status" id="mailStatus" role="status"></div>`;

document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-mail]")) return;
  e.preventDefault();
  openSheet("Contact", CONTACT, "Close");
});
el.sheetBody.addEventListener("click", async (e) => {
  if (e.target.closest("#mailWrite")) {
    location.href = `mailto:${mailAddress()}?subject=${encodeURIComponent("Routing Profile Creator")}`;
  } else if (e.target.closest("#mailCopy")) {
    const status = $("mailStatus");
    try {
      await navigator.clipboard.writeText(mailAddress());
      status.textContent = "Copied to clipboard.";
    } catch {
      status.textContent = `Copy this address: ${mailAddress()}`;
    }
  }
});

// ---------- help ----------
const HELP = `
  <div class="help">
    <section class="help-card">
      <h3>What's a routing file?</h3>
      <p>The rules OsmAnd uses to calculate a route: how fast each road is, which roads to prefer or avoid, and how much a turn or a traffic light costs.</p>
    </section>

    <section class="help-card">
      <h3>Why change it?</h3>
      <p>OsmAnd's built-in profiles are made for everyone. Here you can tune single values to your liking, e.g. prefer secondary roads, avoid gravel or skip motorways.</p>
    </section>

    <section class="help-card">
      <h3>Getting it into OsmAnd</h3>
      <ol class="steps">
        <li>Tap <b>Save &amp; share</b>, then <b>Download XML file</b>.</li>
        <li>Open the file with OsmAnd (on iPhone: <b>Share → OsmAnd</b>).</li>
        <li>Pick it as <b>Navigation type</b> in your profile's <a href="https://osmand.net/docs/user/navigation/guidance/navigation-settings/#navigation-type" target="_blank" rel="noopener">navigation settings</a>.</li>
      </ol>
    </section>

    <section class="help-card help-warn">
      <h3>It's only as good as the map</h3>
      <p>Everything here relies on OpenStreetMap data, and that varies a lot between regions. Speed limits are often missing, and details like road surface or smoothness are spotty. Check the route before you rely on it.</p>
    </section>

    <section class="help-card">
      <h3>Examples</h3>
      <dl class="recipes">
        <dt>More country roads</dt><dd>Road types → Secondary and Tertiary: preference 1.2. Motorway: 0.5.</dd>
        <dt>Stay off motorways</dt><dd>Road types → Motorway: preference and ramp preference 0.1. To skip them only on some trips, use OsmAnd's own "Avoid motorways" switch instead.</dd>
        <dt>Stay off gravel</dt><dd>Surfaces → Gravel and Unpaved: preference 0.2. Track: turn off Allowed.</dd>
        <dt>Fewer traffic lights</dt><dd>Turns, stops and obstacles → Traffic light: 40 s.</dd>
        <dt>Never through a ford</dt><dd>Ford: tick Block completely.</dd>
      </dl>
    </section>

    <section class="help-card">
      <h3>Questions or ideas?</h3>
      <p>Missing an option, found a bug, or want trucks or another vehicle? <a href="#" data-mail>Contact me</a>.</p>
    </section>
  </div>`;
el.help.addEventListener("click", () => openSheet("How does this work?", HELP));

// ---------- start ----------
// The template is loaded up front: it provides the OsmAnd defaults, and the download
// must happen directly inside the tap (iOS needs that).
render();
bind();
el.save.disabled = true;
fetch(TEMPLATE_URL)
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
  .then((t) => {
    template = t;
    defaults = readDefaults(t);
    for (const f of ALL_FIELDS) values[f.id] = f.start !== undefined ? f.start : defaults[f.id];
    el.status.textContent = "";
    const code = hashCode();
    if (!(code && applyCode(code, "the link"))) refreshAll();
    el.save.disabled = false;
  })
  .catch((err) => { el.status.textContent = "Couldn't load OsmAnd's base profile (" + err.message + "). Check your connection and reload the page."; });
