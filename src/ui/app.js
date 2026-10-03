import { GameSession } from "../engine/session.js";
import { MapRenderer } from "./renderer.js";
import { icon } from "./icons.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const html = (id, value) => {
  const node = $(id);
  if (node.innerHTML !== value) node.innerHTML = value;
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const session = new GameSession(storage),
  renderer = new MapRenderer($("world"));
const ui = {
  branch: "economy",
  tool: "inspect",
  building: null,
  selected: null,
  hover: null,
  pointer: null,
  preview: null,
  dialog: null,
  toastUntil: 0,
};
let view = session.view(),
  lastFrame = performance.now(),
  nextUI = 0;

for (const [id, name, size] of [
  ["brand-icon", "ant", 31],
  ["rooms-icon", "rooms", 23],
  ["mouse-icon", "mouse", 21],
  ["sun-icon", "sun", 16],
  ["help-button", "help", 19],
  ["settings-button", "settings", 19],
  ["grid-button", "grid", 17],
  ["inspect-tool", "cursor", 17],
  ["dig-tool", "pick", 17],
  ["rally-tool", "flag", 17],
  ["queen-focus", "crown", 17],
  ["threat-focus", "shield", 17],
  ["journal-icon", "journal", 16],
])
  html(id, icon(name, size));
html("economy-tab", `${icon("rooms", 14)} Chambers`);
html("military-tab", `${icon("shield", 14)} Defenses`);
html(
  "improvements-button",
  `${icon("seed", 15)} Colony improvements ${icon("arrow", 13)}`,
);

function notify(message, error = false) {
  if (!message) return;
  $("toast").textContent = message;
  $("toast").classList.add("show");
  $("toast").style.background = error ? "#8f6047" : "#424b36";
  ui.toastUntil = performance.now() + 4500;
}
function command(c) {
  const result = session.command(c);
  if (result.message) notify(result.message, !result.ok);
  renderUI();
  return result;
}
function selectTool(tool, building = null) {
  ui.tool = tool;
  ui.building = building;
  ui.preview = null;
  $("world").style.cursor = tool === "inspect" ? "grab" : "crosshair";
  renderUI();
}
function resource(name, symbol, value, detail, percent = null) {
  return `<div class="resource"><span class="resource-icon">${icon(symbol, 19)}</span><div><div class="resource-name">${name}</div><div class="resource-value">${value}</div><div class="resource-detail">${detail}</div>${percent === null ? "" : `<div class="resource-bar"><span style="width:${percent}%"></span></div>`}</div></div>`;
}
function journalEntry(event, expanded = false) {
  return `<div class="journal-entry ${event.kind}"><time class="mono">${event.clock}</time><div><strong>${escape(event.title)}</strong>${expanded ? "<br>" : ""}${escape(event.text)}</div></div>`;
}

function renderUI() {
  view = session.view(ui.selected);
  $("colony-label").textContent = `COLONY ${view.generation}`;
  $("time-label").textContent = view.time;
  html(
    "speed-control",
    [1, 2, 4]
      .map(
        (n) =>
          `<button class="${view.speed === n ? "active" : ""}" data-action="speed" data-value="${n}" aria-label="${n} times speed" aria-pressed="${view.speed === n}">${n}×</button>`,
      )
      .join(""),
  );
  html("pause-button", icon(view.paused ? "play" : "pause", 20));
  $("pause-button").setAttribute(
    "aria-label",
    view.paused ? "Resume game" : "Pause game",
  );
  html(
    "resources",
    resource(
      "Food stores",
      "leaf",
      `${view.food}<small> / ${view.foodCap}</small>`,
      `~ ${view.income} from trips`,
      view.foodPercent,
    ) +
      resource(
        "Colony energy",
        "bolt",
        `${view.energy}<small> / ${view.energyCap}</small>`,
        `${view.recovery} recovery`,
        view.energyPercent,
      ) +
      resource(
        "Population",
        "ant",
        `${view.population}<small> ants</small>`,
        `${view.committed} committed to posts`,
      ) +
      resource(
        "Mobile warriors",
        "shield",
        `${view.mobile}<small> / ${view.mobileCap}</small>`,
        `${view.raid.highest} raids survived`,
      ) +
      resource(
        "Our queen",
        "crown",
        `${view.queenHealth}<small> / ${view.queenMax}</small>`,
        "The heart of the colony",
        view.queenPercent,
      ),
  );
  html(
    "building-list",
    view.catalog
      .filter((b) => b.branch === ui.branch)
      .map(
        (b) =>
          `<button class="building-card ${ui.building === b.type ? "selected" : ""} ${b.unique ? "unique" : ""}" data-action="build" data-value="${b.type}" ${b.disabled ? "disabled" : ""} title="${escape(b.description)}${!b.unlocked ? ". " + escape(b.lockedReason) : ""}" aria-label="${escape(b.name)}${b.disabled ? " — " + (b.unique ? "already founded" : "locked") : ""}"><span class="building-icon" style="--color:${b.color};--tint:${b.color}17">${icon(b.icon, 23)}</span><span><span class="building-name">${escape(b.name)}</span><span class="building-desc">${b.unique ? "A place for new beginnings" : b.unlocked ? (b.branch === "military" ? b.description.split(".")[0] : { storage: "A home for the harvest", brood: "The next generation starts here", waste: "A cleaner, happier colony", prey: "A little extra on the menu", quarters: "Rest. Recover. Get back to it." }[b.type] || b.description) : escape(b.lockedReason)}</span><span class="building-cost">${b.unique ? `${icon("check", 10)} The heart of your colony` : b.unlocked ? escape(b.label) : `${icon("lock", 9)} Not yet unlocked`}</span></span><span class="building-arrow">${b.disabled ? "" : "+"}</span><span class="building-footprint">${b.footprintLabel}</span></button>`,
      )
      .join(""),
  );
  for (const branch of ["economy", "military"]) {
    const tab = $(`${branch}-tab`);
    tab.classList.toggle("active", ui.branch === branch);
    tab.setAttribute("aria-selected", ui.branch === branch);
  }
  $("map-status").textContent = view.status;
  html(
    "objective",
    `<span class="objective-icon">${icon(view.objective.icon, 19)}</span><div><h3>${escape(view.objective.title)}</h3><p>${escape(view.objective.text)}</p>${view.objective.progress !== undefined ? `<div class="mini-progress"><span style="width:${view.objective.progress * 100}%"></span></div>` : ""}</div>`,
  );
  $("objective").hidden = !!ui.building || view.gameStatus === "defeat";
  const alert = view.alerts[0];
  $("map-message").className =
    "map-message" + (alert ? ` visible ${alert.kind}` : "");
  html(
    "map-message",
    alert ? `${icon(alert.icon, 13)} &nbsp; ${escape(alert.text)}` : "",
  );
  $("paused-banner").hidden =
    !view.paused ||
    !view.started ||
    !!ui.dialog ||
    view.gameStatus === "defeat";
  for (const tool of ["inspect", "dig", "rally"])
    $(`${tool}-tool`).classList.toggle("active", ui.tool === tool);
  $("grid-button").classList.toggle("active", renderer.grid);
  html(
    "journal-latest",
    view.events
      .slice(0, 2)
      .map((e) => journalEntry(e))
      .join(""),
  );
  $("raid-card").className = `raid-card ${view.raid.urgency}`;
  html(
    "raid-card",
    `<div class="raid-top"><span>${icon("shield", 13)} &nbsp; ${view.raid.urgency === "peace" ? "ON THE HORIZON" : "PROTECT THE COLONY"}</span><span>${view.raid.urgency === "peace" ? "PREPARE" : "ALERT"}</span></div><h3>${escape(view.raid.title)}</h3><div class="raid-bottom"><span class="raid-detail">${escape(view.raid.detail)}</span><span class="raid-clock">${view.raid.timer}</span></div>`,
  );
  $("worker-total").textContent = `${view.population} ants`;
  html(
    "crews",
    view.crews
      .map(
        (c) =>
          `<div class="crew-row"><span class="crew-icon">${icon(c.icon, 20)}</span><div><div class="crew-name">${c.name}${c.pending ? ` <small>+${c.pending} returning</small>` : ""}</div><div class="crew-detail">${escape(c.detail)}</div></div><div class="crew-stepper"><button data-action="assign" data-value="${c.key}" data-delta="-1" aria-label="Remove one from ${c.name}" ${!c.canDecrease ? "disabled" : ""}>−</button><strong>${c.count}</strong><button data-action="assign" data-value="${c.key}" data-delta="1" aria-label="Add one to ${c.name}" ${!c.canIncrease ? "disabled" : ""}>+</button></div></div>`,
      )
      .join(""),
  );
  if (document.activeElement !== $("new-crew"))
    $("new-crew").value = view.newCrew;
  $("eggs-button").textContent = view.eggsPaused ? "Resume eggs" : "Pause eggs";
  html(
    "brood",
    `<div class="brood-slots">${view.brood
      .slice(0, 12)
      .map(
        (e) =>
          `<span class="brood-egg" style="--progress:${e.percent}%" title="${e.percent}% developed · ${e.remaining} remaining">${icon("egg", 16)}</span>`,
      )
      .join(
        "",
      )}${Array.from({ length: Math.min(8, Math.max(0, view.slots - view.brood.length)) }, () => `<span class="brood-egg empty" title="Empty brood slot">${icon("egg", 15)}</span>`).join("")}${!view.slots ? '<span class="brood-caption">The queen is preparing her chamber.</span>' : ""}</div><div class="brood-caption">${view.brood.length} / ${view.slots} eggs developing${view.eggsPaused ? " · new eggs paused" : ""}<br>Growing at ${view.efficiency} efficiency · ${view.waste} waste</div>`,
  );
  const b = view.selection;
  html(
    "selection",
    b
      ? `<div class="selection-heading"><h3>${icon(b.icon, 16)} &nbsp; ${escape(b.name)}</h3><button class="icon-button" data-action="deselect" aria-label="Close structure details">${icon("close", 14)}</button></div><p class="selection-detail">${escape(b.description)}</p><div class="selection-stats">${escape(b.condition)}${b.complete ? ` · Level ${b.level}` : ""}${b.staff.length ? `<br>${b.staff.length} committed warriors` : ""}</div><div class="mini-progress"><span style="width:${b.complete ? (b.hp / b.maxHp) * 100 : b.progress * 100}%"></span></div>${b.complete ? `<button class="secondary-button" data-action="upgrade" data-value="${b.id}" ${b.upgradeWaiting ? "disabled" : ""}>${icon("bolt", 13)} ${escape(b.upgradeLabel)}</button><button class="text-button" style="margin-top:9px" data-action="repair" data-value="${b.id}">${b.repair ? "✓ Auto repair enabled" : "Enable dig crew repairs"}</button>${b.type === "queen" ? `<button class="secondary-button" data-action="relocate" ${!b.canRelocate ? "disabled" : ""}>${icon("flag", 13)} Relocate queen</button>` : ""}` : `<button class="secondary-button" data-action="cancel" data-value="${b.id}">Cancel blueprint · refund resources</button>`}`
      : "",
  );
  html(
    "shelter-button",
    `${icon("shield", 16)} ${view.shelter ? "Release emergency shelter" : view.shelterActive ? "Raid shelter active" : "Call workers to shelter"}`,
  );
  $("shelter-button").classList.toggle("active", view.shelterActive);
  $("auto-shelter").checked = view.autoShelter;
  html("save-note", `${icon("check", 11)} ${escape(view.saveStatus)}`);
  if (view.gameStatus === "defeat" && ui.dialog !== "defeat")
    openDialog("defeat");
  else if (!view.started && !ui.dialog) openDialog("welcome");
  // Paint state changes even when an embedded host delays animation frames.
  // This does not advance simulation time.
  renderer.resize();
  renderer.draw(session.world(), session.alpha(), {
    preview: ui.preview,
    selected: ui.selected,
    hover: ui.hover,
    tool: ui.tool,
  });
}

function header(eyebrow, title, close = true) {
  return `<div class="dialog-header"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${close ? `<button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon("close")}</button>` : ""}</div>`;
}
function dialogContent(type) {
  if (type === "welcome")
    return `<div class="dialog-inner welcome"><div class="welcome-art"><span class="welcome-ant">${icon("ant", 57)}</span></div><span class="eyebrow" style="display:block;text-align:center;margin-bottom:9px">LIFE, ON A SMALLER SCALE</span><h2>A world beneath your feet.</h2><p class="dialog-copy">One queen. A little earth. Endless possibilities.<br>Build a thriving colony, and give it something to fight for.</p><div class="welcome-steps"><div class="welcome-step">${icon("pick", 25)}<strong>Dig a little deeper</strong>Right-click to carve tunnels. Place rooms to grow.</div><div class="welcome-step">${icon("leaf", 25)}<strong>Find your balance</strong>Every worker can gather, dig, or defend.</div><div class="welcome-step">${icon("shield", 25)}<strong>Protect your queen</strong>Survive raids. Carry your legacy into the next colony.</div></div><button class="primary-button full" data-action="begin">Begin your colony ${icon("arrow", 17)}</button><p class="welcome-note">Autosaves on this device. Time stops when you leave.</p><button class="text-button" data-action="import" style="display:block;margin:14px auto 0">Or import an existing colony</button></div>`;
  if (type === "help")
    return `<div class="dialog-inner">${header("A FIELD GUIDE TO THE UNDERGROUND", "Small ants. Big plans.")}<div class="help-list"><p><strong>1. Establish the nest</strong>The queen digs her chamber and hatches one free worker. New workers gather food by making real trips outside. Your first few workers take time; use 2× or 4× speed.</p><p><strong>2. Excavate and build</strong><kbd>RIGHT CLICK</kbd> dirt to add or cancel a dig order. Drag to mark several tiles. Assign at least one worker to Dig. Blueprints queue their own footprint, but you must connect a tunnel. Click a room to upgrade or cancel it.</p><p><strong>3. Grow the economy</strong>Complete Queen → Food Storage → Brood → Waste → Prey → Worker Quarters. The brood toggle pauses new eggs. Full storage holds returning cargo; spend food or add storage.</p><p><strong>4. Prepare for real combat</strong>Military construction unlocks after Food Storage. Barracks add mobile capacity. Staffed posts commit warriors permanently. Traps and barricades need food and energy. Set a rally point; the hive keeps a queen reserve.</p><p><strong>5. Live to begin again</strong>The first raid arrives at 3:45, with a 50-second warning. Workers shelter automatically. Dig crews repair between attacks. When the queen dies, completed raids and peak population earn legacy seeds. Buy permanent improvements and begin again.</p><p><strong>Controls</strong><kbd>SPACE</kbd> pause · <kbd>D</kbd> dig · <kbd>R</kbd> rally · <kbd>Q</kbd> queen · <kbd>T</kbd> threat · <kbd>G</kbd> grid · <kbd>ESC</kbd> inspect. Drag or use arrow keys to pan. Scroll or use + / − to zoom. On touch screens, select the Dig tool, then tap.</p><p><strong>Safe returns</strong>Saves contain the full colony. Closing or hiding the game stops time. Importing a save pauses it. There is no offline progress.</p></div></div>`;
  if (type === "settings")
    return `<div class="dialog-inner">${header("KEEP YOUR LITTLE WORLD SAFE", "Save & settings")}<p class="dialog-copy">Your colony saves automatically on this device. Export a copy to keep a backup or continue on another device.</p><div class="settings-actions"><button class="secondary-button" data-action="save">${icon("check", 18)} Save now</button><button class="secondary-button" data-action="export">${icon("download", 18)} Export colony</button><button class="secondary-button" data-action="import">${icon("upload", 18)} Import colony</button></div><p class="settings-info">${escape(view.saveStatus)}<br>Import replaces the current colony after the file is validated. Export first if you want to keep both.<br>No offline progress. No account. No external services.<br>Version 0.1.0</p></div>`;
  if (type === "journal")
    return `<div class="dialog-inner">${header("THE STORY SO FAR", "Colony journal")}${view.events.map((e) => journalEntry(e, true)).join("")}</div>`;
  if (type === "research")
    return `<div class="dialog-inner">${header("A LITTLE BETTER, EVERY DAY", "Colony improvements")}<p class="dialog-copy">These improvements help your current colony. They reset when a new colony begins.</p>${view.research.map((r) => `<div class="upgrade-row"><span class="upgrade-icon">${icon(r.key === "carry" ? "leaf" : r.key === "speed" ? "flag" : "shield", 23)}</span><div class="upgrade-info"><h3>${r.name}</h3><p>${r.description}</p><small>Level ${r.level}</small></div><button class="secondary-button" data-action="buyResearch" data-value="${r.key}" ${r.disabled ? "disabled" : ""}>${r.cost} food</button></div>`).join("")}</div>`;
  if (type === "defeat")
    return `<div class="dialog-inner">${header("AN ENDING. A NEW BEGINNING.", "The colony lives on in you.", false)}<p class="dialog-copy">Your queen held her ground. The colony is gone, but what you built becomes the seed of something stronger.</p><div class="result-stats"><div><strong>${view.result.highestRaid}</strong><span>RAIDS SURVIVED</span></div><div><strong>${view.result.peak}</strong><span>PEAK POPULATION</span></div><div><strong>${view.result.duration}</strong><span>TIME TOGETHER</span></div></div><p class="fatal-cause">Fatal breach: ${escape(view.result.cause)} · +${view.result.earned} legacy seeds</p><div class="legacy-balance"><span>Permanent improvements</span><strong>${icon("seed", 17)} ${view.legacy.currency} seeds</strong></div>${view.legacy.upgrades.map((u) => `<div class="upgrade-row"><span class="upgrade-icon">${icon(u.icon, 22)}</span><div class="upgrade-info"><h3>${u.name}</h3><p>${u.description}</p><small>Level ${u.level}</small></div><button class="secondary-button" data-action="prestige" data-value="${u.key}" ${u.disabled ? "disabled" : ""}>${u.cost} ${icon("seed", 13)}</button></div>`).join("")}<button class="primary-button full" data-action="newRun" style="margin-top:24px">Begin the next colony ${icon("arrow", 17)}</button><p class="welcome-note">Best: raid ${view.legacy.bestRaid} · ${view.legacy.bestPopulation} ants · ${view.legacy.bestTime}</p><button class="text-button" data-action="export" style="display:block;margin:12px auto 0">Export this legacy</button></div>`;
  return "";
}
function openDialog(type) {
  ui.dialog = type;
  if (type !== "welcome" && type !== "defeat") session.openPanel();
  html("dialog-content", dialogContent(type));
  if (!$("dialog").open) $("dialog").showModal();
}
function closeDialog() {
  if (["welcome", "defeat"].includes(ui.dialog)) return;
  ui.dialog = null;
  $("dialog").close();
  session.closePanel();
  renderUI();
}
function refreshDialog() {
  view = session.view(ui.selected);
  if (ui.dialog) html("dialog-content", dialogContent(ui.dialog));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const { action, value } = button.dataset;
  switch (action) {
    case "branch":
      ui.branch = value;
      renderUI();
      break;
    case "build":
      selectTool("build", value);
      notify(
        "Click the map to place the blueprint. Right-click still designates tunnels. Escape cancels placement.",
      );
      break;
    case "tool":
      selectTool(value);
      break;
    case "grid":
      renderer.grid = !renderer.grid;
      renderUI();
      break;
    case "pause":
      command({ type: "pause" });
      break;
    case "speed":
      command({ type: "speed", value: Number(value) });
      break;
    case "assign":
      command({
        type: "assign",
        crew: value,
        delta: Number(button.dataset.delta),
      });
      break;
    case "eggs":
      command({ type: "eggs" });
      break;
    case "shelter":
      command({ type: "shelter" });
      break;
    case "upgrade":
      command({ type: "upgrade", id: value });
      break;
    case "repair":
      command({ type: "repair", id: value });
      break;
    case "cancel":
      if (command({ type: "cancel", id: value }).ok) {
        ui.selected = null;
        renderUI();
      }
      break;
    case "relocate":
      selectTool("relocate", "queen");
      notify(
        "Choose a prepared, connected 3 × 2 space. The queen will walk there.",
      );
      break;
    case "deselect":
      ui.selected = null;
      renderUI();
      break;
    case "focus":
      renderer.focus(session.focus(value));
      break;
    case "zoom":
      $("zoom-label").textContent = renderer.zoom(Number(value)) + "%";
      break;
    case "help":
    case "settings":
    case "journal":
    case "research":
      openDialog(action);
      break;
    case "close-dialog":
      closeDialog();
      break;
    case "begin":
      ui.dialog = null;
      $("dialog").close();
      command({ type: "start" });
      session.save();
      break;
    case "save":
      notify(
        session.save()
          ? "Your colony is saved on this device."
          : "Autosave is unavailable. Export your colony.",
      );
      refreshDialog();
      break;
    case "export": {
      const blob = new Blob([session.export()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ant-colony-${view.generation}-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Colony exported.");
      break;
    }
    case "import":
      $("import-file").click();
      break;
    case "buyResearch":
      command({ type: "research", key: value });
      refreshDialog();
      break;
    case "prestige":
      command({ type: "prestige", branch: value });
      refreshDialog();
      break;
    case "newRun":
      session.command({ type: "newRun" });
      ui.dialog = null;
      $("dialog").close();
      ui.selected = null;
      ui.branch = "economy";
      session.panelOpen = false;
      selectTool("inspect");
      renderer.focus({ x: 0, y: 4 });
      break;
  }
});
$("dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
$("new-crew").addEventListener("change", (event) =>
  command({ type: "newCrew", crew: event.target.value }),
);
$("auto-shelter").addEventListener("change", (event) =>
  command({ type: "autoShelter", value: event.target.checked }),
);
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30_000_000)
      throw new Error("Save files must be smaller than 30 MB.");
    const result = session.import(await file.text());
    notify(result.message);
    ui.selected = null;
    ui.dialog = null;
    $("dialog").close();
    session.panelOpen = false;
    renderer.focus(session.focus("queen"));
    renderUI();
  } catch (error) {
    notify(error.message, true);
  }
  event.target.value = "";
});

const canvas = $("world");
function pointer(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function mapAction(p, right = false, dragging = false) {
  const tile = renderer.tileAt(p.x, p.y);
  ui.hover = tile;
  if (right || ui.tool === "dig") {
    command({ type: "dig", ...tile, mode: dragging ? "add" : "toggle" });
    return;
  }
  if (ui.tool === "build") {
    const result = command({ type: "build", building: ui.building, ...tile });
    if (result.ok) {
      ui.selected = session.inspect(tile.x, tile.y).buildingId || null;
      renderUI();
    }
  } else if (ui.tool === "relocate") {
    if (command({ type: "relocate", ...tile }).ok) selectTool("inspect");
  } else if (ui.tool === "rally") {
    if (command({ type: "rally", ...tile }).ok) selectTool("inspect");
  } else {
    ui.selected = session.inspect(tile.x, tile.y).buildingId || null;
    renderUI();
  }
}
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if (event.button > 2) return;
  canvas.focus({ preventScroll: true });
  const p = pointer(event);
  canvas.setPointerCapture(event.pointerId);
  ui.pointer = {
    id: event.pointerId,
    start: p,
    last: p,
    right: event.button === 2,
    pan: event.button === 1 || (event.button === 0 && ui.tool === "inspect"),
    moved: false,
    lastTile: null,
  };
  if (event.button === 2) {
    mapAction(p, true);
    const tile = renderer.tileAt(p.x, p.y);
    ui.pointer.lastTile = `${tile.x},${tile.y}`;
  }
});
canvas.addEventListener("pointermove", (event) => {
  const p = pointer(event),
    tile = renderer.tileAt(p.x, p.y);
  ui.hover = tile;
  $("coordinate-label").textContent = `${tile.x}, ${tile.y}`;
  if (ui.pointer) {
    const drag = ui.pointer;
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 5)
      drag.moved = true;
    if (drag.pan && drag.moved)
      renderer.pan(p.x - drag.last.x, p.y - drag.last.y);
    else if (
      (drag.right || ui.tool === "dig") &&
      drag.moved &&
      drag.lastTile !== `${tile.x},${tile.y}`
    ) {
      mapAction(p, drag.right, true);
      drag.lastTile = `${tile.x},${tile.y}`;
    }
    drag.last = p;
  }
  updateTooltip(p);
});
canvas.addEventListener("pointerup", (event) => {
  if (!ui.pointer) return;
  const drag = ui.pointer;
  if (!drag.right && !drag.moved && event.button !== 1)
    mapAction(pointer(event));
  ui.pointer = null;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("pointercancel", () => {
  ui.pointer = null;
});
canvas.addEventListener("pointerleave", () => {
  if (!ui.pointer) {
    ui.hover = null;
    ui.preview = null;
    $("map-tooltip").style.display = "none";
  }
});
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    $("zoom-label").textContent =
      renderer.zoom(-Math.sign(event.deltaY), pointer(event)) + "%";
    updateTooltip(pointer(event));
  },
  { passive: false },
);

function updateTooltip(p) {
  if (!ui.hover || (ui.pointer?.pan && ui.pointer.moved)) {
    $("map-tooltip").style.display = "none";
    return;
  }
  const { x, y } = ui.hover;
  let title, detail;
  if (ui.building) {
    ui.preview = session.preview(ui.building, x, y, ui.tool === "relocate");
    const definition = view.catalog.find((b) => b.type === ui.building);
    title = definition.name;
    detail = `${ui.preview.food} food${ui.preview.staff ? ` · ${ui.preview.staff} warriors` : ""}${ui.preview.energy ? ` · ${ui.preview.energy} energy` : ""}<br>${escape(ui.preview.valid ? ui.preview.connection : ui.preview.reason)}`;
  } else {
    ui.preview = null;
    const info = session.inspect(x, y);
    title = info.title;
    detail = escape(info.detail);
  }
  html(
    "map-tooltip",
    `<strong>${escape(title)}</strong><span>${detail}</span>`,
  );
  const tooltip = $("map-tooltip");
  tooltip.style.display = "block";
  tooltip.style.left =
    Math.max(8, Math.min(renderer.width - 240, p.x + 18)) + "px";
  tooltip.style.top =
    Math.max(50, Math.min(renderer.height - 90, p.y + 18)) + "px";
}
document.addEventListener("keydown", (event) => {
  if (
    ui.dialog ||
    event.target.matches("input,select,textarea") ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    command({ type: "pause" });
  } else if (key === "escape") {
    ui.selected = null;
    selectTool("inspect");
  } else if (key === "d") selectTool("dig");
  else if (key === "r") selectTool("rally");
  else if (key === "q") renderer.focus(session.focus("queen"));
  else if (key === "t") renderer.focus(session.focus("threat"));
  else if (key === "g") {
    renderer.grid = !renderer.grid;
    renderUI();
  } else if (["1", "2", "4"].includes(key))
    command({ type: "speed", value: Number(key) });
  else if (["+", "=", "-"].includes(key))
    $("zoom-label").textContent = renderer.zoom(key === "-" ? -1 : 1) + "%";
  else if (key.startsWith("arrow")) {
    event.preventDefault();
    renderer.pan(
      key === "arrowleft" ? 55 : key === "arrowright" ? -55 : 0,
      key === "arrowup" ? 55 : key === "arrowdown" ? -55 : 0,
    );
  }
});
document.addEventListener("visibilitychange", () => {
  session.suspend(document.hidden);
  lastFrame = performance.now();
});
window.addEventListener("pagehide", () => session.save());
window.addEventListener("beforeunload", () => session.save());

function frame(now) {
  session.advance((now - lastFrame) / 1000);
  lastFrame = now;
  if (now >= nextUI) {
    renderUI();
    nextUI = now + 200;
  }
  if (ui.building && ui.hover)
    ui.preview = session.preview(
      ui.building,
      ui.hover.x,
      ui.hover.y,
      ui.tool === "relocate",
    );
  renderer.draw(session.world(), session.alpha(), {
    preview: ui.preview,
    selected: ui.selected,
    hover: ui.hover,
    tool: ui.tool,
  });
  if (now > ui.toastUntil) $("toast").classList.remove("show");
  requestAnimationFrame(frame);
}
renderUI();
requestAnimationFrame(frame);
