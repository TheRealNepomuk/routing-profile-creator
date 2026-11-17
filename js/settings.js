// Settings schema — every adjustable value, as close as possible to how OsmAnd's router uses it.
// The page is rendered from this, the exporter applies it, and the OsmAnd defaults are read
// from the template at runtime (so they always match the pinned upstream profile).
//
// Targets:
//   { kind: "attr", attr }                       → <routingProfile attr="…">
//   { kind: "attrChild", name }                  → <attribute name="…" value="…"/> inside the profile
//   { kind: "select", parent: [tag, attribute], pairs: [[t, v], …] }
//        → direct-child <select t v value="…"> (t or v null = attribute absent); all pairs get the
//          same value, the first one is read as the default
//   { kind: "surfaceSpeed", t, v }               → NEW speed rule (surfaces have none upstream); 0 = no rule.
//        Placed right after the speed-limit rules, or before them when its "Ignore speed limits" box is ticked
//   { kind: "override" }                         → "Ignore speed limits" box of a speed slider (field.of):
//        the slider's value as NEW rule(s) placed before the speed-limit rules
//   { kind: "surfacePrio", t, v }                → NEW priority rule for a surface upstream has none for; 0 = no rule
//   { kind: "block", pairs }                     → "Block completely" box of an obstacle slider (field.of):
//        NEW obstacle rules with value -1 at the very top of the obstacle list (first match wins)
//   { kind: "custom" }                           → handled by name in the exporter
// Toggles on a select target store true/false and write `on` / `off` (default 1 / -1).
// Info texts: a blank line ("\n\n") starts a new paragraph.
//
// Facts behind the texts (OsmAnd GeneralRouter / RouteResultPreparation, checked 2026-11-14):
//   road speed = first matching speed rule (or defaultSpeed), clamped to [minSpeed, maxSpeed]
//   route choice uses road speed × priority
//   turns: sharpTurn > 120°, slightTurn 60–120°, half slightTurn 30–60°, roundabout half in + half out
//   penalty_transition: switching roads adds |a − b| / 2 seconds
//   obstacle < 0 = impassable
//   arrival time = distance / speed (clamped, no priority) + obstacle_time; no turn, transition or
//     obstacle penalties
//   short_way ("Fuel-efficient way" in the app): routing speed capped at 55 km/h, shortWay* turn values

const KMH = "km/h", SEC = "s", X = "×";

const sel = (parent, ...pairs) => ({ kind: "select", parent, pairs });
const SPEED = ["way", "speed"], PRIO = ["way", "priority"], TRANS = ["way", "penalty_transition"];
const OBST = ["point", "obstacle"], ACCESS = ["way", "access"];

const slider = (id, label, unit, min, max, step, target, info, extra = {}) =>
  ({ id, label, unit, control: "slider", min, max, step, target, info, ...extra });

// ---- what each road type is (OSM highway=* classes; the exact use varies by country) ----
const RAMP = (road) => `Ramps (${road}_link) are the slip roads that lead onto, off or between ${road} roads, and short connecting lanes at their junctions.`;
const ROAD = {
  motorway: "Motorways: the top road class, with separate carriageways, no crossings and access only via ramps (e.g. Autobahn, autoroute, Interstate).",
  motorway_link: "Motorway ramps: the slip roads that lead onto, off or between motorways.",
  trunk: "Trunk roads: the most important roads that aren't motorways, often expressways or dual carriageways. What counts as trunk varies a lot by country.",
  trunk_link: "Trunk ramps: the slip roads that lead onto, off or between trunk roads.",
  primary: "Primary roads: major roads linking larger towns, often national routes.",
  secondary: "Secondary roads: roads linking towns, often regional routes.",
  tertiary: "Tertiary roads: roads linking villages and smaller towns, and the main streets within towns.",
  unclassified: "Unclassified roads: minor public roads below tertiary, e.g. country lanes between hamlets and farms, or streets in industrial areas. Despite the name, this is a real road class in OSM, not a missing one.",
  unclassified_road: " Roads whose class nobody has mapped yet (highway=road) use the same value.",
  residential: "Residential streets: streets in housing areas that lead to people's homes.",
  service: "Service roads: access roads to buildings, parking lots, petrol stations and the like, plus driveways and alleys.",
  living_street: "Living streets: residential streets where pedestrians have priority and vehicles must go at walking pace (e.g. woonerf, Spielstraße, home zone).",
  track: "Tracks: farm and forest roads, often unpaved.",
  ferry: "Car ferries.",
  shuttle_train: "Car trains: trains you drive your vehicle onto, e.g. through the Channel Tunnel or Alpine tunnels.",
  other: "Any road that matches none of the other types, e.g. paths or cycleways if you allow them.",
};
const withRamp = (road) => `${ROAD[road]} ${RAMP(road)}`;
const ramp = (road) => `${road[0].toUpperCase() + road.slice(1)} ramps (${road}_link): the slip roads that lead onto, off or between ${road} roads, and short connecting lanes at their junctions.`;

const SURFACE = {
  unpaved: "Roads tagged surface=unpaved: not paved, but the exact surface isn't mapped.",
  gravel: "Roads tagged surface=gravel: loose gravel.",
  fine_gravel: "Roads tagged surface=fine_gravel: small-grained gravel, usually firmer than plain gravel.",
  compacted: "Roads tagged surface=compacted: gravel and sand pressed into a firm surface, like a good forest road.",
  dirt: "Roads tagged surface=dirt: bare earth, muddy when wet.",
  ground: "Roads tagged surface=ground: natural ground with nothing added, muddy when wet.",
};

// ---- field builders ----
// Option ⓘ texts only say what the thing is; the general explanation lives in the group ⓘ.
// A field can carry a `box`: a checkbox field rendered under its slider ("Ignore speed limits",
// "Block completely"). A `card` bundles several fields for one road type or surface.

const IGNORE_INFO = "Normally OsmAnd uses the posted speed limit where there is one, and your speed only where there isn't. Tick this to use your speed on every road of this type.\n\nCareful: that includes stretches through towns with a 30 or 50 limit, so routes through towns look faster than they are.";
const BLOCK_INFO = "The route never passes one, even where it's tagged as open for you.";
const limitBox = (id) => ({ id: "over_" + id, of: "speed_" + id, label: "Ignore speed limits", control: "toggle", target: { kind: "override" }, info: IGNORE_INFO });
const blockBox = (id, pairs) => ({ id: "block_" + id, of: "obst_" + id, label: "Block completely", control: "toggle", target: { kind: "block", pairs }, info: BLOCK_INFO });
const RAMP_PRIO_INFO = "Usually a bit lower than the road itself. At big junctions, ramps often run right alongside the main road, and a lower value keeps the route on the main road.\n\nTo stop the route hopping on and off main roads in general, use Switching road type.";
const SPOTTY = "Use with caution: this data is spotty and inconsistent between regions.";
const PRIO_INFO = "- Preference: how much the route planner likes these roads. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.";

const card = (id, label, info, fields) => ({ id: "card_" + id, card: true, label, info, fields });

const speed = (id, pairs, { label = "Speed", note = "", box = true } = {}) => slider("speed_" + id, label, KMH, 5, 150, 5, sel(SPEED, ...pairs),
  note, box ? { box: limitBox(id) } : {});
const surfaceSpeed = (id) => slider("speed_" + id, "Speed", KMH, 0, 120, 5, { kind: "surfaceSpeed", t: "surface", v: id },
  "", { offAtZero: "Off", box: limitBox(id) });

const prio = (id, pairs, { label = "Preference", info = "" } = {}) => slider("prio_" + id, label, X, 0.01, 2, 0.01, sel(PRIO, ...pairs), info);
const surfacePrio = (id) => slider("prio_" + id, "Preference", X, 0, 2, 0.01, { kind: "surfacePrio", t: "surface", v: id }, "", { offAtZero: "Off" });

const allowed = (id, t, v, { label = "Allowed", info = "" } = {}) => ({
  id: "allow_" + id, label, control: "toggle", target: sel(ACCESS, [t, v]), on: "1", off: "-1", info,
});

const trans = (id, label, desc, pairs) => slider("trans_" + id, label, SEC, 0, 300, 1, sel(TRANS, ...pairs), desc);

const obstacle = (id, label, desc, pairs, { note = "", block = true } = {}) => slider("obst_" + id, label, SEC, 0, 600, 1, sel(OBST, ...pairs),
  desc + note, block ? { box: blockBox(id, pairs) } : {});

const ACCESS_LIMITED = [];
for (const t of ["motorcar", "motor_vehicle", "vehicle", "access"])
  for (const v of ["private", "destination", "delivery", "customers"]) ACCESS_LIMITED.push([t, v]);

const H = (v) => [["highway", v]];
const MOTORWAY_RAMP_NOTE = "OsmAnd always uses this speed on motorway ramps, even if they have a speed limit.";
const TRUNK_RAMP_NOTE = "OsmAnd uses this speed on trunk ramps even if they have a speed limit, except in towns (limit 50 or less).";

// Order: two sections by topic (road types, turns and obstacles). Inside each section, and inside
// each group, the common and useful settings come first and the rare ones last.
export const SECTIONS = [
  {
    id: "roads", title: "Road type preferences",
    groups: [
      {
        title: "Road types",
        info: "- Speed: used where OSM has no speed limit. Otherwise OsmAnd uses the limit.\n- Preference: how much the route planner likes these roads. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.\n- Max cruising speed and minimum speed (under All roads) limit both: no road counts as faster than the max, whatever its preference.",
        fields: [
          card("all", "All roads", "Limits for the speeds of every road type below.", [
            slider("maxSpeed", "Max cruising speed", KMH, 30, 150, 5, { kind: "attr", attr: "maxSpeed" },
              "The fastest any road is calculated with. Arrival times use it too.\n\n- It also caps preferences: at 90, a motorway, a trunk road and a fast primary road all count as 90, whatever their preference.", { sumPrefix: "max " }),
            slider("minSpeed", "Minimum speed", KMH, 1, 60, 1, { kind: "attr", attr: "minSpeed" },
              "The slowest any road is calculated with. Arrival times use it too.\n\n- Example: tracks are set to 15 km/h, but with a minimum of 20 they count as 20. To make a lower road speed count, lower the minimum too.\n- It doesn't avoid slow roads. To avoid roads, lower their preference.", { sumPrefix: "min " }),
          ]),
          card("motorway", "Motorway", withRamp("motorway"), [
            speed("motorway", H("motorway")), prio("motorway", H("motorway")),
            speed("motorway_link", H("motorway_link"), { label: "Ramp speed", note: MOTORWAY_RAMP_NOTE, box: false }),
            prio("motorway_link", H("motorway_link"), { label: "Ramp preference", info: RAMP_PRIO_INFO }),
          ]),
          card("trunk", "Trunk road", withRamp("trunk"), [
            speed("trunk", H("trunk")), prio("trunk", H("trunk")),
            speed("trunk_link", H("trunk_link"), { label: "Ramp speed", note: TRUNK_RAMP_NOTE, box: false }),
            prio("trunk_link", H("trunk_link"), { label: "Ramp preference", info: RAMP_PRIO_INFO }),
          ]),
          card("primary", "Primary", withRamp("primary"), [
            speed("primary", [...H("primary"), ...H("primary_link")], { note: "Also used on primary ramps." }),
            prio("primary", H("primary")), prio("primary_link", H("primary_link"), { label: "Ramp preference", info: RAMP_PRIO_INFO }),
          ]),
          card("secondary", "Secondary", withRamp("secondary"), [
            speed("secondary", [...H("secondary"), ...H("secondary_link")], { note: "Also used on secondary ramps." }),
            prio("secondary", H("secondary")), prio("secondary_link", H("secondary_link"), { label: "Ramp preference", info: RAMP_PRIO_INFO }),
          ]),
          card("tertiary", "Tertiary", withRamp("tertiary"), [
            speed("tertiary", [...H("tertiary"), ...H("tertiary_link")], { note: "Also used on tertiary ramps." }),
            prio("tertiary", H("tertiary")), prio("tertiary_link", H("tertiary_link"), { label: "Ramp preference", info: RAMP_PRIO_INFO }),
          ]),
          card("unclassified", "Unclassified", ROAD.unclassified + ROAD.unclassified_road, [
            speed("unclassified", [...H("unclassified"), ...H("road")]), prio("unclassified", [...H("unclassified"), ...H("road")]),
          ]),
          card("residential", "Residential", ROAD.residential, [speed("residential", H("residential")), prio("residential", H("residential"))]),
          card("track", "Track", ROAD.track, [speed("track", H("track")), prio("track", H("track")), allowed("track", "highway", "track")]),
          card("service", "Service road", ROAD.service, [speed("service", H("service")), prio("service", H("service")), allowed("service", "highway", "service")]),
          card("living_street", "Living street", ROAD.living_street,
            [speed("living_street", H("living_street")), prio("living_street", H("living_street")), allowed("living_street", "highway", "living_street")]),
          card("other", "Everything else", ROAD.other + " Roads of unknown type (highway=road) count as Unclassified instead.", [
            slider("defaultSpeed", "Speed", KMH, 5, 150, 5, { kind: "attr", attr: "defaultSpeed" }, ""),
            prio("other", [[null, null]]),
          ]),
        ],
      },
      {
        title: "Surfaces", collapsed: true,
        info: "Comes before the road type: a gravel tertiary road uses the gravel values. Off = the road type's value is used.\n\n- Speed: used where OSM has no speed limit.\n- Preference: how much the route planner likes these roads. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.\n\n" + SPOTTY,
        fields: [
          card("gravel", "Gravel", SURFACE.gravel, [surfaceSpeed("gravel"), prio("gravel", [["surface", "gravel"]])]),
          card("unpaved", "Unpaved", SURFACE.unpaved, [surfaceSpeed("unpaved"), prio("unpaved", [["surface", "unpaved"]])]),
          card("compacted", "Compacted", SURFACE.compacted, [surfaceSpeed("compacted"), surfacePrio("compacted")]),
          card("fine_gravel", "Fine gravel", SURFACE.fine_gravel, [surfaceSpeed("fine_gravel"), surfacePrio("fine_gravel")]),
          card("dirt", "Dirt", SURFACE.dirt, [surfaceSpeed("dirt"), surfacePrio("dirt")]),
          card("ground", "Ground", SURFACE.ground, [surfaceSpeed("ground"), surfacePrio("ground")]),
        ],
      },
      {
        title: "Road condition", collapsed: true,
        info: "Comes before the road type: a rough primary road uses these values.\n\n- Preference: how much the route planner likes these roads. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.\n\n" + SPOTTY,
        fields: [
          prio("smooth_bad", [["smoothness", "bad"]], { label: "Smoothness: bad", info: "Roads tagged smoothness=bad: rough, but fine for robust bikes and cars." }),
          prio("smooth_very_bad", [["smoothness", "very_bad"]], { label: "Smoothness: very bad", info: "Roads tagged smoothness=very_bad: needs high clearance." }),
          prio("grade5", [["tracktype", "grade5"]], { label: "Track grade 5", info: "The roughest tracks (tracktype=grade5): soft, unpaved, often just grass or earth." }),
          prio("smooth_horrible", [["smoothness", "horrible"]], { label: "Smoothness: horrible", info: "Roads tagged smoothness=horrible: off-road vehicles only." }),
          prio("smooth_very_horrible", [["smoothness", "very_horrible"]], { label: "Smoothness: very horrible", info: "Roads tagged smoothness=very_horrible: specialised off-road vehicles only." }),
          prio("smooth_impassable", [["smoothness", "impassable"]], { label: "Smoothness: impassable", info: "Roads tagged smoothness=impassable: no wheeled vehicle gets through." }),
        ],
      },
      {
        title: "Paths, cycleways and steps", collapsed: true,
        info: "Whether the route may use them at all.\n\n- They have no speed or preference of their own, so the values under Everything else are used.\n- Check your local rules before allowing them.",
        fields: [
          allowed("path", "highway", "path", { label: "Paths", info: "Multi-use paths (highway=path)." }),
          allowed("cycleway", "highway", "cycleway", { label: "Cycleways", info: "Paths meant for bicycles." }),
          allowed("footway", "highway", "footway", { label: "Footways", info: "Paths meant for pedestrians." }),
          allowed("steps", "highway", "steps", { label: "Steps", info: "Stairs." }),
        ],
      },
      {
        title: "Access", collapsed: true,
        info: PRIO_INFO,
        fields: [
          prio("access_limited", ACCESS_LIMITED, { label: "Private / destination only", info: "Roads you may only use to reach a place on them (private, destination, delivery, customers)." }),
          prio("reversible", [["oneway", "reversible"]], { label: "Reversible one-way", info: "Lanes whose direction changes during the day (oneway=reversible)." }),
        ],
      },
      {
        title: "Switching road type", collapsed: true,
        info: "Keeps the route from hopping between road types, e.g. leaving a main road for a short stretch of side street and getting back on.\n\n- Each road type has a value in seconds.\n- Changing to a road with a different value adds half the difference.\n- Example: primary (50) \u2192 tertiary (130) adds 40 s, and back onto the primary another 40 s.",
        fields: [
          trans("motorway", "Motorway", ROAD.motorway, H("motorway")),
          trans("trunk", "Trunk road and ramp", withRamp("trunk"), [...H("trunk"), ...H("trunk_link")]),
          trans("primary", "Primary", ROAD.primary, H("primary")),
          trans("secondary", "Secondary and ramp", withRamp("secondary"), [...H("secondary"), ...H("secondary_link")]),
          trans("tertiary", "Tertiary and ramp", withRamp("tertiary"), [...H("tertiary"), ...H("tertiary_link")]),
          trans("unclassified", "Unclassified", ROAD.unclassified, H("unclassified")),
          trans("residential", "Residential", ROAD.residential, H("residential")),
          trans("service", "Service road", ROAD.service, H("service")),
          trans("motorway_link", "Motorway ramp", ROAD.motorway_link, H("motorway_link")),
          trans("primary_link", "Primary ramp", ramp("primary"), H("primary_link")),
          trans("gravel", "Gravel surface", SURFACE.gravel + " Comes before the road types.", [["surface", "gravel"]]),
          trans("side_road", "Side road", "Side roads that run alongside a main road (side_road=*).", [["side_road", "yes"], ["side_road", "rotary"], ["side_road", "double"]]),
          trans("other", "Everything else", ROAD.other, [[null, null]]),
        ],
      },
      {
        title: "Ferries and car trains", collapsed: true,
        info: "- Speed: the speed a crossing or journey is calculated with.\n- Preference: how much the route planner likes these roads. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.",
        fields: [
          card("ferry", "Ferries", ROAD.ferry + " OsmAnd also has its own \"Avoid ferries\" switch.", [
            allowed("ferry", "route", "ferry"),
            prio("ferry", [["route", "ferry"]]),
            speed("ferry", [["route", "ferry"]], { box: false }),
            obstacle("ferry_terminal", "Terminal wait", "Seconds added at each ferry terminal, where you board or leave a ferry. Stands in for waiting and loading. Only steers the route choice, not the arrival time.",
              [["amenity", "ferry_terminal"]], { block: false }),
          ]),
          card("shuttle_train", "Car trains", ROAD.shuttle_train, [
            allowed("shuttle_train", "route", "shuttle_train"),
            prio("shuttle_train", [["route", "shuttle_train"]]),
            speed("shuttle_train", [["route", "shuttle_train"]], { box: false }),
          ]),
        ],
      },
    ],
  },
  {
    id: "time", title: "Turns, stops and obstacles",
    intro: "These seconds only steer which route OsmAnd picks: a route with more of them looks slower to the planner. They don't change the arrival time OsmAnd shows.",
    groups: [
      {
        title: "Turns",
        fields: [
          slider("slightTurn", "Turn (60–120°)", SEC, 0, 60, 1, { kind: "attr", attr: "slightTurn" },
            "Seconds added for a normal turn. Gentle bends of 30–60° get half of this."),
          slider("sharpTurn", "Sharp turn (over 120°)", SEC, 0, 120, 1, { kind: "attr", attr: "sharpTurn" },
            "Seconds added for very sharp turns and U-turns."),
          slider("roundaboutTurn", "Roundabout", SEC, 0, 60, 1, { kind: "attr", attr: "roundaboutTurn" },
            "Seconds added for a roundabout: half when entering, half when leaving."),
          slider("penaltyForReverseDirection", "Turning around at the start", SEC, 0, 900, 10, { kind: "attrChild", name: "penaltyForReverseDirection" },
            "Seconds added if the route starts in the opposite direction to the one you're facing, i.e. the time to find a place to turn."),
        ],
      },
      {
        title: "Traffic lights, signs and fords",
        info: "Seconds added for each one the route passes. 0 = ignore.",
        fields: [
          obstacle("traffic_signals", "Traffic light", "Traffic lights.", H("traffic_signals"), { block: false }),
          obstacle("stop", "Stop sign", "Stop signs.", H("stop"), { block: false }),
          obstacle("give_way", "Give way", "Give-way (yield) signs.", H("give_way"), { block: false }),
          obstacle("traffic_calming", "Speed bump / calming", "Speed bumps, humps, cushions, chicanes and similar spots built to slow traffic down.", [["traffic_calming", null]], { block: false }),
          obstacle("ford", "Ford", "A ford: a place where the road goes through a stream or river instead of over a bridge.", [["ford", null]],
            { note: " OsmAnd's own \"Avoid ice roads, fords\" switch can also block them, per trip." }),
        ],
      },
      {
        title: "Barriers", collapsed: true,
        info: "- Seconds added for each one the route passes. 0 = ignore.\n- Barriers not listed here, or closed to you by their tags, block the road anyway.",
        fields: [
          obstacle("toll_booth", "Toll booth", "Toll booths, where you stop to pay.", [["barrier", "toll_booth"]],
            { note: " OsmAnd's own \"Avoid toll roads\" switch avoids toll roads altogether." }),
          obstacle("border_control", "Border control", "Border checkpoints.", [["barrier", "border_control"]],
            { note: " OsmAnd's own \"Avoid border crossing\" switch avoids borders altogether." }),
          obstacle("gate", "Gate", "Gates without access tags. They may be closed.", [["barrier", "gate"]]),
          obstacle("lift_gate", "Lift gate (barrier arm)", "Barrier arms that lift up, e.g. at car parks or company entrances, without access tags.", [["barrier", "lift_gate"]]),
          obstacle("cattle_grid", "Cattle grid", "Bars across the road over a pit: animals won't cross it, vehicles drive over it. Slippery on two wheels when wet.", [["barrier", "cattle_grid"]]),
          obstacle("access_destination", "Barrier: destination only", "Barriers marked as open only for traffic going to a place behind them.", [["motorcar", "destination"], ["motor_vehicle", "destination"], ["vehicle", "destination"], ["access", "destination"]], { block: false }),
          obstacle("swing_gate", "Swing gate", "A bar that swings sideways to open, without access tags.", [["barrier", "swing_gate"]]),
          obstacle("sliding_gate", "Sliding gate", "Gates or beams that slide sideways to open.", [["barrier", "sliding_gate"], ["barrier", "sliding_beam"]]),
          obstacle("entrance", "Entrance", "An opening in a wall or fence, without a gate.", [["barrier", "entrance"]]),
          obstacle("bump_gate", "Bump gate", "A gate you push open slowly with the front of your vehicle, mostly on farms.", [["barrier", "bump_gate"]]),
          obstacle("hampshire_gate", "Hampshire gate", "A section of wire fence that's unhooked and pulled aside by hand, mostly on farms.", [["barrier", "hampshire_gate"]]),
          obstacle("sally_port", "Sally port", "Two gates in a row with a space in between, e.g. at secured sites.", [["barrier", "sally_port"]]),
          obstacle("height_restrictor", "Height restrictor", "A bar over the road that limits vehicle height.", [["barrier", "height_restrictor"]]),
        ],
      },
    ],
  },
];

// Every value-carrying field, with cards and checkbox boxes expanded.
export const flatFields = (fields) => fields.flatMap((f) => (f.card ? flatFields(f.fields) : f.box ? [f, f.box] : [f]));
export const ALL_FIELDS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => flatFields(g.fields)));

// Profile name from the biggest changes, e.g. "Max 110 +Secondary −Motorway −Gravel".
// + = preferred more than OsmAnd does, − = less (or not allowed). Kept within 40 characters.
const ROW_CARDS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields.filter((f) => f.card && f.id !== "card_all")));
export function autoName(values, defaults) {
  const parts = [];
  if (values.maxSpeed !== defaults.maxSpeed) parts.push({ w: 99, t: `Max ${values.maxSpeed}` });
  for (const c of ROW_CARDS) {
    const allow = c.fields.find((f) => f.id.startsWith("allow_"));
    if (allow && values[allow.id] !== defaults[allow.id]) { parts.push({ w: 9, t: (values[allow.id] ? "+" : "−") + c.label }); continue; }
    const pref = c.fields.find((f) => f.id.startsWith("prio_") && !f.label.startsWith("Ramp"));
    if (!pref) continue;
    const base = pref.offAtZero ? 1 : defaults[pref.id], v = values[pref.id];
    if (pref.offAtZero && Number(v) === 0) continue;
    const ratio = v / base;
    if (Math.abs(ratio - 1) >= 0.1) parts.push({ w: Math.abs(Math.log(ratio)), t: (ratio > 1 ? "+" : "−") + c.label });
  }
  // Pick the biggest changes that fit, then list them as: max speed, preferred, avoided, switch.
  parts.sort((a, b) => b.w - a.w);
  const picked = [];
  for (const p of parts) if ([...picked, p].map((x) => x.t).join(" ").length <= 40) picked.push(p);
  const rank = (t) => (t.startsWith("Max") ? 0 : t.startsWith("+") ? 1 : t.startsWith("−") ? 2 : 3);
  picked.sort((a, b) => rank(a.t) - rank(b.t) || b.w - a.w);
  return picked.map((x) => x.t).join(" ") || "Car (OsmAnd default)";
}

export function fileNameFor(name) {
  const base = name.normalize("NFKD").replace(/−/g, "-").replace(/[^\w\s+-]/g, "").trim().replace(/\s+/g, "_");
  return (base || "routing_profile") + ".xml";
}
