import {
  BUILDINGS,
  ECONOMIC,
  ENEMIES,
  PERMANENT,
  RESEARCH,
  center,
  formatTime,
  footprint,
  key,
} from "./catalog.js";
import { isOpen, buildingAt } from "./world.js";
import { lineageView } from "./lineages.js";

// All player-facing calculations and availability decisions live in the engine.
// Rendering code receives values and labels; it never resolves a game rule.
export function getView(engine, selectedId = null) {
  const s = engine.state,
    st = engine.getStats(),
    r = s.raid;
  const waitingCargo = s.ants.filter((a) => a.phase === "cargo").length;
  const military = s.unlocked.includes("brood");
  const selected = s.buildings.find((b) => b.id === selectedId);
  const status =
    s.status === "founding"
      ? "Founding the colony"
      : s.status === "defeat"
        ? "The queen has fallen"
        : engine.sheltered()
          ? "Workers in shelter"
          : "The colony is growing";
  let objective;
  if (s.status === "founding")
    objective = {
      title: "Every colony starts with a queen.",
      text: "Watch her dig the first chamber. Her first egg is free.",
      progress: s.world.revision / 8,
      icon: "crown",
    };
  else if (s.births === 0)
    objective = {
      title: "A new generation is on its way.",
      text: "Your first worker will hatch soon, then start gathering food.",
      progress: s.eggs[0]?.progress || 0,
      icon: "egg",
    };
  else if (
    st.counts.dig === 0 &&
    !s.buildings.some((b) => b.type === "storage" && b.complete)
  )
    objective = {
      title: "Give your colony room to grow.",
      text: "Assign a worker to Dig. Place Food Storage beside the queen’s chamber.",
      icon: "pick",
    };
  else if (!military)
    objective = {
      title: "Make room for the harvest.",
      text: "Complete Food Storage to unlock brood chambers and the military branch.",
      icon: "leaf",
    };
  else if (st.counts.warrior === 0 && r.highest === 0)
    objective = {
      title: "A little strength goes a long way.",
      text: "Assign warriors and build defenses before the first raid.",
      icon: "shield",
    };
  else {
    const next = ECONOMIC.find((t) => !s.unlocked.includes(t));
    objective = next
      ? {
          title: "Build the next chapter.",
          text: `Complete ${BUILDINGS[ECONOMIC[ECONOMIC.indexOf(next) - 1]].name} to unlock ${BUILDINGS[next].name}.`,
          icon: "rooms",
        }
      : {
          title: "Deeper roots. Stronger defenses.",
          text: "Expand, improve your rooms, and prepare for the next raid.",
          icon: "rooms",
        };
  }
  let raidTitle,
    raidDetail,
    raidTimer,
    urgency = "peace";
  if (r.phase === "peace") {
    raidTitle = r.number ? "A quiet interval" : "The first raid is coming";
    raidDetail = `Raid ${r.number + 1} · warning ${r.warning}s before arrival`;
    raidTimer = formatTime(r.nextAt - s.time);
  } else if (r.phase === "warning") {
    urgency = "warning";
    raidTitle = `Raid ${r.plan.number} · ${r.plan.direction} approach`;
    raidDetail = r.plan.threat;
    raidTimer = formatTime(r.nextAt - s.time);
  } else if (r.phase === "intermission") {
    urgency = "warning";
    raidTitle = `Raid ${r.number} · wave ${r.wave} cleared`;
    raidDetail = `Next wave in ${formatTime(r.waveAt - s.time)}`;
    raidTimer = formatTime(r.waveAt - s.time);
  } else {
    urgency = "danger";
    raidTitle = `Raid ${r.number} · wave ${r.wave}/${r.plan.waves.length}`;
    raidDetail = `${s.enemies.length + r.pending.length} attackers remain · ${r.plan.direction}`;
    raidTimer = "DEFEND";
  }
  const catalog = Object.entries(BUILDINGS).map(([type, d]) => {
    const unlocked = engine.unlocked(type),
      unique = type === "queen" && s.buildings.some((b) => b.type === "queen");
    const food = type === "queen" && s.status !== "founding" ? 24 : d.food;
    return {
      ...d,
      food,
      type,
      unlocked,
      unique,
      label: food
        ? `${food} food${d.staff ? ` · ${d.staff} warriors` : d.energy ? ` · ${d.energy} energy` : ""}`
        : "Founding chamber",
      footprintLabel: `${d.w} × ${d.h}`,
      disabled: !unlocked || unique,
      lockedReason:
        d.branch === "military"
          ? "Complete Food Storage"
          : type === "queen"
            ? ""
            : `Complete ${BUILDINGS[ECONOMIC[ECONOMIC.indexOf(type) - 1]].name}`,
    };
  });
  const crews = [
    {
      key: "food",
      name: "Food crew",
      icon: "leaf",
      count: st.counts.food,
      detail: waitingCargo
        ? `${waitingCargo} waiting to unload · storage full`
        : engine.sheltered()
          ? "Returning to shelter"
          : `${s.ants.filter((a) => a.crew === "food" && ["outbound", "inbound", "forage"].includes(a.phase)).length} on foraging trips`,
    },
    {
      key: "dig",
      name: "Dig crew",
      icon: "pick",
      count: st.counts.dig,
      detail: engine.sheltered()
        ? "Sheltering from the raid"
        : !s.jobs.length
          ? "No excavation queued · repairs enabled"
          : s.energy < 0.1
            ? "Waiting for shared energy"
            : `${s.jobs.filter((j) => j.owner).length} digging · ${s.jobs.length} tiles queued`,
    },
    {
      key: "warrior",
      name: "Warriors",
      icon: "swords",
      count: st.counts.warrior,
      detail: `${st.mobileCap} mobile capacity · ${st.committed} committed`,
    },
  ].map((c) => ({
    ...c,
    pending: st.pending[c.key],
    canDecrease: c.count > 0,
    canIncrease:
      s.ants.some((a) => !a.staffOf && !a.pendingCrew && a.crew !== c.key) &&
      (c.key !== "warrior" ||
        st.counts.warrior + st.pending.warrior < st.mobileCap),
  }));
  const selection = selected
    ? {
        ...selected,
        ...BUILDINGS[selected.type],
        id: selected.id,
        hp: selected.hp,
        maxHp: selected.maxHp,
        level: selected.level,
        missingStaff: Math.max(
          0,
          BUILDINGS[selected.type].staff - selected.staff.length,
        ),
        condition:
          !selected.complete &&
          selected.staff.length < BUILDINGS[selected.type].staff
            ? `Needs ${BUILDINGS[selected.type].staff - selected.staff.length} replacement warriors`
            : selected.complete
              ? `${Math.ceil(selected.hp)} / ${Math.ceil(selected.maxHp)} health`
              : footprint(selected.type, selected.x, selected.y).some(
                    (p) => !isOpen(s.world, p.x, p.y),
                  )
                ? "Waiting for excavation"
                : selected.staff.some((id) => {
                      const a = s.ants.find((a) => a.id === id);
                      return (
                        a &&
                        Math.hypot(a.x - selected.x, a.y - selected.y) > 0.8
                      );
                    })
                  ? "Staff are on their way"
                  : "Needs tunnel connection",
        cost: engine.upgradeCost(selected),
        canRelocate:
          selected.type === "queen" &&
          selected.complete &&
          r.phase === "peace" &&
          !s.queen.relocation,
        eggs: s.eggs.filter((e) => e.buildingId === selected.id).length,
        progress:
          footprint(selected.type, selected.x, selected.y).filter((p) =>
            isOpen(s.world, p.x, p.y),
          ).length /
          (BUILDINGS[selected.type].w * BUILDINGS[selected.type].h),
        upgradeWaiting:
          selected.upgrading && engine.upgradeCost(selected).staff === 0,
        upgradeLabel: selected.upgrading
          ? engine.upgradeCost(selected).staff
            ? `Replace ${engine.upgradeCost(selected).staff} lost staff`
            : "Upgrade queued"
          : `Upgrade · ${engine.upgradeCost(selected).food} food${engine.upgradeCost(selected).staff ? ` + ${engine.upgradeCost(selected).staff} warriors` : ""}${engine.upgradeCost(selected).energy ? ` + ${engine.upgradeCost(selected).energy} energy` : ""}`,
      }
    : null;
  const alerts = [];
  if (s.status === "active" && !s.buildings.some((b) => b.type === "queen"))
    alerts.push({
      icon: "crown",
      text: `Queen’s Chamber lost. Rebuild at (${s.queen.home.x}, ${s.queen.home.y}) to restore its brood slots.`,
      kind: "danger",
    });
  if (waitingCargo || s.food >= st.foodCap - 0.01)
    alerts.push({
      icon: "leaf",
      text: "Storage full. Add storage or spend food.",
      kind: "warning",
    });
  if (s.refundFood > 0)
    alerts.push({
      icon: "leaf",
      text: `${Math.ceil(s.refundFood)} refunded food is reserved until storage has space.`,
      kind: "info",
    });
  if (s.jobs.length && !st.counts.dig && s.status !== "founding")
    alerts.push({
      icon: "pick",
      text: "Assign a digger to work on queued tiles.",
      kind: "warning",
    });
  else if (
    s.jobs.length &&
    !s.jobs.some((j) => j.owner) &&
    st.counts.dig &&
    !engine.sheltered()
  )
    alerts.push({
      icon: "pick",
      text: "No reachable digging jobs. Connect a tunnel.",
      kind: "warning",
    });
  if (s.energy < 1 && s.jobs.length)
    alerts.push({
      icon: "bolt",
      text: "Low energy. Digging waits for recovery.",
      kind: "warning",
    });
  if (st.efficiency < 0.85)
    alerts.push({
      icon: "recycle",
      text: "Waste is slowing production. Add a Waste Chamber.",
      kind: "warning",
    });
  if (s.enemies.some((e) => e.y > 0))
    alerts.push({
      icon: "shield",
      text: "The nest has been breached. Protect the queen.",
      kind: "danger",
    });
  if (s.ants.length && !st.counts.food && s.food < st.eggCost)
    alerts.push({
      icon: "leaf",
      text: "Assign a food worker to restart food collection.",
      kind: "danger",
    });
  const brood = s.eggs.map((e) => ({
    ...e,
    percent: Math.floor(e.progress * 100),
    remaining: formatTime(((1 - e.progress) * st.eggDuration) / st.efficiency),
  }));
  return {
    time: formatTime(s.time),
    lineage: lineageView(s),
    debug: engine.debugView(),
    rawTime: s.time,
    generation: String(s.lineage.generation + 1).padStart(2, "0"),
    status,
    gameStatus: s.status,
    paused: s.paused,
    started: s.started,
    speed: s.speed,
    food: Math.floor(s.food),
    foodCap: Math.floor(st.foodCap),
    foodPercent: (s.food / st.foodCap) * 100,
    income: `${st.income.toFixed(1)}/min`,
    energy: Math.floor(s.energy),
    energyCap: Math.floor(st.energyCap),
    energyPercent: (s.energy / st.energyCap) * 100,
    recovery: `+${st.recovery.toFixed(2)}/s`,
    population: st.population,
    mobile: st.counts.warrior,
    mobileCap: st.mobileCap,
    committed: st.committed,
    queenHealth: Math.ceil(s.queen.hp),
    queenMax: Math.ceil(s.queen.maxHp),
    queenPercent: (s.queen.hp / s.queen.maxHp) * 100,
    waste: s.waste.toFixed(1),
    efficiency: `${Math.round(st.efficiency * 100)}%`,
    catalog,
    crews,
    selection,
    objective,
    alerts,
    brood,
    slots: st.slots,
    eggsPaused: s.eggsPaused,
    shelter: s.shelter,
    shelterActive: engine.sheltered(),
    autoShelter: s.autoShelter,
    newCrew: s.newCrew,
    raid: {
      title: raidTitle,
      detail: raidDetail,
      timer: raidTimer,
      urgency,
      highest: r.highest,
    },
    events: s.events
      .slice(0, 12)
      .map((e) => ({ ...e, clock: formatTime(e.time) })),
    jobs: s.jobs.length,
    notice: s.noticeUntil > s.time ? s.notice : "",
    selectedId,
    research: Object.entries(RESEARCH).map(([key, d]) => ({
      key,
      ...d,
      level: s.research[key],
      cost: Math.ceil(d.base * 1.7 ** s.research[key]),
      disabled:
        s.food < Math.ceil(d.base * 1.7 ** s.research[key]) ||
        !!s.pendingResearch,
    })),
    legacy: {
      currency: s.meta.currency,
      bestRaid: s.meta.bestRaid,
      bestPopulation: s.meta.bestPopulation,
      bestTime: formatTime(s.meta.bestTime),
      upgrades: Object.entries(PERMANENT).map(([key, d]) => ({
        key,
        ...d,
        level: s.meta.upgrades[key],
        cost: d.base + s.meta.upgrades[key] * 2,
        disabled: s.meta.currency < d.base + s.meta.upgrades[key] * 2,
      })),
    },
    result: s.result
      ? { ...s.result, duration: formatTime(s.result.time) }
      : null,
  };
}

export function inspectTile(engine, x, y) {
  const s = engine.state,
    b = buildingAt(s, x, y),
    job = s.jobs.find((j) => j.x === x && j.y === y);
  if (b)
    return {
      buildingId: b.id,
      title: BUILDINGS[b.type].name,
      detail: b.complete
        ? `Level ${b.level} · ${Math.ceil(b.hp)} health`
        : "Blueprint · click to inspect",
    };
  if (job)
    return {
      title: "Excavation queued",
      detail: `${Math.floor(job.progress * 100)}% · right-click to cancel`,
    };
  return {
    title:
      y <= 0
        ? "Surface"
        : isOpen(s.world, x, y)
          ? "Open tunnel"
          : "Undisturbed earth",
    detail:
      y > 0 && !isOpen(s.world, x, y)
        ? "Right-click to excavate"
        : "Click to inspect",
  };
}

export function focusPoint(engine, target) {
  const s = engine.state;
  if (target === "threat") return s.enemies[0] || s.raid.plan?.spawn || s.queen;
  return s.queen;
}
