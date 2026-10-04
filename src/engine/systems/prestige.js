import { PERMANENT } from "../catalog.js";
// Engine subsystem; methods share the colony state and headless services.
export const prestigeSystem = {
  prestigeAward() {
    const s = this.state;
    return Math.max(1, s.raid.highest * 4 + Math.floor(Math.sqrt(s.peak)));
  },
  _defeat() {
    const s = this.state;
    if (s.status === "defeat") return;
    s.queen.hp = 0;
    s.status = "defeat";
    s.paused = true;
    const earned = s.debug.enabled ? 0 : this.prestigeAward();
    s.result = {
      highestRaid: s.raid.highest,
      peak: s.peak,
      time: s.time,
      cause: s.queen.lastHitBy || "An enemy breached the queen’s defenses",
      earned,
    };
    if (!s.debug.enabled && !s.meta.awarded.includes(s.id)) {
      s.meta.currency += earned;
      s.meta.runs++;
      s.meta.awarded.push(s.id);
      s.meta.bestRaid = Math.max(s.meta.bestRaid, s.raid.highest);
      s.meta.bestPopulation = Math.max(s.meta.bestPopulation, s.peak);
      s.meta.bestTime = Math.max(s.meta.bestTime, s.time);
    }
    this.log(
      "The queen has fallen",
      `${s.result.cause}. Your colony’s legacy carries forward.`,
      "danger",
    );
  },
  _buyPrestige(branch) {
    const s = this.state,
      d = PERMANENT[branch];
    if (!Object.hasOwn(PERMANENT, branch) || s.status !== "defeat")
      return this.notify(
        "Permanent improvements are available between colonies.",
      );
    const level = s.meta.upgrades[branch],
      cost = d.base + level * 2;
    if (s.meta.currency < cost)
      return this.notify(`Needs ${cost} legacy seeds.`);
    s.meta.currency -= cost;
    s.meta.upgrades[branch]++;
    return this.ok(`${d.name} improved. This applies to your next colony.`);
  },
};
