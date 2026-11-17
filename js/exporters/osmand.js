// OsmAnd exporter: values → complete OsmAnd routing profile (.xml).
//
// Starts from the unmodified upstream car profile (templates/osmand-car.xml) and changes only
// values that differ from it. A custom profile does NOT inherit rules from baseProfile="car",
// so the output must always contain the full rule set.

import { ALL_FIELDS } from "../settings.js";

export const TEMPLATE_URL = new URL("../../templates/osmand-car.xml", import.meta.url).href;

const ELEMENT = 1;

function parse(templateText, dom) {
  const doc = new dom.DOMParser().parseFromString(templateText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Template is not valid XML");
  const profile = doc.getElementsByTagName("routingProfile")[0];
  if (!profile) throw new Error("Template has no routingProfile");
  return { doc, profile };
}

// ---------- locating values in the template ----------
const children = (parent) => Array.from(parent.childNodes).filter((n) => n.nodeType === ELEMENT);

function section(profile, [tag, attribute]) {
  const s = children(profile).find((e) => e.nodeName === tag && e.getAttribute("attribute") === attribute);
  if (!s) throw new Error(`Template has no <${tag} attribute="${attribute}">`);
  return s;
}

// Direct-child selects only: rules nested in <if>/<ge> blocks belong to switches and conditions.
// A null t or v means the attribute is absent (e.g. the catch-all <select value="0.7"/>).
const matches = (e, attr, want) => (want === null ? !e.hasAttribute(attr) : e.getAttribute(attr) === want);

function selectsFor(profile, target) {
  return target.pairs.map(([t, v]) => {
    const sel = children(section(profile, target.parent)).find((e) => e.nodeName === "select"
      && matches(e, "t", t) && matches(e, "v", v));
    if (!sel) throw new Error(`Template has no ${target.parent[1]} rule for ${t ?? "*"}=${v ?? "*"}`);
    return sel;
  });
}

function attrChild(profile, name) {
  const a = children(profile).find((e) => e.nodeName === "attribute" && e.getAttribute("name") === name);
  if (!a) throw new Error(`Template has no attribute ${name}`);
  return a;
}

function readValue(profile, field) {
  const t = field.target;
  if (t.kind === "attr") return parseFloat(profile.getAttribute(t.attr));
  if (t.kind === "attrChild") return parseFloat(attrChild(profile, t.name).getAttribute("value"));
  if (t.kind === "select") {
    const raw = selectsFor(profile, t)[0].getAttribute("value");
    return field.control === "toggle" ? raw === field.on : parseFloat(raw);
  }
  if (t.kind === "surfaceSpeed" || t.kind === "surfacePrio") return 0; // new rule, none in upstream
  if (t.kind === "block") return false; // "Block completely" box, off in upstream
  if (t.kind === "override") return false; // "Ignore speed limits" box, off in upstream
  return field.control === "toggle" ? false : null; // custom additions: off in upstream
}

/** OsmAnd default for every field, read from the template. */
export function readDefaults(templateText, dom = globalThis) {
  const { profile } = parse(templateText, dom);
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.id, readValue(profile, f)]));
}

// ---------- building ----------
const ONE_DECIMAL = new Set(["maxSpeed", "minSpeed", "defaultSpeed"]);
const fmt = (field, n) => {
  if (typeof n === "boolean") return n ? field.on : field.off;
  return ONE_DECIMAL.has(field.target.attr) ? Number(n).toFixed(1) : String(+Number(n).toFixed(4));
};
const describe = (t) => t.kind === "attr" ? t.attr : t.kind === "attrChild" ? t.name
  : `${t.parent[1]} ` + (t.pairs.length > 4 ? `${t.pairs.length} rules (${[...new Set(t.pairs.map(([, b]) => b))].join("/")})`
    : t.pairs.map(([a, b]) => `${a ?? "*"}=${b ?? "*"}`).join(", "));

/**
 * @param {{name:string, vehicle:"motorcycle"|"car", values:Object<string, number|boolean>}} s
 * @param {string} templateText
 * @param {{DOMParser: typeof DOMParser, XMLSerializer: typeof XMLSerializer}} [dom]
 */
export function buildOsmandXml(s, templateText, dom = globalThis) {
  const { doc, profile } = parse(templateText, dom);
  const changes = [];

  profile.setAttribute("name", s.name);

  // --- 1. plain values (attributes and existing rules) ---
  for (const f of ALL_FIELDS) {
    const t = f.target;
    if (!["attr", "attrChild", "select"].includes(t.kind)) continue;
    let v = s.values[f.id];
    if (f.control === "toggle") v = !!v;
    else {
      v = Number(v);
      if (!Number.isFinite(v)) continue;
      if (f.min !== undefined) v = Math.max(f.min, v); // e.g. obstacles: negative = impassable
    }
    const old = readValue(profile, f);
    if (typeof v === "boolean" ? v === old : Math.abs(old - v) < 1e-9) continue;
    if (t.kind === "attr") profile.setAttribute(t.attr, fmt(f, v));
    else if (t.kind === "attrChild") attrChild(profile, t.name).setAttribute("value", fmt(f, v));
    else selectsFor(profile, t).forEach((e) => e.setAttribute("value", fmt(f, v)));
    changes.push(`${describe(t)}: ${fmt(f, old)} -> ${fmt(f, v)}`);
  }

  // --- 1b. new speed rules (first match wins) ---
  // Ticked "Ignore speed limits" boxes: the slider's value goes BEFORE the $maxspeed rules, surfaces first.
  // Surface speeds without the box go right AFTER the $maxspeed rules, before the road types.
  const byId = Object.fromEntries(ALL_FIELDS.map((f) => [f.id, f]));
  const kmh = (f) => String(Math.round(Number(s.values[f.id])));
  const before = [], after = [];
  for (const f of ALL_FIELDS) {
    if (f.target.kind === "override") {
      const p = byId[f.of];
      if (!s.values[f.id] || !(Number(s.values[p.id]) > 0)) continue;
      const pairs = p.target.kind === "surfaceSpeed" ? [[p.target.t, p.target.v]] : p.target.pairs;
      before.push({ surface: p.target.kind === "surfaceSpeed", value: kmh(p), pairs });
    } else if (f.target.kind === "surfaceSpeed" && Number(s.values[f.id]) > 0 && !s.values[f.box.id]) {
      after.push({ value: kmh(f), pairs: [[f.target.t, f.target.v]] });
    }
  }
  before.sort((a, b) => (a.surface ? 0 : 1) - (b.surface ? 0 : 1));
  if (before.length || after.length) {
    const speed = section(profile, ["way", "speed"]);
    const limits = children(speed).filter((e) => e.nodeName === "select" && (e.getAttribute("value") || "").startsWith("$"));
    if (!limits.length) throw new Error("Template has no speed-limit rule");
    const insert = (rules, anchor, comment, note) => {
      speed.insertBefore(doc.createComment(comment), anchor);
      speed.insertBefore(doc.createTextNode("\n\t\t\t"), anchor);
      for (const r of rules) for (const [t, v] of r.pairs) {
        speed.insertBefore(el(doc, "select", { value: r.value, t, v }), anchor);
        speed.insertBefore(doc.createTextNode("\n\t\t\t"), anchor);
        changes.push(`speed ${t}=${v}: ${r.value} km/h${note}`);
      }
    };
    const afterLimits = limits[limits.length - 1].nextSibling;
    if (before.length) insert(before, limits[0], " Routing Profile Creator: fixed speeds that ignore OSM speed limits ", ", ignores speed limits");
    if (after.length) {
      speed.insertBefore(doc.createTextNode("\n\t\t\t"), afterLimits);
      insert(after, afterLimits, " Routing Profile Creator: surface speeds (where no speed limit is mapped) ", " where no speed limit");
    }
  }

  // --- 1c. surface preferences upstream has no rule for: next to its gravel/unpaved rules ---
  const surfPrio = ALL_FIELDS.filter((f) => f.target.kind === "surfacePrio" && Number(s.values[f.id]) > 0);
  if (surfPrio.length) {
    const prio = section(profile, ["way", "priority"]);
    const anchor = children(prio).find((e) => e.nodeName === "select" && e.getAttribute("t") === "surface");
    if (!anchor) throw new Error("Template has no surface priority rule");
    prio.insertBefore(doc.createComment(" Routing Profile Creator: surface preferences "), anchor);
    prio.insertBefore(doc.createTextNode("\n\t\t\t"), anchor);
    for (const f of surfPrio) {
      const v = fmt(f, Number(s.values[f.id]));
      prio.insertBefore(el(doc, "select", { value: v, t: f.target.t, v: f.target.v }), anchor);
      prio.insertBefore(doc.createTextNode("\n\t\t\t"), anchor);
      changes.push(`priority ${f.target.t}=${f.target.v}: ${v}`);
    }
  }

  // --- 1d. "Block completely": -1 rules at the very top of the obstacle list (first match wins,
  // so they beat access-tag exceptions and switch blocks such as avoid_toll) ---
  const blocks = ALL_FIELDS.filter((f) => f.target.kind === "block" && s.values[f.id]);
  if (blocks.length) {
    const obst = section(profile, ["point", "obstacle"]);
    const first = obst.firstChild;
    obst.insertBefore(doc.createTextNode("\n\t\t\t"), first);
    obst.insertBefore(doc.createComment(" Routing Profile Creator: blocked completely "), first);
    for (const f of blocks) for (const [t, v] of f.target.pairs) {
      const attrs = { value: "-1", t };
      if (v !== null) attrs.v = v;
      obst.insertBefore(doc.createTextNode("\n\t\t\t"), first);
      obst.insertBefore(el(doc, "select", attrs), first);
      changes.push(`obstacle ${t}=${v ?? "*"}: blocked`);
    }
  }

  // --- 2. vehicle-specific rules ---
  // The car profile serves car, truck and motorcycle via <if param="profile_…"> blocks.
  // A custom profile is its own "Navigation type", so make the chosen vehicle's rules
  // unconditional and stop offering derived profiles.
  const derived = children(profile).find((e) => e.nodeName === "attribute" && e.getAttribute("name") === "derivedProfiles");
  if (derived) derived.setAttribute("value", "default");
  if (s.vehicle === "motorcycle") {
    const n = unwrapIfs(profile, "profile_motorcycle");
    changes.push(`motorcycle rules always active (${n} blocks: motorcycle=*, oneway:motorcycle, …)`);
  }

  // --- 3. extra in-app switches ---
  if (s.values.blockMotorroads) {
    const params = children(profile).filter((e) => e.nodeName === "parameter");
    insertAfter(params[params.length - 1], el(doc, "parameter", {
      id: "avoid_motorroads", name: "Block motorways and motorroads",
      description: "Never use motorways or roads with motorway rules (motorroad=yes)", type: "boolean",
    }), "\t\t");
    // Rules are first-match: put the block right after the leading osmand_change rule,
    // before the generic "highway=motorway is allowed" selects.
    const access = section(profile, ["way", "access"]);
    insertAfter(children(access)[0], ifBlock(doc, "avoid_motorroads", [
      ["-1", "highway", "motorway"], ["-1", "highway", "motorway_link"], ["-1", "motorroad", "yes"],
    ]), "\t\t\t", " Routing Profile Creator: hard block on motorways and motorroads ");
    changes.push('new switch "Block motorways and motorroads" (avoid_motorroads)');
  }

  // --- 4. header comment ---
  const safeName = s.name.replace(/-{2,}/g, "-"); // "--" is not allowed inside XML comments
  const header = doc.createComment(
    `\n  ${safeName}\n  Created with Routing Profile Creator (https://therealnepomuk.github.io/routing-profile-creator/)\n` +
    `  Based on the OsmAnd car profile (GPLv3, OsmAnd B.V.), source noted in the template below.\n` +
    `  Changes from the original car profile:\n` + changes.map((c) => `    - ${c}`).join("\n") + "\n");
  doc.insertBefore(header, doc.firstChild);

  let out = new dom.XMLSerializer().serializeToString(doc);
  out = out.replace(/^<\?xml[^>]*\?>\s*/, "");
  // Text nodes can't live at document level, so restore the line breaks between the
  // leading comments and the root element here (only in that prefix).
  const root = out.indexOf("<osmand_routing_config");
  out = out.slice(0, root).replace(/-->\s*/g, "-->\n") + out.slice(root);
  return '<?xml version="1.0" encoding="utf-8"?>\n' + out.replace(/\s*$/, "\n");
}

// ---------- DOM helpers ----------
function el(doc, tag, attrs) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function ifBlock(doc, param, selects) {
  const ifEl = el(doc, "if", { param });
  for (const [value, t, v] of selects) {
    ifEl.appendChild(doc.createTextNode("\n\t\t\t\t"));
    ifEl.appendChild(el(doc, "select", { value, t, v }));
  }
  ifEl.appendChild(doc.createTextNode("\n\t\t\t"));
  return ifEl;
}

// Insert `node` (optionally preceded by a comment) after `ref`, on its own line.
function insertAfter(ref, node, indent, comment) {
  const parent = ref.parentNode;
  const anchor = ref.nextSibling;
  const doc = ref.ownerDocument;
  const add = (n) => parent.insertBefore(n, anchor);
  if (comment) { add(doc.createTextNode("\n" + indent)); add(doc.createComment(comment)); }
  add(doc.createTextNode("\n" + indent));
  add(node);
}

// Replace every <if param="…"> with its children (makes those rules unconditional).
function unwrapIfs(root, param) {
  const found = Array.from(root.getElementsByTagName("if")).filter((e) => e.getAttribute("param") === param);
  for (const ifEl of found) {
    const parent = ifEl.parentNode;
    while (ifEl.firstChild) parent.insertBefore(ifEl.firstChild, ifEl);
    parent.removeChild(ifEl);
  }
  return found.length;
}
