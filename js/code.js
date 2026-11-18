// Settings code: every value that differs from OsmAnd's default, as one line of text.
//
//   rpc1:maxSpeed=110,prio_secondary=1.2,motorcycle=1,n=My%20profile
//
// - "rpc1" = format version. Change it only if old codes can't be read the same way any more.
// - Field ids from js/settings.js, toggles as 1/0, numbers as plain decimals.
// - n = the profile name, only if the user typed one (otherwise the page builds it again).
// - Values left out = OsmAnd default. After a template update they follow the new default.
// - The code goes into the URL (#rpc1:…, shareable) and into a comment at the top of every
//   downloaded file, so the page can load a file again. It must therefore never contain "--"
//   (not allowed inside XML comments): ids have no "-", and "-" in the name is escaped.

import { ALL_FIELDS } from "./settings.js";

const PREFIX = "rpc1:";
const BY_ID = Object.fromEntries(ALL_FIELDS.map((f) => [f.id, f]));
const same = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
const escName = (s) => encodeURIComponent(s).replace(/[-!'()*~.]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** @returns {string} the code, or "" if nothing differs from the defaults and there is no name */
export function encodeSettings(values, defaults, name = null) {
  const parts = [];
  for (const f of ALL_FIELDS) {
    const v = values[f.id];
    if (v === undefined || same(v, defaults[f.id])) continue;
    parts.push(`${f.id}=${typeof v === "boolean" ? (v ? 1 : 0) : +Number(v).toFixed(4)}`);
  }
  if (name) parts.push("n=" + escName(name));
  return parts.length ? PREFIX + parts.join(",") : "";
}

/** Finds a settings code anywhere in a text (URL hash, XML file). */
export function findCode(text) {
  const m = /rpc1:[A-Za-z0-9_=,.%+-]*/.exec(text || "");
  return m ? m[0] : null;
}

/**
 * @returns {{values: Object, name: string|null, skipped: string[]}}
 *   values: only the entries in the code (merge them over the defaults);
 *   skipped: entries this version of the page doesn't know or can't read
 */
export function decodeSettings(code) {
  if (!code || !code.startsWith(PREFIX)) throw new Error("not a settings code");
  const values = {}, skipped = [];
  let name = null;
  for (const part of code.slice(PREFIX.length).split(",")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const id = i < 0 ? part : part.slice(0, i), raw = i < 0 ? "" : part.slice(i + 1);
    if (id === "n") {
      try { name = decodeURIComponent(raw).slice(0, 40); } catch { skipped.push(part); }
      continue;
    }
    const f = BY_ID[id];
    if (!f) { skipped.push(part); continue; }
    if (f.control === "toggle") {
      if (raw === "1" || raw === "0") values[id] = raw === "1";
      else skipped.push(part);
    } else {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) values[id] = Math.min(f.max, Math.max(f.min, n));
      else skipped.push(part);
    }
  }
  return { values, name, skipped };
}
