// Layout editor: rearrange and rename sections, groups and options, with the real page as live preview.
// The DOM is the source of truth; collect() reads the layout back from it after every change.
import { SECTIONS } from "../js/settings.js";
import { layoutFrom } from "../js/layout.js";

const API = "api/layout";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FIELDS = {};
for (const s of SECTIONS) for (const g of s.groups) for (const f of g.fields) FIELDS[f.id] = f;
const kindOf = (f) => f.card ? `road card · ${f.fields.length} settings`
  : (f.control === "toggle" ? "switch" : `slider · ${f.unit}`) + (f.box ? " + box" : "");

// ---------- rendering ----------
const fieldHtml = (fl) => {
  const f = FIELDS[fl.id];
  return `<div class="fld" data-id="${esc(fl.id)}">
    <span class="handle h-fields" title="Drag">⠿</span>
    <input class="t" data-k="label" value="${esc(fl.label || f.label)}" placeholder="${esc(f.label)}">
    <span class="fid">${esc(kindOf(f))}</span>
  </div>`;
};

const groupHtml = (g) => `<div class="grp">
  <div class="head">
    <span class="handle h-groups" title="Drag">⠿</span><span class="kind">Group</span>
    <input class="t" data-k="title" value="${esc(g.title)}" placeholder="(no heading)">
    <label><input type="checkbox" data-k="collapsed"${g.collapsed ? " checked" : ""}> collapsed</label>
    <button type="button" class="del" data-del="grp" title="Delete group (only when empty)">✕</button>
  </div>
  <details class="txt"><summary>ⓘ text${g.info ? "" : " (none)"}</summary><textarea data-k="info">${esc(g.info)}</textarea></details>
  <div class="list fields">${g.fields.map(fieldHtml).join("")}</div>
</div>`;

const sectionHtml = (s) => `<div class="sec" data-id="${esc(s.id)}">
  <div class="head">
    <span class="handle h-sections" title="Drag">⠿</span><span class="kind">Section</span>
    <input class="t" data-k="title" value="${esc(s.title)}" placeholder="Section title">
    <button type="button" data-add="grp">+ Group</button>
    <button type="button" class="del" data-del="sec" title="Delete section (only when empty)">✕</button>
  </div>
  <details class="txt"><summary>Intro text${s.intro ? "" : " (none)"}</summary><textarea data-k="intro">${esc(s.intro)}</textarea></details>
  <div class="list groups">${s.groups.map(groupHtml).join("")}</div>
</div>`;

function render(layout) {
  $("sections").innerHTML = layout.sections.map(sectionHtml).join("");
  $("hidden").innerHTML = layout.hidden.map((id) => fieldHtml({ id })).join("");
  makeSortable(document);
}

const sortOpts = (group) => ({ group, handle: ".h-" + group, animation: 150, fallbackOnBody: true, swapThreshold: 0.6, onEnd: changed });
function makeSortable(root) {
  if (root === document) new Sortable($("sections"), sortOpts("sections"));
  root.querySelectorAll(".list.groups").forEach((l) => new Sortable(l, sortOpts("groups")));
  root.querySelectorAll(".list.fields").forEach((l) => new Sortable(l, sortOpts("fields")));
}

// ---------- DOM → layout ----------
const val = (root, k) => root.querySelector(`:scope > .head [data-k="${k}"], :scope > details > [data-k="${k}"]`);
function collect() {
  const fields = (list) => [...list.children].map((el) => {
    const label = el.querySelector('[data-k="label"]').value.trim();
    return { id: el.dataset.id, label: label || FIELDS[el.dataset.id].label };
  });
  return {
    sections: [...$("sections").children].map((s) => ({
      id: s.dataset.id,
      title: val(s, "title").value.trim(),
      intro: val(s, "intro").value.trim(),
      groups: [...s.querySelector(".list.groups").children].map((g) => ({
        title: val(g, "title").value.trim(),
        info: val(g, "info").value.trim(),
        collapsed: val(g, "collapsed").checked,
        fields: fields(g.querySelector(".list.fields")),
      })),
    })),
    hidden: [...$("hidden").children].map((el) => el.dataset.id),
  };
}

// ---------- preview + saving ----------
const frame = $("frame");
const push = (layout) => frame.contentWindow?.postMessage({ type: "layout", layout }, location.origin);
window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.type === "preview-ready") push(collect()); });

let saveTimer = null;
function status(text, err = false) { $("status").textContent = text; $("status").classList.toggle("err", err); }
function changed() {
  const layout = collect();
  push(layout);
  status("Unsaved…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      status("Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }));
    } catch (err) { status("Not saved: " + err.message, true); }
  }, 400);
}

// ---------- editing ----------
const tree = document.querySelector(".tree");
tree.addEventListener("input", changed);
tree.addEventListener("change", (e) => { if (e.target.type === "checkbox") changed(); });
tree.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const list = add.closest(".sec").querySelector(".list.groups");
    list.insertAdjacentHTML("beforeend", groupHtml({ title: "New group", info: "", collapsed: false, fields: [] }));
    makeSortable(list.lastElementChild);
    list.lastElementChild.querySelector("input.t").select();
    return changed();
  }
  const del = e.target.closest("[data-del]");
  if (del) {
    const box = del.closest(del.dataset.del === "sec" ? ".sec" : ".grp");
    if (box.querySelector(".fld")) return status("Move its options out first, then delete it.", true);
    box.remove();
    changed();
  }
});
$("addSection").addEventListener("click", () => {
  $("sections").insertAdjacentHTML("beforeend", sectionHtml({ id: "sec_" + Date.now().toString(36), title: "New section", intro: "", groups: [] }));
  const s = $("sections").lastElementChild;
  makeSortable(s);
  s.scrollIntoView({ behavior: "smooth", block: "center" });
  s.querySelector("input.t").select();
  changed();
});

// "Reset to code": click twice to confirm.
let armed = null;
$("reset").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (!armed) {
    b.classList.add("armed"); b.textContent = "Click again to reset";
    armed = setTimeout(() => { armed = null; b.classList.remove("armed"); b.textContent = "Reset to code"; }, 3000);
    return;
  }
  clearTimeout(armed); armed = null; b.classList.remove("armed"); b.textContent = "Reset to code";
  await fetch(API, { method: "DELETE" });
  render(layoutFrom(SECTIONS));
  push(collect());
  status("Reset to the layout in the code");
});

document.querySelectorAll('input[name="w"]').forEach((r) =>
  r.addEventListener("change", () => document.querySelector(".preview").classList.toggle("wide", r.value === "560" && r.checked)));

// ---------- start: saved layout, or the one in the code ----------
let layout = layoutFrom(SECTIONS);
let note = "Layout from the code";
try {
  const r = await fetch(API);
  if (r.ok) {
    const saved = await r.json();
    const placed = new Set([...saved.hidden, ...saved.sections.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => f.id)))]);
    for (const s of saved.sections) for (const g of s.groups) g.fields = g.fields.filter((f) => FIELDS[f.id]);
    saved.hidden = saved.hidden.filter((id) => FIELDS[id]);
    const fresh = Object.keys(FIELDS).filter((id) => !placed.has(id));
    saved.hidden.push(...fresh);
    layout = saved;
    note = "Loaded saved layout" + (fresh.length ? ` (${fresh.length} new options put in Hidden)` : "");
  }
} catch { /* no server API: start from code */ }
render(layout);
status(note);
push(collect());
