// Routing Profile Creator — mockup logic
// The XML produced here is a MINIMAL TEST PROFILE for checking share/import only.
// The real exporter will start from the full upstream car profile (see PLAN.md).

(() => {
  const $ = (id) => document.getElementById(id);

  const PRESETS = {
    small:   { maxSpeed: 90,  turns: 50, lights: true,  motorroads: true,  defaultSpeed: 50, lightPenalty: 60 },
    light:   { maxSpeed: 80,  turns: 40, lights: true,  motorroads: true,  defaultSpeed: 45, lightPenalty: 60 },
    touring: { maxSpeed: 120, turns: 60, lights: false, motorroads: false, defaultSpeed: 55, lightPenalty: 30 },
  };

  // Turn slider 0..100 → penalties in seconds. 0 = curvy is fine, 50 = motorcycle, 100 = car default.
  const TURN_STOPS = [
    { at: 0,   sharp: 8,  slight: 4,  round: 3,  hint: "Bends barely matter. Twisty roads are welcome." },
    { at: 50,  sharp: 15, slight: 8,  round: 5,  hint: "Bends cost a little time. Good for most bikes." },
    { at: 100, sharp: 30, slight: 15, round: 15, hint: "Straighter roads win when times are close, like a car." },
  ];

  const el = {
    maxSpeed: $("maxSpeed"), speedValue: $("speedValue"), turns: $("turns"), turnsHint: $("turnsHint"),
    lights: $("optLights"), motorroads: $("optMotorroads"), name: $("profileName"),
    defaultSpeed: $("defaultSpeed"), lightPenalty: $("lightPenalty"),
    sharp: $("sharpTurn"), slight: $("slightTurn"), round: $("roundaboutTurn"),
    share: $("shareBtn"), download: $("downloadBtn"),
    sheet: $("sheet"), scrim: $("scrim"), sheetBody: $("sheetBody"), sheetClose: $("sheetClose"),
  };

  let nameEdited = false;

  // ---------- UI sync ----------
  function setFill(range) {
    const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
    range.style.setProperty("--fill", pct + "%");
  }

  function turnPenalties(t) {
    const [a, b] = t <= 50 ? [TURN_STOPS[0], TURN_STOPS[1]] : [TURN_STOPS[1], TURN_STOPS[2]];
    const k = (t - a.at) / (b.at - a.at);
    const lerp = (x, y) => Math.round(x + (y - x) * k);
    const nearest = TURN_STOPS.reduce((p, c) => (Math.abs(c.at - t) < Math.abs(p.at - t) ? c : p));
    return { sharp: lerp(a.sharp, b.sharp), slight: lerp(a.slight, b.slight), round: lerp(a.round, b.round), hint: nearest.hint };
  }

  function autoName() {
    let n = "Moto " + el.maxSpeed.value;
    if (el.motorroads.checked) n += " no motorways";
    return n;
  }

  function sync() {
    el.speedValue.textContent = el.maxSpeed.value;
    setFill(el.maxSpeed);
    setFill(el.turns);
    if (!nameEdited) el.name.value = autoName();
  }

  function onTurns() {
    const p = turnPenalties(+el.turns.value);
    el.sharp.value = p.sharp; el.slight.value = p.slight; el.round.value = p.round;
    el.turnsHint.textContent = p.hint;
    sync();
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.preset === key)));
    el.maxSpeed.value = p.maxSpeed;
    el.turns.value = p.turns;
    el.lights.checked = p.lights;
    el.motorroads.checked = p.motorroads;
    el.defaultSpeed.value = p.defaultSpeed;
    el.lightPenalty.value = p.lightPenalty;
    onTurns();
  }

  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => applyPreset(c.dataset.preset)));
  el.maxSpeed.addEventListener("input", sync);
  el.turns.addEventListener("input", onTurns);
  el.lights.addEventListener("change", sync);
  el.motorroads.addEventListener("change", sync);
  el.name.addEventListener("input", () => { nameEdited = el.name.value.trim() !== ""; });

  // ---------- XML (mockup: minimal test profile) ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const num = (input, fallback) => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : fallback; };

  function profileName() { return (el.name.value.trim() || autoName()); }

  function buildXml() {
    const name = "TEST " + profileName();
    const params = [];
    const access = [];
    const obstacle = [];
    if (el.motorroads.checked) {
      params.push('\t\t<parameter id="avoid_motorroads" name="Block motorways and motorroads" description="Never use motorways or roads with motorway rules" type="boolean"/>');
      access.push('\t\t\t<if param="avoid_motorroads">\n\t\t\t\t<select value="-1" t="highway" v="motorway"/>\n\t\t\t\t<select value="-1" t="highway" v="motorway_link"/>\n\t\t\t\t<select value="-1" t="motorroad" v="yes"/>\n\t\t\t</if>');
    }
    if (el.lights.checked) {
      params.push('\t\t<parameter id="avoid_traffic_signals" name="Avoid traffic lights" description="Strongly prefer routes with fewer traffic lights" type="boolean"/>');
      obstacle.push(`\t\t\t<if param="avoid_traffic_signals">\n\t\t\t\t<select value="${num(el.lightPenalty, 60)}" t="highway" v="traffic_signals"/>\n\t\t\t</if>`);
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<!--
  MOCKUP TEST FILE from Routing Profile Creator (${new Date().toISOString().slice(0, 10)})
  Minimal profile for testing share/import only. Do NOT navigate with it:
  it lacks the full car rule set and will route badly.
-->
<osmand_routing_config>
\t<routingProfile name="${esc(name)}" baseProfile="car" restrictionsAware="true" minSpeed="20.0" defaultSpeed="${num(el.defaultSpeed, 50)}.0" maxSpeed="${el.maxSpeed.value}.0" sharpTurn="${num(el.sharp, 15)}" slightTurn="${num(el.slight, 8)}" roundaboutTurn="${num(el.round, 5)}" onewayAware="true">
${params.join("\n")}
\t\t<way attribute="access">
${access.join("\n")}
\t\t\t<select value="-1" t="motorcycle" v="no"/>
\t\t\t<select value="1" t="highway" v="motorway"/>
\t\t\t<select value="1" t="highway" v="trunk"/>
\t\t\t<select value="1" t="highway" v="primary"/>
\t\t\t<select value="1" t="highway" v="secondary"/>
\t\t\t<select value="1" t="highway" v="tertiary"/>
\t\t\t<select value="1" t="highway" v="unclassified"/>
\t\t\t<select value="1" t="highway" v="residential"/>
\t\t\t<select value="-1"/>
\t\t</way>
\t\t<point attribute="obstacle">
${obstacle.join("\n")}
\t\t</point>
\t</routingProfile>
</osmand_routing_config>
`;
  }

  function fileName() {
    const base = profileName().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "profile";
    return "TEST_" + base + ".xml";
  }

  function makeFile() {
    return new File([buildXml()], fileName(), { type: "application/xml" });
  }

  // ---------- platform ----------
  function platform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  const INSTRUCTIONS = {
    ios: (name, via) => `
      <p class="lead">${via === "share" ? "You picked OsmAnd in the share sheet." : "The file is in Files → Downloads."}</p>
      <p class="note"><b>OsmAnd doesn't confirm the import.</b> No message is normal, the profile was still added.</p>
      <ol class="steps">
        ${via === "share" ? "" : "<li>Open the file in <b>Files</b>, tap <b>Share</b> and choose <b>OsmAnd</b>.</li>"}
        <li>In OsmAnd open <b>Menu → Settings</b> and pick your profile, e.g. <b>Motorcycle</b>.</li>
        <li>Go to <b>Navigation settings → Navigation type</b> and choose <b>${esc(name)}</b>.</li>
        <li>Not in the list? Fully close OsmAnd (swipe it away) and open it again.</li>
        <li>The switches are under <b>Route parameters → Avoid roads…</b></li>
      </ol>`,
    android: (name, via) => `
      <p class="lead">${via === "share" ? "You picked OsmAnd in the share sheet." : "The file is in your Downloads."}</p>
      <ol class="steps">
        ${via === "share" ? "" : "<li>Tap the download notification, or open the file from Downloads, and choose <b>OsmAnd</b>.</li>"}
        <li>In OsmAnd open <b>Menu → Settings</b> and pick your profile, e.g. <b>Motorcycle</b>.</li>
        <li>Go to <b>Navigation settings → Navigation type</b> and choose <b>${esc(name)}</b>.</li>
        <li>The switches are under <b>Route parameters</b>.</li>
      </ol>`,
    desktop: (name) => `
      <p class="lead">The file is in your downloads folder. OsmAnd needs it on your phone.</p>
      <ol class="steps">
        <li>Send the file to your phone, e.g. by AirDrop, LocalSend or email.</li>
        <li>On the phone, open the file and share it to <b>OsmAnd</b>.</li>
        <li>In OsmAnd go to <b>Settings → your profile → Navigation settings → Navigation type</b> and choose <b>${esc(name)}</b>.</li>
      </ol>`,
  };

  // ---------- sheet ----------
  let lastFocus = null;
  function openSheet(via) {
    el.sheetBody.innerHTML = INSTRUCTIONS[platform()]("TEST " + profileName(), via);
    lastFocus = document.activeElement;
    el.scrim.hidden = false;
    el.sheet.hidden = false;
    el.sheetClose.focus();
  }
  function closeSheet() {
    el.sheet.hidden = true;
    el.scrim.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  el.sheetClose.addEventListener("click", closeSheet);
  el.scrim.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.sheet.hidden) closeSheet(); });

  // ---------- share / download ----------
  function download() {
    const file = makeFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    openSheet("download");
  }

  async function share() {
    const file = makeFile();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        openSheet("share");
      } catch (err) {
        if (err.name !== "AbortError") download();   // user cancelled → do nothing
      }
    } else {
      download();
    }
  }

  el.share.addEventListener("click", share);
  el.download.addEventListener("click", download);

  // initial state
  onTurns();
})();
