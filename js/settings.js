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

// ---- field builders with explanation texts ----
// Speed sliders can carry an "Ignore speed limits" box: a toggle field rendered inside the slider's row.
const limitBox = (id) => ({ id: "over_" + id, of: "speed_" + id, label: "Ignore speed limits", control: "toggle", target: { kind: "override" } });
const IGNORE_INFO = "Tick \"Ignore speed limits\" to use this speed even where OSM has a speed limit, e.g. for gravel roads with a 100 limit that you'd ride at 40.\n\n"
  + "Careful: it then applies to every road of this type, including stretches through towns with a 30 or 50 limit, so routes through towns look faster than they are. Your max cruising speed still caps it.";

const roadSpeed = (id, label, desc, pairs, { note = "", box = true } = {}) => slider("speed_" + id, label, KMH, 5, 150, 5, sel(SPEED, ...pairs),
  `${desc}\n\nSpeed used on these roads where OSM has no speed limit for them. Where it has one, OsmAnd uses the limit.${note}` + (box ? "\n\n" + IGNORE_INFO : ""),
  box ? { limitBox: limitBox(id) } : {});

const surfaceSpeed = (id, label, desc, v) => slider("speed_" + id, label, KMH, 0, 120, 5, { kind: "surfaceSpeed", t: "surface", v },
  `${desc}\n\nYour speed for this surface where OSM has no speed limit. Off = the road type's speed is used.\n\n${IGNORE_INFO}`,
  { offAtZero: "Off", limitBox: limitBox(id) });

const prio = (id, label, desc, pairs) => slider("prio_" + id, label, X, 0.01, 2, 0.01, sel(PRIO, ...pairs),
  `${desc}\n\nHow much the route planner likes these roads: it treats them as if they were this many times as fast. 1 = neutral, below 1 = avoided, above 1 = preferred. Doesn't change the arrival time.`);

const trans = (id, label, desc, pairs) => slider("trans_" + id, label, SEC, 0, 300, 1, sel(TRANS, ...pairs),
  `${desc}\n\nValue for this road type. Switching to or from a road with a different value adds half the difference in seconds.`);

const obstacle = (id, label, desc, pairs, note = "") => slider("obst_" + id, label, SEC, 0, 600, 1, sel(OBST, ...pairs),
  `${desc}\n\nSeconds added for each one the route passes.${note}`);

const allow = (id, label, desc, t, v, note = "") => ({
  id: "allow_" + id, label, control: "toggle", target: sel(ACCESS, [t, v]), on: "1", off: "-1",
  info: `${desc}\n\nWhether the route may use these roads at all.${note}`,
});

const ACCESS_LIMITED = [];
for (const t of ["motorcar", "motor_vehicle", "vehicle", "access"])
  for (const v of ["private", "destination", "delivery", "customers"]) ACCESS_LIMITED.push([t, v]);

const NO_OWN_SPEED = " Off in OsmAnd's car profile. They have no speed of their own, so the fallback speed is used.";

export const SECTIONS = [
  {
    id: "speed", title: "Speed",
    groups: [
      {
        title: "Your vehicle",
        fields: [
          slider("maxSpeed", "Max cruising speed", KMH, 30, 150, 5, { kind: "attr", attr: "maxSpeed" },
            "Even if a road allows a higher speed, the route is calculated with this speed at most. Arrival times use it too.", { start: 90 }),
          slider("minSpeed", "Minimum speed", KMH, 1, 60, 1, { kind: "attr", attr: "minSpeed" },
            "Every road is calculated with at least this speed. A road that would be slower, e.g. a living street at walking pace, counts as this fast.\n\nIt doesn't avoid slow roads, it makes them look faster than they are. A lower value makes slow roads count as slow. To avoid roads, use Road preference."),
        ],
      },
      {
        title: "Speed per road type",
        info: "Where OSM has a speed limit for a road, OsmAnd calculates with the limit. Where it has none, it uses the speed you set here for the road type. In many areas that's most minor roads.\n\nWith \"Ignore speed limits\" ticked, your speed is used on that road type everywhere. Your max cruising speed caps all of them.",
        fields: [
          roadSpeed("motorway", "Motorway", ROAD.motorway, [["highway", "motorway"]]),
          roadSpeed("motorway_link", "Motorway ramp", ROAD.motorway_link, [["highway", "motorway_link"]], { box: false, note: " Exception: OsmAnd always uses this speed on motorway ramps, even if they have a speed limit." }),
          roadSpeed("trunk", "Trunk road", ROAD.trunk, [["highway", "trunk"]]),
          roadSpeed("trunk_link", "Trunk ramp", ROAD.trunk_link, [["highway", "trunk_link"]], { box: false, note: " Exception: OsmAnd uses this speed on trunk ramps even if they have a speed limit, except in towns (limit 50 or less)." }),
          roadSpeed("primary", "Primary and ramp", withRamp("primary"), [["highway", "primary"], ["highway", "primary_link"]]),
          roadSpeed("secondary", "Secondary and ramp", withRamp("secondary"), [["highway", "secondary"], ["highway", "secondary_link"]]),
          roadSpeed("tertiary", "Tertiary and ramp", withRamp("tertiary"), [["highway", "tertiary"], ["highway", "tertiary_link"]]),
          roadSpeed("unclassified", "Unclassified", ROAD.unclassified + ROAD.unclassified_road, [["highway", "unclassified"], ["highway", "road"]]),
          roadSpeed("residential", "Residential", ROAD.residential, [["highway", "residential"]]),
          roadSpeed("service", "Service road", ROAD.service, [["highway", "service"]]),
          roadSpeed("living_street", "Living street", ROAD.living_street, [["highway", "living_street"]]),
          roadSpeed("track", "Track", ROAD.track, [["highway", "track"]]),
          roadSpeed("ferry", "Ferry", ROAD.ferry, [["route", "ferry"]], { box: false }),
          roadSpeed("shuttle_train", "Car train", ROAD.shuttle_train, [["route", "shuttle_train"]], { box: false }),
          slider("defaultSpeed", "Fallback speed", KMH, 5, 150, 5, { kind: "attr", attr: "defaultSpeed" },
            "For roads that match none of the types above and have no speed limit, e.g. paths or cycleways if you allow them. Roads of unknown type (highway=road) use the Unclassified value instead.", { start: 50 }),
        ],
      },
      {
        title: "Speed per surface", collapsed: true,
        info: "OsmAnd's car profile has no speeds for surfaces, so these are off by default. A surface speed comes before the road type: a gravel tertiary road uses the gravel speed.",
        fields: [
          surfaceSpeed("unpaved", "Unpaved", SURFACE.unpaved, "unpaved"),
          surfaceSpeed("gravel", "Gravel", SURFACE.gravel, "gravel"),
          surfaceSpeed("fine_gravel", "Fine gravel", SURFACE.fine_gravel, "fine_gravel"),
          surfaceSpeed("compacted", "Compacted", SURFACE.compacted, "compacted"),
          surfaceSpeed("dirt", "Dirt", SURFACE.dirt, "dirt"),
          surfaceSpeed("ground", "Ground", SURFACE.ground, "ground"),
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
          prio("motorway", "Motorway", ROAD.motorway, [["highway", "motorway"]]),
          prio("motorway_link", "Motorway ramp", ROAD.motorway_link, [["highway", "motorway_link"]]),
          prio("trunk", "Trunk road", ROAD.trunk, [["highway", "trunk"]]),
          prio("trunk_link", "Trunk ramp", ROAD.trunk_link, [["highway", "trunk_link"]]),
          prio("primary", "Primary", ROAD.primary, [["highway", "primary"]]),
          prio("primary_link", "Primary ramp", ramp("primary"), [["highway", "primary_link"]]),
          prio("secondary", "Secondary", ROAD.secondary, [["highway", "secondary"]]),
          prio("secondary_link", "Secondary ramp", ramp("secondary"), [["highway", "secondary_link"]]),
          prio("tertiary", "Tertiary", ROAD.tertiary, [["highway", "tertiary"]]),
          prio("tertiary_link", "Tertiary ramp", ramp("tertiary"), [["highway", "tertiary_link"]]),
          prio("unclassified", "Unclassified", ROAD.unclassified + ROAD.unclassified_road, [["highway", "unclassified"], ["highway", "road"]]),
          prio("residential", "Residential", ROAD.residential, [["highway", "residential"]]),
          prio("service", "Service road", ROAD.service, [["highway", "service"]]),
          prio("living_street", "Living street", ROAD.living_street, [["highway", "living_street"]]),
          prio("track", "Track", ROAD.track, [["highway", "track"]]),
          prio("ferry", "Ferry", ROAD.ferry, [["route", "ferry"]]),
          prio("shuttle_train", "Car train", ROAD.shuttle_train, [["route", "shuttle_train"]]),
          prio("other", "Everything else", ROAD.other, [[null, null]]),
        ],
      },
      {
        title: "Surface and condition",
        info: "These come before the road types: a gravel primary road gets the gravel value, not the primary one.",
        fields: [
          prio("gravel", "Gravel", SURFACE.gravel, [["surface", "gravel"]]),
          prio("unpaved", "Unpaved", SURFACE.unpaved, [["surface", "unpaved"]]),
          prio("grade5", "Track grade 5", "The roughest tracks (tracktype=grade5): soft, unpaved, often just grass or earth.", [["tracktype", "grade5"]]),
          prio("smooth_bad", "Smoothness: bad", "Roads tagged smoothness=bad: rough, but fine for robust bikes and cars.", [["smoothness", "bad"]]),
          prio("smooth_very_bad", "Smoothness: very bad", "Roads tagged smoothness=very_bad: needs high clearance.", [["smoothness", "very_bad"]]),
          prio("smooth_horrible", "Smoothness: horrible", "Roads tagged smoothness=horrible: off-road vehicles only.", [["smoothness", "horrible"]]),
          prio("smooth_very_horrible", "Smoothness: very horrible", "Roads tagged smoothness=very_horrible: specialised off-road vehicles only.", [["smoothness", "very_horrible"]]),
          prio("smooth_impassable", "Smoothness: impassable", "Roads tagged smoothness=impassable: no wheeled vehicle gets through.", [["smoothness", "impassable"]]),
        ],
      },
      {
        title: "Access",
        fields: [
          prio("access_limited", "Private / destination only", "Roads you may only use to reach a place on them (private, destination, delivery, customers).", ACCESS_LIMITED),
          prio("reversible", "Reversible one-way", "Lanes whose direction changes during the day (oneway=reversible).", [["oneway", "reversible"]]),
        ],
      },
    ],
  },
  {
    id: "time", title: "Extra time for route choice",
    intro: "These seconds only steer which route OsmAnd picks: a route with more of them looks slower to the planner. They don't change the arrival time OsmAnd shows.",
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
        info: "Seconds added when the route passes a point with this tag. 0 = ignore. Negative values aren't possible: OsmAnd treats them as impassable.",
        fields: [
          obstacle("traffic_signals", "Traffic light", "Traffic lights.", [["highway", "traffic_signals"]]),
          obstacle("stop", "Stop sign", "Stop signs.", [["highway", "stop"]]),
          obstacle("give_way", "Give way", "Give-way (yield) signs.", [["highway", "give_way"]]),
          obstacle("traffic_calming", "Speed bump / calming", "Speed bumps, humps, cushions, chicanes and similar spots built to slow traffic down.", [["traffic_calming", null]]),
          obstacle("ford", "Ford", "A ford: a place where the road goes through a stream or river instead of over a bridge.", [["ford", null]],
            " OsmAnd's own \"Avoid ice roads, fords\" switch can block them completely."),
          obstacle("ferry_terminal", "Ferry terminal", "Ferry terminals, where you board or leave a ferry. Stands in for waiting and loading.", [["amenity", "ferry_terminal"]]),
        ],
      },
      {
        title: "Barriers", collapsed: true,
        info: "Seconds added for passing a barrier. Barriers not listed here, or with access tags forbidding you, block the road.",
        fields: [
          obstacle("toll_booth", "Toll booth", "Toll booths, where you stop to pay.", [["barrier", "toll_booth"]]),
          obstacle("border_control", "Border control", "Border checkpoints.", [["barrier", "border_control"]],
            " OsmAnd's own \"Avoid border crossing\" switch avoids borders altogether."),
          obstacle("access_destination", "Barrier: destination only", "Barriers marked as open only for traffic going to a place behind them.", [["motorcar", "destination"], ["motor_vehicle", "destination"], ["vehicle", "destination"], ["access", "destination"]]),
          obstacle("gate", "Gate", "Gates without access tags. They may be closed.", [["barrier", "gate"]]),
          obstacle("lift_gate", "Lift gate (barrier arm)", "Barrier arms that lift up, e.g. at car parks or company entrances, without access tags.", [["barrier", "lift_gate"]]),
          obstacle("swing_gate", "Swing gate", "A bar that swings sideways to open, without access tags.", [["barrier", "swing_gate"]]),
          obstacle("sliding_gate", "Sliding gate", "Gates or beams that slide sideways to open.", [["barrier", "sliding_gate"], ["barrier", "sliding_beam"]]),
          obstacle("bump_gate", "Bump gate", "A gate you push open slowly with the front of your vehicle, mostly on farms.", [["barrier", "bump_gate"]]),
          obstacle("hampshire_gate", "Hampshire gate", "A section of wire fence that's unhooked and pulled aside by hand, mostly on farms.", [["barrier", "hampshire_gate"]]),
          obstacle("cattle_grid", "Cattle grid", "Bars across the road over a pit: animals won't cross it, vehicles drive over it. Slippery on two wheels when wet.", [["barrier", "cattle_grid"]]),
          obstacle("sally_port", "Sally port", "Two gates in a row with a space in between, e.g. at secured sites.", [["barrier", "sally_port"]]),
          obstacle("entrance", "Entrance", "An opening in a wall or fence, without a gate.", [["barrier", "entrance"]]),
          obstacle("height_restrictor", "Height restrictor", "A bar over the road that limits vehicle height. Not an issue on a motorcycle.", [["barrier", "height_restrictor"]]),
        ],
      },
      {
        title: "Switching road type", collapsed: true,
        info: "Keeps the route from hopping between kinds of road, e.g. leaving a main road for a few hundred metres of side street and then getting back on.\n\nEach road type has a value. When the route changes to a road with a different value, half the difference is added. Primary (50) → tertiary (130) adds 40 s, and getting back onto the primary adds another 40 s. Roads with the same value, e.g. two primary roads, cost nothing.",
        fields: [
          trans("motorway", "Motorway", ROAD.motorway, [["highway", "motorway"]]),
          trans("motorway_link", "Motorway ramp", ROAD.motorway_link, [["highway", "motorway_link"]]),
          trans("trunk", "Trunk road and ramp", withRamp("trunk"), [["highway", "trunk"], ["highway", "trunk_link"]]),
          trans("primary", "Primary", ROAD.primary, [["highway", "primary"]]),
          trans("primary_link", "Primary ramp", ramp("primary"), [["highway", "primary_link"]]),
          trans("secondary", "Secondary and ramp", withRamp("secondary"), [["highway", "secondary"], ["highway", "secondary_link"]]),
          trans("tertiary", "Tertiary and ramp", withRamp("tertiary"), [["highway", "tertiary"], ["highway", "tertiary_link"]]),
          trans("unclassified", "Unclassified", ROAD.unclassified, [["highway", "unclassified"]]),
          trans("residential", "Residential", ROAD.residential, [["highway", "residential"]]),
          trans("service", "Service road", ROAD.service, [["highway", "service"]]),
          trans("other", "Everything else", ROAD.other, [[null, null]]),
          trans("gravel", "Gravel surface", SURFACE.gravel + " Comes before the road types.", [["surface", "gravel"]]),
          trans("side_road", "Side road", "Side roads that run alongside a main road (side_road=*).", [["side_road", "yes"], ["side_road", "rotary"], ["side_road", "double"]]),
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
          allow("track", "Tracks", ROAD.track, "highway", "track"),
          allow("service", "Service roads", ROAD.service, "highway", "service"),
          allow("living_street", "Living streets", ROAD.living_street, "highway", "living_street"),
          allow("path", "Paths", "Multi-use paths (highway=path).", "highway", "path", NO_OWN_SPEED),
          allow("cycleway", "Cycleways", "Paths meant for bicycles.", "highway", "cycleway", NO_OWN_SPEED),
          allow("footway", "Footways", "Paths meant for pedestrians.", "highway", "footway", NO_OWN_SPEED),
          allow("steps", "Steps", "Stairs.", "highway", "steps", NO_OWN_SPEED),
          allow("ferry", "Ferries", ROAD.ferry, "route", "ferry", " OsmAnd also has its own \"Avoid ferries\" switch."),
          allow("shuttle_train", "Car trains", ROAD.shuttle_train, "route", "shuttle_train"),
        ],
      },
    ],
  },
  {
    id: "shortway", title: "Fuel-efficient mode",
    intro: "OsmAnd has a \"Fuel-efficient way\" switch under Route parameters. It plans shorter routes by counting every road as at most 55 km/h, and uses these turn values instead of the ones in Extra time.",
    groups: [
      {
        fields: [
          slider("shortWaySlightTurn", "Turn (60–120°)", SEC, 0, 60, 1, { kind: "attrChild", name: "shortWaySlightTurn" },
            "Seconds added for a normal turn in fuel-efficient mode. Gentle bends of 30–60° get half."),
          slider("shortWaySharpTurn", "Sharp turn (over 120°)", SEC, 0, 120, 1, { kind: "attrChild", name: "shortWaySharpTurn" },
            "Seconds added for very sharp turns and U-turns in fuel-efficient mode."),
          slider("shortWayRoundaboutTurn", "Roundabout", SEC, 0, 60, 1, { kind: "attrChild", name: "shortWayRoundaboutTurn" },
            "Seconds added for a roundabout in fuel-efficient mode: half when entering, half when leaving."),
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

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields.flatMap((f) => (f.limitBox ? [f, f.limitBox] : [f]))));

export function autoName(values) {
  return `Moto ${values.maxSpeed}` + (values.blockMotorroads ? " no motorways" : "");
}

export function fileNameFor(name) {
  const base = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return (base || "routing_profile") + ".xml";
}
