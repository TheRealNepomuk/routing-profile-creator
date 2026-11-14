// Settings model — vehicle-neutral description of what the user wants.
// Exporters (js/exporters/*) turn this into a file for a specific app.

/**
 * @typedef {Object} Settings
 * @property {string}  name              Profile name shown in the app
 * @property {"motorcycle"|"car"} vehicle Which vehicle-specific rules to apply
 * @property {number}  maxSpeed          km/h, max cruising speed: routes assume you never go faster
 * @property {number}  defaultSpeed      km/h, used on roads without a known speed
 * @property {{sharp:number, slight:number, roundabout:number}} turns  extra seconds planned per turn
 * @property {number}  trafficLightCost  extra seconds planned per traffic light (routing only, not ETA)
 * @property {{enabled:boolean}} blockMotorroads  adds an in-app switch
 */

// OsmAnd car profile values, shown as "OsmAnd default" in the UI.
export const OSMAND_DEFAULTS = {
  maxSpeed: 130, defaultSpeed: 45,
  turns: { sharp: 30, slight: 15, roundabout: 15 },
  trafficLightCost: 15,
};

// Starting values of the page (small motorcycle, the author's tested profile).
export const START = {
  vehicle: "motorcycle",
  maxSpeed: 90,
  defaultSpeed: 50,
  turns: { sharp: 15, slight: 8, roundabout: 5 },
  trafficLightCost: 15,
  blockMotorroads: { enabled: true },
};

// The turn slider sets the sharp-turn time; slight turns and roundabouts follow it.
export function turnsFromSharp(sharp) {
  return { sharp, slight: Math.round(sharp / 2), roundabout: Math.round(sharp / 3) };
}

export function autoName(s) {
  const prefix = s.vehicle === "motorcycle" ? "Moto" : "Car";
  return `${prefix} ${s.maxSpeed}` + (s.blockMotorroads.enabled ? " no motorways" : "");
}

export function fileNameFor(name) {
  const base = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return (base || "routing_profile") + ".xml";
}
