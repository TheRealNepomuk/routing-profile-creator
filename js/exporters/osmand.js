// OsmAnd exporter: settings → complete OsmAnd routing profile (.xml).
//
// Starts from the unmodified upstream car profile (templates/osmand-car.xml) and changes only
// what the settings ask for. A custom profile does NOT inherit rules from baseProfile="car",
// so the output must always contain the full rule set.

export const TEMPLATE_URL = new URL("../../templates/osmand-car.xml", import.meta.url).href;

/**
 * @param {import("../settings.js").Settings} s
 * @param {string} templateText  contents of templates/osmand-car.xml
 * @param {{DOMParser: typeof DOMParser, XMLSerializer: typeof XMLSerializer}} [dom]  injectable for tests
 * @returns {string} XML text
 */
export function buildOsmandXml(s, templateText, dom = globalThis) {
  const doc = new dom.DOMParser().parseFromString(templateText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Template is not valid XML");

  const profile = doc.getElementsByTagName("routingProfile")[0];
  if (!profile) throw new Error("Template has no routingProfile");

  const changes = [];
  const set = (attr, value, label) => {
    const old = profile.getAttribute(attr);
    const v = String(value);
    if (old !== v) changes.push(`${label}: ${old} -> ${v}`);
    profile.setAttribute(attr, v);
  };

  // --- 1. profile attributes ---
  profile.setAttribute("name", s.name);
  set("maxSpeed", s.maxSpeed.toFixed(1), "maxSpeed (km/h)");
  set("defaultSpeed", s.defaultSpeed.toFixed(1), "defaultSpeed (km/h)");
  set("sharpTurn", s.turns.sharp, "sharpTurn (s)");
  set("slightTurn", s.turns.slight, "slightTurn (s)");
  set("roundaboutTurn", s.turns.roundabout, "roundaboutTurn (s)");

  // --- 2. vehicle-specific rules ---
  // The car profile serves car, truck and motorcycle via <if param="profile_…"> blocks.
  // A custom profile is selected as its own "Navigation type", so we make the chosen
  // vehicle's rules unconditional and stop offering the derived profiles.
  const derived = findChild(profile, "attribute", (e) => e.getAttribute("name") === "derivedProfiles");
  if (derived) derived.setAttribute("value", "default");
  if (s.vehicle === "motorcycle") {
    const n = unwrapIfs(profile, "profile_motorcycle");
    changes.push(`motorcycle rules always active (${n} blocks: motorcycle=*, oneway:motorcycle, …)`);
  }

  // --- 3. extra in-app switches ---
  const lastParam = lastChild(profile, "parameter");
  const accessWay = findChild(profile, "way", (e) => e.getAttribute("attribute") === "access");
  const obstacle = findChild(profile, "point", (e) => e.getAttribute("attribute") === "obstacle");

  if (s.blockMotorroads.enabled) {
    insertAfter(lastParam, el(doc, "parameter", {
      id: "avoid_motorroads", name: "Block motorways and motorroads",
      description: "Never use motorways or roads with motorway rules (motorroad=yes)", type: "boolean",
    }), "\t\t");
    // Rules are first-match: put the block right after the leading osmand_change rule,
    // before the generic "highway=motorway is allowed" selects.
    const block = ifBlock(doc, "avoid_motorroads", [
      ["-1", "highway", "motorway"], ["-1", "highway", "motorway_link"], ["-1", "motorroad", "yes"],
    ]);
    insertAfter(firstElementChild(accessWay), block, "\t\t\t",
      " Routing Profile Creator: hard block on motorways and motorroads ");
    changes.push('new switch "Block motorways and motorroads" (avoid_motorroads)');
  }

  // --- 4. traffic light routing cost ---
  // Routing cost only (<point attribute="obstacle">); the ETA cost (obstacle_time) stays unchanged.
  // Negative values would make every traffic light impassable in OsmAnd, so clamp at 0.
  const sec = Math.max(0, Math.round(s.trafficLightCost));
  const lightRule = elementChildren(obstacle).find((e) =>
    e.nodeName === "select" && e.getAttribute("t") === "highway" && e.getAttribute("v") === "traffic_signals");
  if (!lightRule) throw new Error("Template has no traffic light rule");
  if (lightRule.getAttribute("value") !== String(sec)) {
    changes.push(`traffic light routing cost (s): ${lightRule.getAttribute("value")} -> ${sec}`);
    lightRule.setAttribute("value", String(sec));
  }

  // --- 5. header comment ---
  const safeName = s.name.replace(/-{2,}/g, "-"); // "--" is not allowed inside XML comments
  const header = doc.createComment(
    `\n  ${safeName}\n  Created with Routing Profile Creator (https://therealnepomuk.github.io/routing-profile-creator/)\n` +
    `  Based on the OsmAnd car profile (GPLv3, OsmAnd B.V.), source noted in the template below.\n` +
    `  Changes from the original car profile:\n` + changes.map((c) => `    - ${c}`).join("\n") + "\n");
  doc.insertBefore(header, doc.firstChild);

  let out = new dom.XMLSerializer().serializeToString(doc);
  out = out.replace(/^<\?xml[^>]*\?>\s*/, "");
  // Text nodes can't live at document level, so put the line breaks between the
  // leading comments and the root element back in here (only in that prefix).
  const root = out.indexOf("<osmand_routing_config");
  out = out.slice(0, root).replace(/-->\s*/g, "-->\n") + out.slice(root);
  return '<?xml version="1.0" encoding="utf-8"?>\n' + out.replace(/\s*$/, "\n");
}

// ---------- DOM helpers ----------
const ELEMENT = 1;

function elementChildren(parent) {
  return Array.from(parent.childNodes).filter((n) => n.nodeType === ELEMENT);
}
function firstElementChild(parent) {
  return elementChildren(parent)[0];
}
function findChild(parent, tag, pred) {
  return elementChildren(parent).find((e) => e.nodeName === tag && pred(e));
}
function lastChild(parent, tag) {
  const all = elementChildren(parent).filter((e) => e.nodeName === tag);
  return all[all.length - 1];
}

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

// Insert `node` (optionally preceded by a comment) before `ref`, on its own line.
function insertBefore(ref, node, indent, comment) {
  const parent = ref.parentNode;
  const doc = ref.ownerDocument;
  if (comment) { parent.insertBefore(doc.createComment(comment), ref); parent.insertBefore(doc.createTextNode("\n" + indent), ref); }
  parent.insertBefore(node, ref);
  parent.insertBefore(doc.createTextNode("\n" + indent), ref);
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
