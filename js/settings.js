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
//   { kind: "override", t, v }                   → NEW speed rule placed before the speed-limit rules
//   { kind: "custom" }                           → handled by name in the exporter
// Toggles on a select target store true/false and write `on` / `off` (default 1 / -1).
//
// Facts behind the texts (OsmAnd GeneralRouter / BinaryRoutePlanner):
//   road speed = first matching speed rule (or defaultSpeed), clamped to [minSpeed, maxSpeed]
//   route choice uses road speed × priority
//   turns: sharpTurn > 120°, slightTurn 60–120°, half slightTurn 30–60°, roundabout half in + half out
//   penalty_transition: switching roads adds |a − b| / 2 seconds
//   obstacle < 0 = impassable; obstacle_time = arrival time estimate

const KMH = "km/h", SEC = "s", X = "×";

const sel = (parent, ...pairs) => ({ kind: "select", parent, pairs });
const SPEED = ["way", "speed"], PRIO = ["way", "priority"], TRANS = ["way", "penalty_transition"];
const OBST = ["point", "obstacle"], ETA = ["point", "obstacle_time"], ACCESS = ["way", "access"];

const slider = (id, label, unit, min, max, step, target, info, extra = {}) =>
  ({ id, label, unit, control: "slider", min, max, step, target, info, ...extra });

// ---- field builders with explanation texts ----
const roadSpeed = (id, label, noun, pairs, note = "") => slider("speed_" + id, label, KMH, 5, 150, 5, sel(SPEED, ...pairs),
  `Speed the route is planned with on ${noun} when OSM has no speed limit for it. Capped by your max cruising speed.${note}`);

const override = (id, label, noun, t, v) => slider("over_" + id, label, KMH, 0, 120, 5, { kind: "override", t, v },
  `If set, ${noun} are always planned at this speed, even when OSM has a speed limit for them. Off = use the speed limit. Still capped by your max cruising speed.`,
  { offAtZero: "Off" });

const prio = (id, label, noun, pairs, note = "") => slider("prio_" + id, label, X, 0.01, 2, 0.01, sel(PRIO, ...pairs),
  `How much the route planner likes ${noun}: it treats them as if they were this many times as fast. 1 = neutral, below 1 = avoided, above 1 = preferred.${note}`);

const trans = (id, label, noun, pairs) => slider("trans_" + id, label, SEC, 0, 300, 1, sel(TRANS, ...pairs),
  `Value for ${noun}. When the route switches between two roads, half the difference of their values is added in seconds. Bigger gaps make the planner stay on one kind of road.`);

const obstacle = (id, label, noun, pairs, note = "") => slider("obst_" + id, label, SEC, 0, 600, 1, sel(OBST, ...pairs),
  `Seconds added to the route for every ${noun} it passes. This only steers which route is chosen; the arrival time uses the "Arrival time" values.${note}`);

const eta = (id, label, noun, pairs) => slider("eta_" + id, label, SEC, 0, 300, 1, sel(ETA, ...pairs),
  `Seconds added to the arrival time for every ${noun} on the route. Doesn't change which route is chosen.`);

const allow = (id, label, noun, t, v, note = "") => ({
  id: "allow_" + id, label, control: "toggle", target: sel(ACCESS, [t, v]), on: "1", off: "-1",
  info: `Whether the route may use ${noun} at all.${note}`,
});

const ACCESS_LIMITED = [];
for (const t of ["motorcar", "motor_vehicle", "vehicle", "access"])
  for (const v of ["private", "destination", "delivery", "customers"]) ACCESS_LIMITED.push([t, v]);

export const SECTIONS = [
  {
    id: "speed", title: "Speed",
    groups: [
      {
        title: "Your vehicle",
        fields: [
          slider("maxSpeed", "Max cruising speed", KMH, 30, 150, 5, { kind: "attr", attr: "maxSpeed" },
            "The fastest you want to ride. No road is planned faster than this, even if its speed limit is higher.", { start: 90 }),
          slider("minSpeed", "Minimum speed", KMH, 1, 60, 1, { kind: "attr", attr: "minSpeed" },
            "The slowest speed any road is planned with. Slower roads are raised to this."),
          slider("defaultSpeed", "Fallback speed", KMH, 5, 150, 5, { kind: "attr", attr: "defaultSpeed" },
            "Speed for roads that match no speed rule at all, which is rare.", { start: 50 }),
        ],
      },
      {
        title: "Roads without a speed limit",
        info: "These speeds are used when a road has no speed limit in OSM. If it has one, the limit is used instead (unless you override it below).",
        fields: [
          roadSpeed("motorway", "Motorway", "motorways", [["highway", "motorway"]]),
          roadSpeed("motorway_link", "Motorway ramp", "motorway ramps", [["highway", "motorway_link"]], " Used for ramps even if they have a speed limit."),
          roadSpeed("trunk", "Trunk road", "trunk roads", [["highway", "trunk"]]),
          roadSpeed("trunk_link", "Trunk ramp", "trunk ramps", [["highway", "trunk_link"]], " Used for ramps even if they have a speed limit, except in towns (limit 50 or less)."),
          roadSpeed("primary", "Primary", "primary roads and their ramps", [["highway", "primary"], ["highway", "primary_link"]]),
          roadSpeed("secondary", "Secondary", "secondary roads and their ramps", [["highway", "secondary"], ["highway", "secondary_link"]]),
          roadSpeed("tertiary", "Tertiary", "tertiary roads and their ramps", [["highway", "tertiary"], ["highway", "tertiary_link"]]),
          roadSpeed("unclassified", "Unclassified", "minor connecting roads (also roads of unknown type)", [["highway", "unclassified"], ["highway", "road"]]),
          roadSpeed("residential", "Residential", "residential streets", [["highway", "residential"]]),
          roadSpeed("service", "Service road", "service roads (driveways, parking aisles, …)", [["highway", "service"]]),
          roadSpeed("living_street", "Living street", "living streets", [["highway", "living_street"]]),
          roadSpeed("track", "Track", "tracks (agricultural and forest roads)", [["highway", "track"]]),
          roadSpeed("ferry", "Ferry", "ferries", [["route", "ferry"]]),
          roadSpeed("shuttle_train", "Car train", "car shuttle trains", [["route", "shuttle_train"]]),
        ],
      },
      {
        title: "Override speed limits",
        info: "For roads where you're usually faster (or slower) than the tagged limit, e.g. gravel roads with a 30 limit. Off = OsmAnd uses the speed limit as usual.",
        fields: [
          override("track", "Track", "tracks", "highway", "track"),
          override("unclassified", "Unclassified", "minor connecting roads", "highway", "unclassified"),
          override("residential", "Residential", "residential streets", "highway", "residential"),
          override("service", "Service road", "service roads", "highway", "service"),
          override("unpaved", "Unpaved surface", "roads tagged surface=unpaved", "surface", "unpaved"),
          override("gravel", "Gravel surface", "roads tagged surface=gravel", "surface", "gravel"),
          override("fine_gravel", "Fine gravel surface", "roads tagged surface=fine_gravel", "surface", "fine_gravel"),
          override("compacted", "Compacted surface", "roads tagged surface=compacted", "surface", "compacted"),
          override("dirt", "Dirt surface", "roads tagged surface=dirt", "surface", "dirt"),
          override("ground", "Ground surface", "roads tagged surface=ground", "surface", "ground"),
        ],
      },
    ],
  },
  {
    id: "priority", title: "Road preference",
    groups: [
      {
        title: "Road types",
        fields: [
          prio("motorway", "Motorway", "motorways", [["highway", "motorway"]]),
          prio("motorway_link", "Motorway ramp", "motorway ramps", [["highway", "motorway_link"]]),
          prio("trunk", "Trunk road", "trunk roads", [["highway", "trunk"]]),
          prio("trunk_link", "Trunk ramp", "trunk ramps", [["highway", "trunk_link"]]),
          prio("primary", "Primary", "primary roads", [["highway", "primary"]]),
          prio("primary_link", "Primary ramp", "primary ramps", [["highway", "primary_link"]]),
          prio("secondary", "Secondary", "secondary roads", [["highway", "secondary"]]),
          prio("secondary_link", "Secondary ramp", "secondary ramps", [["highway", "secondary_link"]]),
          prio("tertiary", "Tertiary", "tertiary roads", [["highway", "tertiary"]]),
          prio("tertiary_link", "Tertiary ramp", "tertiary ramps", [["highway", "tertiary_link"]]),
          prio("unclassified", "Unclassified", "minor connecting roads (also roads of unknown type)", [["highway", "unclassified"], ["highway", "road"]]),
          prio("residential", "Residential", "residential streets", [["highway", "residential"]]),
          prio("service", "Service road", "service roads", [["highway", "service"]]),
          prio("living_street", "Living street", "living streets", [["highway", "living_street"]]),
          prio("track", "Track", "tracks", [["highway", "track"]]),
          prio("ferry", "Ferry", "ferries", [["route", "ferry"]]),
          prio("shuttle_train", "Car train", "car shuttle trains", [["route", "shuttle_train"]]),
          prio("other", "Everything else", "any road not listed here", [[null, null]]),
        ],
      },
      {
        title: "Surface and condition",
        info: "These come before the road types: a gravel primary road gets the gravel value, not the primary one.",
        fields: [
          prio("gravel", "Gravel", "roads tagged surface=gravel", [["surface", "gravel"]]),
          prio("unpaved", "Unpaved", "roads tagged surface=unpaved", [["surface", "unpaved"]]),
          prio("grade5", "Track grade 5", "the roughest tracks (tracktype=grade5, soft and unpaved)", [["tracktype", "grade5"]]),
          prio("smooth_bad", "Smoothness: bad", "roads tagged smoothness=bad (robust bikes only)", [["smoothness", "bad"]]),
          prio("smooth_very_bad", "Smoothness: very bad", "roads tagged smoothness=very_bad (high clearance)", [["smoothness", "very_bad"]]),
          prio("smooth_horrible", "Smoothness: horrible", "roads tagged smoothness=horrible (off-road)", [["smoothness", "horrible"]]),
          prio("smooth_very_horrible", "Smoothness: very horrible", "roads tagged smoothness=very_horrible", [["smoothness", "very_horrible"]]),
          prio("smooth_impassable", "Smoothness: impassable", "roads tagged smoothness=impassable", [["smoothness", "impassable"]]),
        ],
      },
      {
        title: "Access",
        fields: [
          prio("access_limited", "Private / destination only", "roads you may only use to reach a place on them (private, destination, delivery, customers)", ACCESS_LIMITED),
          prio("reversible", "Reversible one-way", "lanes whose direction changes during the day (oneway=reversible)", [["oneway", "reversible"]]),
        ],
      },
    ],
  },
  {
    id: "time", title: "Extra time for route choice",
    groups: [
      {
        title: "Turns",
        fields: [
          slider("slightTurn", "Turn (60–120°)", SEC, 0, 60, 1, { kind: "attr", attr: "slightTurn" },
            "Seconds added for a normal turn. Gentle bends of 30–60° get half of this.", { start: 8 }),
          slider("sharpTurn", "Sharp turn (over 120°)", SEC, 0, 120, 1, { kind: "attr", attr: "sharpTurn" },
            "Seconds added for very sharp turns and U-turns.", { start: 15 }),
          slider("roundaboutTurn", "Roundabout", SEC, 0, 60, 1, { kind: "attr", attr: "roundaboutTurn" },
            "Seconds added for a roundabout: half when entering, half when leaving.", { start: 5 }),
          slider("penaltyForReverseDirection", "Turning around at the start", SEC, 0, 900, 10, { kind: "attrChild", name: "penaltyForReverseDirection" },
            "Seconds added if the route starts in the opposite direction to the one you're facing, i.e. the time to find a place to turn."),
        ],
      },
      {
        title: "Stops and obstacles",
        info: "Seconds added when the route passes a point with this tag. Only steers route choice. 0 = ignore. Negative values aren't possible: OsmAnd treats them as impassable.",
        fields: [
          obstacle("traffic_signals", "Traffic light", "traffic light", [["highway", "traffic_signals"]]),
          obstacle("stop", "Stop sign", "stop sign", [["highway", "stop"]]),
          obstacle("give_way", "Give way", "give-way sign", [["highway", "give_way"]]),
          obstacle("traffic_calming", "Speed bump / calming", "traffic calming point (bumps, chicanes, …)", [["traffic_calming", null]]),
          obstacle("ford", "Ford", "ford", [["ford", null]]),
          obstacle("ferry_terminal", "Ferry terminal", "ferry terminal", [["amenity", "ferry_terminal"]]),
        ],
      },
      {
        title: "Barriers", collapsed: true,
        info: "Seconds added for passing a barrier. Barriers not listed here, or with access tags forbidding you, block the road.",
        fields: [
          obstacle("toll_booth", "Toll booth", "toll booth", [["barrier", "toll_booth"]]),
          obstacle("border_control", "Border control", "border control", [["barrier", "border_control"]]),
          obstacle("access_destination", "Barrier: destination only", "barrier marked for destination traffic only", [["motorcar", "destination"], ["motor_vehicle", "destination"], ["vehicle", "destination"], ["access", "destination"]]),
          obstacle("gate", "Gate", "gate without access tags", [["barrier", "gate"]]),
          obstacle("lift_gate", "Lift gate (barrier arm)", "lift gate without access tags", [["barrier", "lift_gate"]]),
          obstacle("swing_gate", "Swing gate", "swing gate without access tags", [["barrier", "swing_gate"]]),
          obstacle("sliding_gate", "Sliding gate", "sliding gate or sliding beam", [["barrier", "sliding_gate"], ["barrier", "sliding_beam"]]),
          obstacle("bump_gate", "Bump gate", "bump gate", [["barrier", "bump_gate"]]),
          obstacle("hampshire_gate", "Hampshire gate", "wire gate (hampshire gate)", [["barrier", "hampshire_gate"]]),
          obstacle("cattle_grid", "Cattle grid", "cattle grid", [["barrier", "cattle_grid"]]),
          obstacle("sally_port", "Sally port", "sally port (double gate)", [["barrier", "sally_port"]]),
          obstacle("entrance", "Entrance", "entrance barrier", [["barrier", "entrance"]]),
          obstacle("height_restrictor", "Height restrictor", "height restrictor", [["barrier", "height_restrictor"]]),
        ],
      },
      {
        title: "Changing road type", collapsed: true,
        info: "Each road type has a value. When the route switches between two roads, half the difference is added in seconds, e.g. primary (50) → tertiary (130) adds 40 s. This keeps routes on one kind of road.",
        fields: [
          trans("motorway", "Motorway", "motorways", [["highway", "motorway"]]),
          trans("motorway_link", "Motorway ramp", "motorway ramps", [["highway", "motorway_link"]]),
          trans("trunk", "Trunk road and ramp", "trunk roads and ramps", [["highway", "trunk"], ["highway", "trunk_link"]]),
          trans("primary", "Primary", "primary roads", [["highway", "primary"]]),
          trans("primary_link", "Primary ramp", "primary ramps", [["highway", "primary_link"]]),
          trans("secondary", "Secondary and ramp", "secondary roads and ramps", [["highway", "secondary"], ["highway", "secondary_link"]]),
          trans("tertiary", "Tertiary and ramp", "tertiary roads and ramps", [["highway", "tertiary"], ["highway", "tertiary_link"]]),
          trans("unclassified", "Unclassified", "minor connecting roads", [["highway", "unclassified"]]),
          trans("residential", "Residential", "residential streets", [["highway", "residential"]]),
          trans("service", "Service road", "service roads", [["highway", "service"]]),
          trans("other", "Everything else", "any road not listed here", [[null, null]]),
          trans("gravel", "Gravel surface", "roads tagged surface=gravel (comes before the road types)", [["surface", "gravel"]]),
          trans("side_road", "Side road", "side roads of a main road (side_road=*)", [["side_road", "yes"], ["side_road", "rotary"], ["side_road", "double"]]),
        ],
      },
    ],
  },
  {
    id: "eta", title: "Arrival time",
    groups: [
      {
        info: "OsmAnd estimates arrival times separately from route choice. These seconds are added to the arrival time for each point on the route.",
        fields: [
          eta("traffic_signals", "Traffic light", "traffic light", [["highway", "traffic_signals"]]),
          eta("stop", "Stop sign", "stop sign", [["highway", "stop"]]),
          eta("give_way", "Give way", "give-way sign", [["highway", "give_way"]]),
          eta("crossing", "Pedestrian crossing", "pedestrian crossing", [["highway", "crossing"]]),
          eta("crossing_uncontrolled", "Crossing: uncontrolled", "uncontrolled crossing", [["crossing", "uncontrolled"]]),
          eta("crossing_unmarked", "Crossing: unmarked", "unmarked crossing", [["crossing", "unmarked"]]),
          eta("railway_crossing", "Railway crossing", "railway crossing", [["railway", "crossing"], ["railway", "level_crossing"]]),
          eta("traffic_calming", "Speed bump / calming", "traffic calming point", [["traffic_calming", null]]),
          eta("ford", "Ford", "ford", [["ford", null]]),
          eta("toll_booth", "Toll booth", "toll booth", [["barrier", "toll_booth"]]),
          eta("gate", "Gate", "gate", [["barrier", "gate"]]),
          eta("lift_gate", "Lift gate", "lift gate", [["barrier", "lift_gate"]]),
          eta("swing_gate", "Swing gate", "swing gate", [["barrier", "swing_gate"]]),
          eta("entrance", "Entrance", "entrance barrier", [["barrier", "entrance"]]),
          eta("barrier_other", "Other barriers", "other barrier", [["barrier", null]]),
        ],
      },
    ],
  },
  {
    id: "allowed", title: "Allowed roads",
    groups: [
      {
        info: "Which road types the route may use at all. Check your local rules before allowing paths or cycleways.",
        fields: [
          allow("track", "Tracks", "tracks (agricultural and forest roads)", "highway", "track"),
          allow("service", "Service roads", "service roads (driveways, parking aisles, …)", "highway", "service"),
          allow("living_street", "Living streets", "living streets", "highway", "living_street"),
          allow("path", "Paths", "multi-use paths (highway=path)", "highway", "path", " Off in OsmAnd's car profile. They have no speed of their own, so the fallback speed is used."),
          allow("cycleway", "Cycleways", "cycleways", "highway", "cycleway", " Off in OsmAnd's car profile. They have no speed of their own, so the fallback speed is used."),
          allow("footway", "Footways", "footways", "highway", "footway", " Off in OsmAnd's car profile. They have no speed of their own, so the fallback speed is used."),
          allow("steps", "Steps", "steps", "highway", "steps", " Off in OsmAnd's car profile. They have no speed of their own, so the fallback speed is used."),
          allow("ferry", "Ferries", "ferries", "route", "ferry", " OsmAnd also has its own \"Avoid ferries\" switch."),
          allow("shuttle_train", "Car trains", "car shuttle trains", "route", "shuttle_train"),
        ],
      },
    ],
  },
  {
    id: "shortway", title: "Short way mode",
    groups: [
      {
        info: "Used instead of the turn values when OsmAnd's own \"Short way\" switch is on.",
        fields: [
          slider("shortWaySlightTurn", "Turn (60–120°)", SEC, 0, 60, 1, { kind: "attrChild", name: "shortWaySlightTurn" },
            "Seconds added for a normal turn in Short way mode. Gentle bends of 30–60° get half."),
          slider("shortWaySharpTurn", "Sharp turn (over 120°)", SEC, 0, 120, 1, { kind: "attrChild", name: "shortWaySharpTurn" },
            "Seconds added for very sharp turns and U-turns in Short way mode."),
          slider("shortWayRoundaboutTurn", "Roundabout", SEC, 0, 60, 1, { kind: "attrChild", name: "shortWayRoundaboutTurn" },
            "Seconds added for a roundabout in Short way mode: half when entering, half when leaving."),
        ],
      },
    ],
  },
  {
    id: "avoid", title: "Switches in the app",
    groups: [
      {
        info: "Each switch appears in OsmAnd under Route parameters → Avoid roads, next to OsmAnd's own (toll, unpaved, ferries, …). Turn them on per trip.",
        fields: [
          {
            id: "blockMotorroads", label: "Block motorways and motorroads", control: "toggle", start: true,
            target: { kind: "custom" },
            info: "Adds a switch to OsmAnd. When it's on, motorways, their ramps and roads tagged motorroad=yes (motorway rules without being a motorway) are never used.",
          },
        ],
      },
    ],
  },
];

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields));

export function autoName(values) {
  return `Moto ${values.maxSpeed}` + (values.blockMotorroads ? " no motorways" : "");
}

export function fileNameFor(name) {
  const base = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return (base || "routing_profile") + ".xml";
}
