// Settings model and presets — vehicle-neutral description of what the user wants.
// Exporters (js/exporters/*) turn this into a file for a specific app.

/**
 * @typedef {Object} Settings
 * @property {string}  name              Profile name shown in the app
 * @property {"motorcycle"|"car"} vehicle Which vehicle-specific rules to apply
 * @property {number}  maxSpeed          km/h, routes assume you never go faster
 * @property {number}  defaultSpeed      km/h, used on roads without a known speed
 * @property {{sharp:number, slight:number, roundabout:number}} turns  seconds per turn type
 * @property {{enabled:boolean, penalty:number}} avoidTrafficLights   adds an in-app switch; penalty in seconds
 * @property {{enabled:boolean}} blockMotorroads                      adds an in-app switch
 */

// Turn slider 0..100 → seconds. 0 = curvy is fine, 50 = motorcycle, 100 = car default.
export const TURN_STOPS = [
  { at: 0,   sharp: 8,  slight: 4,  roundabout: 3,  hint: "Bends barely matter. Twisty roads are welcome." },
  { at: 50,  sharp: 15, slight: 8,  roundabout: 5,  hint: "Bends cost a little time. Good for most bikes." },
  { at: 100, sharp: 30, slight: 15, roundabout: 15, hint: "Straighter roads win when times are close, like a car." },
];

export function turnsFromSlider(t) {
  const [a, b] = t <= 50 ? [TURN_STOPS[0], TURN_STOPS[1]] : [TURN_STOPS[1], TURN_STOPS[2]];
  const k = (t - a.at) / (b.at - a.at);
  const lerp = (x, y) => Math.round(x + (y - x) * k);
  return { sharp: lerp(a.sharp, b.sharp), slight: lerp(a.slight, b.slight), roundabout: lerp(a.roundabout, b.roundabout) };
}

export function turnHint(t) {
  return TURN_STOPS.reduce((p, c) => (Math.abs(c.at - t) < Math.abs(p.at - t) ? c : p)).hint;
}

// A preset is just data. `turnSlider` drives the turn penalties.
export const PRESETS = {
  small: {
    label: "Small motorcycle",
    vehicle: "motorcycle", maxSpeed: 90, defaultSpeed: 50, turnSlider: 50,
    avoidTrafficLights: { enabled: true, penalty: 60 }, blockMotorroads: { enabled: true },
  },
  light: {
    label: "125 cc",
    vehicle: "motorcycle", maxSpeed: 80, defaultSpeed: 45, turnSlider: 40,
    avoidTrafficLights: { enabled: true, penalty: 60 }, blockMotorroads: { enabled: true },
  },
  touring: {
    label: "Touring",
    vehicle: "motorcycle", maxSpeed: 120, defaultSpeed: 55, turnSlider: 60,
    avoidTrafficLights: { enabled: false, penalty: 30 }, blockMotorroads: { enabled: false },
  },
};

export function autoName(s) {
  const prefix = s.vehicle === "motorcycle" ? "Moto" : "Car";
  return `${prefix} ${s.maxSpeed}` + (s.blockMotorroads.enabled ? " no motorways" : "");
}

export function fileNameFor(name) {
  const base = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return (base || "routing_profile") + ".xml";
}
