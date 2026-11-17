// Routing Profile Creator — page logic
import { SECTIONS, ALL_FIELDS, flatFields, autoName, fileNameFor } from "./settings.js";
import { applyLayout } from "./layout.js";
import { buildOsmandXml, readDefaults, TEMPLATE_URL } from "./exporters/osmand.js";

const $ = (id) => document.getElementById(id);
const el = {
  sections: $("sections"), name: $("profileName"),
  download: $("downloadBtn"), status: $("status"),
  sheet: $("sheet"), scrim: $("scrim"), sheetTitle: $("sheetTitle"), sheetBody: $("sheetBody"), sheetClose: $("sheetClose"),
  help: $("helpBtn"),
};

const VEHICLE = "motorcycle";
let template = null;
let defaults = {};
const values = {};
let nameEdited = false;
let sections = SECTIONS; // the layout editor (dev/editor.html) can replace this live
const shown = () => sections.flatMap((s) => s.groups.flatMap((g) => flatFields(g.fields)));
const cards = () => sections.flatMap((s) => s.groups.flatMap((g) => g.fields.filter((f) => f.card)));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtVal(f, v) {
  if (f.control === "toggle") return v ? "On" : "Off";
  if (f.offAtZero && Number(v) === 0) return f.offAtZero;
  const n = +Number(v).toFixed(2);
  return f.unit === "×" ? `${n}×` : `${n} ${f.unit}`;
}
const paras = (text) => text.split("\n\n").map((t) => `<p>${esc(t)}</p>`).join("");
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

// Short summary of a card's values, e.g. "80 km/h · 1.2× · not allowed".
function cardSummary(c) {
  const parts = [];
  for (const f of flatFields(c.fields)) {
    const v = values[f.id];
    if (v === undefined || /^Ramp /.test(f.label)) continue;
    if (f.target.kind === "override") { if (v) parts.push("no limits"); }
    else if (f.target.kind === "block") { if (v) parts.push("blocked"); }
    else if (f.control === "toggle") { if (!v) parts.push("not allowed"); }
    else if (!(f.offAtZero && Number(v) === 0) && f.unit !== "s") parts.push(fmtVal(f, v));
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
  el.sections.innerHTML = sections.map((s, i) => `
    <details class="panel glass sec" data-section="${s.id}"${i === 0 ? " open" : ""}>
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
    sum.textContent = s.id === "vehicle" ? `${values.maxSpeed} km/h` : (n ? `${n} changed` : "OsmAnd default");
    sum.classList.toggle("changed", n > 0);
  }
  for (const c of cards()) {
    const sum = $("cs-" + c.id);
    sum.textContent = cardSummary(c);
    sum.classList.toggle("changed", flatFields(c.fields).some(isChanged));
  }
  if (!nameEdited) el.name.value = autoName(values);
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
  el.name.addEventListener("input", () => { nameEdited = el.name.value.trim() !== ""; });
}

// ---------- platform & instructions ----------
function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
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
function openSheet(title, html) {
  el.sheetTitle.textContent = title;
  el.sheetBody.innerHTML = html;
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
  const name = el.name.value.trim() || autoName(values);
  let xml;
  try {
    xml = buildOsmandXml({ name, vehicle: VEHICLE, values }, template);
  } catch (err) {
    el.status.textContent = "Couldn't create the file: " + err.message;
    return;
  }
  const fileName = fileNameFor(name);
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  openSheet("Finish in OsmAnd", INSTRUCTIONS[platform()](name, fileName));
}
el.download.addEventListener("click", download);

// ---------- help ----------
const HELP = `
  <p class="lead">A detailed explanation and guide is coming here soon.</p>`;
el.help.addEventListener("click", () => openSheet("How does this work?", HELP));

// ---------- layout preview (only inside dev/editor.html) ----------
if (new URLSearchParams(location.search).has("preview")) {
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.type !== "layout") return;
    const open = new Set([...el.sections.querySelectorAll("details.sec[open]")].map((d) => d.dataset.section));
    sections = applyLayout(e.data.layout, SECTIONS, ALL_FIELDS);
    render();
    bindInputs();
    el.sections.querySelectorAll("details.sec").forEach((d) => { d.open = open.has(d.dataset.section); });
    if (template) refreshAll();
  });
  window.parent.postMessage({ type: "preview-ready" }, location.origin);
}

// ---------- start ----------
// The template is loaded up front: it provides the OsmAnd defaults, and the download
// must happen directly inside the tap (iOS needs that).
render();
bind();
el.download.disabled = true;
fetch(TEMPLATE_URL)
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
  .then((t) => {
    template = t;
    defaults = readDefaults(t);
    for (const f of ALL_FIELDS) values[f.id] = f.start !== undefined ? f.start : defaults[f.id];
    refreshAll();
    el.download.disabled = false;
    el.status.textContent = "";
  })
  .catch((err) => { el.status.textContent = "Couldn't load OsmAnd's base profile (" + err.message + "). Check your connection and reload the page."; });
