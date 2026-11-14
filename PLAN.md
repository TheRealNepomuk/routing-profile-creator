# Plan — Routing Profile Creator

**Status:** draft, updated 2026-11-14

**Name:** Routing Profile Creator — *Custom routing profiles for OsmAnd*
**Repo:** `routing-profile-creator` (public, GitHub) · **Hosting:** GitHub Pages · **Language:** English

## Goal

A simple, mobile-first web page where anyone can create a custom routing profile (`.xml`) for
OsmAnd in a minute and send it straight to the OsmAnd app on the same phone.

The tool itself is vehicle-neutral; v1 focuses on **small motorcycles** (the author's use case,
an underserved niche — trucks/vans already have dedicated apps). Other uses, e.g. a car towing a
trailer limited to 100 km/h, should be possible later by adding presets, not rewriting code.

## Principles

1. **Mobile-first.** The typical user is on their phone, creates the file and shares it straight to OsmAnd.
   Desktop gets the same page, just wider.
2. **As simple as possible.** Presets first, a few plain-language controls, advanced settings collapsed.
3. **Static site, no server.** The XML is generated in the browser. Hosting can be any static host
   (e.g. GitHub Pages).
4. **Correct files over clever files.** Every generated file is a *complete* routing profile.
   `baseProfile="car"` does not inherit the car rules, so profiles without the
   speed / priority / obstacle sections route badly or crash (lesson from the private project).

## Scope v1

- Settings form → generate XML → **share sheet** (Web Share API with the file) → OsmAnd
- Download fallback when sharing isn't available (desktop, older browsers)
- Instructions page / section, platform-detected (iOS vs Android)

## Out of scope (parked)

- Live route preview / map (would need OsmAnd's Java router on a server, see notes below)
- Worldwide or regional routing backend
- `.osf` one-tap profile package (worth testing later)

## Settings (v1 proposal)

Based on what proved useful in the private motorcycle profile:

| Control (plain language) | XML | Notes |
|---|---|---|
| Profile name | `routingProfile name` | Shown in OsmAnd's "Navigation type" list; suggest a default from the settings, e.g. "Moto 90 – no motorways" |
| My top speed (km/h) | `maxSpeed` | Caps route speed; does **not** avoid faster roads |
| Typical speed on unknown roads | `defaultSpeed` | Mostly ETA / unknown roads |
| Turns: "curvy is fine" ↔ "prefer straight" | `sharpTurn` / `slightTurn` / `roundaboutTurn` | One slider; raw values under Advanced. Car: 30/15/15, moto example: 15/8/5 |
| Toggle in app: "Avoid traffic lights" | new `avoid_traffic_signals` parameter | Routing cost 15 s → 60 s (Advanced: seconds), ETA unchanged |
| Toggle in app: "Block motorways and motorroads" | new `avoid_motorroads` parameter | Hard block on `motorway(_link)` + `motorroad=yes` |
| Motorcycle access rules | `motorcycle=*`, `oneway:motorcycle` | Always on for the motorcycle preset |

Toggles added as `<parameter id="avoid_…">` appear in OsmAnd iOS under
Navigation settings → Route parameters → "Avoid roads…".

**Presets:** v1 = motorcycle presets only, starting with "Small motorcycle (90 km/h)".
A preset is just data (base profile + setting values), so later presets like
"Car with trailer (100 km/h)" need no new code.

## Architecture

Three separate pieces:

1. **Settings model** — vehicle-neutral description of what the user wants
   (top speed, turn preference, avoid traffic lights, block motorways, access rules, name …).
2. **Presets** — named sets of settings values.
3. **Exporters** — turn the settings model into a file. v1 has one: **OsmAnd XML**.

Possible later exporters (not planned for v1): **BRouter `.brf`** (used by BRouter on Android,
Locus Map, Cruiser, OsmAnd Android as external router) or **GraphHopper custom models** (JSON).
The page and settings should not need to change to add one.

## Generation (OsmAnd exporter)

- Template = the **current upstream car profile** from `OsmAnd-resources/routing/routing.xml`,
  pinned to a commit and bundled in this repo (with source + commit noted). Not the private
  Nov 2025 copy.
- The generator changes only specific attributes / inserts specific blocks; everything else
  stays identical to upstream. Keep a header comment in the output listing every change.
- Filename: safe ASCII, ends in `.xml`. Created as a Blob in the browser (otherwise iOS Safari
  tends to *display* XML instead of saving it).

## Delivery to OsmAnd

1. **Share button** (`navigator.share({ files })`) → user picks OsmAnd in the share sheet.
2. **Download** fallback.

## Instructions page

Short, numbered, only the user's platform shown.

- **iOS:** Share → OsmAnd. **OsmAnd shows no confirmation — that's normal, the import still works.**
  Then: (fully close and reopen OsmAnd if it doesn't appear) → Settings → *profile* → Navigation settings →
  Navigation type → pick the new name. Toggles: Route parameters → "Avoid roads…".
  Fallback: Files app → copy to *On My iPhone → OsmAnd Maps → routing* → restart OsmAnd.
- **Android:** to be verified on a real device (tap file / share → OsmAnd).
- "How to compare": plan the same route with the built-in profile and the new one, switch between them.
- Known quirks (e.g. one-off "route can not be found from start point" on first calculation).

## Tech (proposal)

Plain HTML + CSS + JavaScript, no build step, no framework. Small enough not to need one and easy
to host and keep working. Revisit only if the form grows a lot.

## Legal

- Upstream `routing.xml` is GPLv3 → publish this site's code under **GPLv3**, credit OsmAnd, link the source.
- Name use: "for OsmAnd" / "works with OsmAnd" only. No "OsmAnd" in the site name/domain,
  no OsmAnd logo or artwork (CC-BY-NC-ND). Footer: "Not affiliated with or endorsed by OsmAnd B.V."
- Not legal advice; optionally ask OsmAnd directly.

## Test plan

- [ ] Share sheet with a `.xml` file on iPhone (Safari) → OsmAnd appears as a target? Import works?
- [ ] Same on Android (Chrome)
- [ ] Download fallback on both + desktop
- [ ] Generated file loads in OsmAnd, profile name shows up, toggles appear, a ~200 km route calculates
- [ ] Output diff vs upstream contains only the intended changes

## Decisions (2026-11-14)

- v1 vehicles: **motorcycles only**; architecture stays generic (presets + exporters)
- Name: **Routing Profile Creator** (checked: no GitHub repo or product with that name;
  `routingprofilecreator.com` had no DNS records, likely unregistered — unconfirmed)
- Language: **English** only for now
- Hosting: **GitHub Pages**, **public** repo
- Live route preview / map: **parked**

## Open questions

1. Which motorcycle presets besides "Small motorcycle (90 km/h)"? (e.g. 125cc / 70–80 km/h, touring)
2. Custom domain later, or stay on `github.io`?
