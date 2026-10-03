import { ColonyEngine } from './engine.js';
import { getView, inspectTile, focusPoint } from './view.js';
import { STEP } from './catalog.js';

// Host services are injected so the same application logic runs in Node tests.
export class GameSession {
  constructor(storage = null, seed = Math.floor(Math.random() * 4294967295)) {
    this.storage = storage; this.engine = new ColonyEngine({ seed }); this.saveStatus = 'Local autosave'; this.lastSaved = 0; this.suspended = false;
    if (storage) {
      try { const text = storage.getItem('ant-colony-save'); if (text) { this.engine = ColonyEngine.deserialize(text); this.saveStatus = 'Colony restored'; } }
      catch { this.saveStatus = 'Save could not load. Import a backup in Settings.'; this.engine.state.paused = true; this.corruptSave = true; }
    }
  }
  command(command) { const result = this.engine.command(command); if (result.ok && ['prestige', 'newRun', 'pause'].includes(command.type)) this.save(); return result; }
  advance(seconds) {
    if (this.suspended) return;
    this.engine.advance(seconds);
    if (this.engine.state.time - this.lastSaved >= 10 || (this.engine.state.status === 'defeat' && this.lastSaved !== this.engine.state.time)) this.save();
  }
  suspend(value) { this.suspended = value; if (value) this.save(); }
  openPanel() { if (this.panelOpen) return; this.panelOpen = true; this.panelWasPaused = this.engine.state.paused; this.engine.command({ type: 'pause', value: true }); }
  closePanel() { if (!this.panelOpen) return; this.panelOpen = false; if (this.engine.state.status !== 'defeat' && this.engine.state.started) this.engine.command({ type: 'pause', value: !!this.panelWasPaused }); }
  view(selected) { return { ...getView(this.engine, selected), saveStatus: this.saveStatus }; }
  world() { return this.engine.state; }
  alpha() { return this.engine.state.paused ? 1 : Math.min(1, this.engine.state.accumulator / STEP); }
  preview(...args) { return this.engine.preview(...args); }
  inspect(x, y) { return inspectTile(this.engine, x, y); }
  focus(target) { return focusPoint(this.engine, target); }
  export() { return this.engine.serialize(); }
  import(text) { const replacement = ColonyEngine.deserialize(text); this.engine = replacement; this.engine.state.paused = true; this.panelWasPaused = true; this.engine.state.accumulator = 0; this.corruptSave = false; this.lastSaved = 0; this.save(); return { ok: true, message: 'Colony restored and paused. No offline time has passed.' }; }
  save() {
    if (!this.storage) return false;
    if (this.corruptSave) return false;
    try { this.storage.setItem('ant-colony-save', this.export()); this.lastSaved = this.engine.state.time; this.saveStatus = 'Saved on this device'; return true; }
    catch { this.saveStatus = 'Autosave unavailable. Export your colony in Settings.'; return false; }
  }
}
