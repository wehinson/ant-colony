import { ColonyEngine } from "./engine.js";
import { getView, inspectTile, focusPoint } from "./view.js";
import { STEP } from "./catalog.js";

// Host services are injected so the same application logic runs in Node tests.
export class GameSession {
  constructor(storage = null, seed = Math.floor(Math.random() * 4294967295)) {
    this.storage = storage;
    this.engine = new ColonyEngine({ seed });
    this.saveStatus = "Local autosave";
    this.lastSaved = 0;
    this.lastSaveAttempt = 0;
    this.suspended = false;
    if (storage) {
      try {
        const text = storage.getItem("ant-colony-save");
        if (text) {
          this.engine = ColonyEngine.deserialize(text);
          this.lastGoodSave = text;
          this.saveStatus = "Colony restored";
        }
      } catch {
        try {
          const backup = storage.getItem("ant-colony-save-backup");
          this.engine = ColonyEngine.deserialize(backup);
          this.engine.state.paused = true;
          this.lastGoodSave = backup;
          this.saveStatus =
            "Recovered the previous autosave. The latest save was damaged.";
        } catch {
          this.saveStatus = "Save could not load. Import a backup in Settings.";
          this.engine.state.paused = true;
          this.corruptSave = true;
        }
      }
    }
  }
  command(command) {
    const result = this.engine.command(command);
    if (result.ok && ["prestige", "newRun", "pause"].includes(command.type))
      this.save();
    return result;
  }
  advance(seconds) {
    if (this.suspended) return;
    this.engine.advance(seconds);
    if (
      this.engine.state.time - this.lastSaveAttempt >= 10 ||
      (this.engine.state.status === "defeat" &&
        this.lastSaveAttempt !== this.engine.state.time)
    )
      this.save();
  }
  startClock({ now, schedule, cancel, onUpdate = () => {} }) {
    this.stopClock();
    this.clock = { now, cancel, lastTick: now(), lastView: now() };
    this.clock.handle = schedule(() => {
      const current = now();
      const elapsed = Math.max(0, (current - this.clock.lastTick) / 1000);
      this.clock.lastTick = current;
      this.advance(elapsed);
      if (current - this.clock.lastView >= 200) {
        this.clock.lastView = current;
        onUpdate();
      }
    }, 25);
  }
  stopClock() {
    if (this.clock) this.clock.cancel(this.clock.handle);
    this.clock = null;
  }
  suspend(value) {
    this.suspended = value;
    if (this.clock) this.clock.lastTick = this.clock.now();
    if (value) this.save();
  }
  openPanel() {
    if (this.panelOpen) return;
    this.panelOpen = true;
    this.panelWasPaused = this.engine.state.paused;
    this.engine.command({ type: "pause", value: true });
  }
  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    if (this.engine.state.status !== "defeat" && this.engine.state.started)
      this.engine.command({ type: "pause", value: !!this.panelWasPaused });
  }
  view(selected) {
    return { ...getView(this.engine, selected), saveStatus: this.saveStatus };
  }
  world() {
    return this.engine.state;
  }
  alpha() {
    const elapsed = this.clock
      ? Math.max(0, (this.clock.now() - this.clock.lastTick) / 1000)
      : 0;
    return this.engine.state.paused || this.suspended
      ? 1
      : Math.min(
          1,
          (this.engine.state.accumulator + elapsed * this.engine.state.speed) /
            STEP,
        );
  }
  preview(...args) {
    return this.engine.preview(...args);
  }
  inspect(x, y) {
    return inspectTile(this.engine, x, y);
  }
  focus(target) {
    return focusPoint(this.engine, target);
  }
  export() {
    return this.engine.serialize();
  }
  import(text) {
    const replacement = ColonyEngine.deserialize(text);
    this.engine = replacement;
    this.engine.state.paused = true;
    this.panelWasPaused = true;
    this.engine.state.accumulator = 0;
    this.corruptSave = false;
    this.lastSaved = 0;
    this.save();
    return {
      ok: true,
      message: "Colony restored and paused. No offline time has passed.",
    };
  }
  save() {
    this.lastSaveAttempt = this.engine.state.time;
    if (!this.storage) return false;
    if (this.corruptSave) return false;
    try {
      const payload = this.export();
      if (this.lastGoodSave && this.lastGoodSave !== payload) {
        try {
          this.storage.setItem("ant-colony-save-backup", this.lastGoodSave);
        } catch {
          /* A backup must not block the current save when storage is nearly full. */
        }
      }
      this.storage.setItem("ant-colony-save", payload);
      this.lastGoodSave = payload;
      this.lastSaved = this.engine.state.time;
      this.saveStatus = "Saved on this device";
      return true;
    } catch {
      this.saveStatus = "Autosave unavailable. Export your colony in Settings.";
      return false;
    }
  }
}
