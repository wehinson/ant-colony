import { BUILDINGS, ENEMIES } from '../engine/catalog.js';

// This module only draws and projects coordinates. It never changes the engine.
const noise = (x, y, seed = 0) => { let n = Math.imul(x + 57, 374761393) ^ Math.imul(y + 19, 668265263) ^ seed; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
const roundRect = (ctx, x, y, w, h, r = 6) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const ellipse = (ctx, x, y, rx, ry, color, angle = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill(); };

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.camera = { x: 0, y: 4.4, zoom: 1 }; this.grid = true;
    this.width = 600; this.height = 500; this.tile = 43; this.lastScene = null;
    new ResizeObserver(() => this.resize()).observe(canvas); this.resize();
  }
  resize() { const { width, height } = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); this.width = width; this.height = height; this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  project(x, y) { const t = this.tile * this.camera.zoom; return { x: (x - this.camera.x) * t + this.width / 2, y: (y - this.camera.y) * t + this.height / 2 }; }
  unproject(x, y) { const t = this.tile * this.camera.zoom; return { x: (x - this.width / 2) / t + this.camera.x, y: (y - this.height / 2) / t + this.camera.y }; }
  tileAt(x, y) { const p = this.unproject(x, y); return { x: Math.round(p.x) || 0, y: Math.round(p.y) || 0 }; }
  pan(dx, dy) { const t = this.tile * this.camera.zoom; this.camera.x -= dx / t; this.camera.y -= dy / t; }
  zoom(delta, point = { x: this.width / 2, y: this.height / 2 }) { const before = this.unproject(point.x, point.y); this.camera.zoom = Math.max(0.4, Math.min(2, this.camera.zoom * Math.exp(delta * 0.14))); const after = this.unproject(point.x, point.y); this.camera.x += before.x - after.x; this.camera.y += before.y - after.y; return Math.round(this.camera.zoom * 100); }
  focus(p) { this.camera.x = p.x; this.camera.y = Math.max(3, p.y + 0.4); }
  draw(s, alpha, { preview = null, selected = null, hover = null, tool = 'inspect' } = {}) {
    const c = this.ctx, t = this.tile * this.camera.zoom, W = this.width, H = this.height;
    if (!W || !H) return;
    c.clearRect(0, 0, W, H);
    const tl = this.unproject(0, 0), br = this.unproject(W, H), minX = Math.floor(tl.x - 1), maxX = Math.ceil(br.x + 1), minY = Math.max(1, Math.floor(tl.y - 1)), maxY = Math.ceil(br.y + 1);
    const surface = this.project(0, 0.45).y;
    const sky = c.createLinearGradient(0, 0, 0, Math.max(1, surface)); sky.addColorStop(0, '#e6e8d7'); sky.addColorStop(1, '#f0eddb'); c.fillStyle = sky; c.fillRect(0, 0, W, Math.max(0, surface));
    this.landscape(minX, maxX, surface, t);
    const earth = c.createLinearGradient(0, Math.max(0, surface), 0, H); earth.addColorStop(0, '#af9271'); earth.addColorStop(1, '#806951'); c.fillStyle = earth; c.fillRect(0, Math.max(0, surface), W, H);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const p = this.project(x - 0.5, y - 0.5), n = noise(x, y, s.seed);
      c.fillStyle = n > 0.6 ? `rgba(231,204,163,${(n - 0.6) * 0.075})` : `rgba(40,29,15,${n * 0.035})`; c.fillRect(p.x, p.y, t, t);
      if (this.grid) { c.strokeStyle = '#59442e0d'; c.lineWidth = 0.6; c.strokeRect(p.x, p.y, t, t); }
      if (n > 0.35) { ellipse(c, p.x + t * (0.2 + noise(y, x) * 0.6), p.y + t * (0.15 + n * 0.7), t * 0.018, t * 0.009, '#d8b88c35', n * 5); }
      if (n < 0.1) { c.strokeStyle = '#5e4b3724'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(p.x + t * 0.1, p.y + t * 0.3); c.lineTo(p.x + t * 0.45, p.y + t * 0.5); c.lineTo(p.x + t * 0.65, p.y + t * 0.42); c.stroke(); }
    }
    this.roots(minX, maxX, s.seed, t);
    // Only draw visible tiles. The world simulation runs independently of this cull.
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (s.world.dug[`${x},${y}`]) {
      const p = this.project(x - 0.5, y - 0.5); c.fillStyle = '#675039'; roundRect(c, p.x - 1, p.y - 1, t + 2, t + 2, 9 * this.camera.zoom); c.fill();
      c.fillStyle = '#c3a27a'; roundRect(c, p.x + 2, p.y + 2, t - 4, t - 4, 6 * this.camera.zoom); c.fill();
      c.fillStyle = '#c3a27a';
      if (s.world.dug[`${x + 1},${y}`]) c.fillRect(p.x + t / 2, p.y + 2, t / 2 + 5, t - 4);
      if (s.world.dug[`${x},${y + 1}`]) c.fillRect(p.x + 2, p.y + t / 2, t - 4, t / 2 + 5);
      if (y === 1) { c.fillRect(p.x + 2, p.y - t * 0.27, t - 4, t * 0.4); ellipse(c, p.x + t / 2, surface - 3, t * 0.6, t * 0.11, '#665638'); }
    }
    c.fillStyle = '#c3a27a';
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (s.world.dug[`${x},${y}`]) {
      const p = this.project(x, y);
      if (s.world.dug[`${x + 1},${y}`]) c.fillRect(p.x, p.y - t / 2 + 3, t, t - 6);
      if (s.world.dug[`${x},${y + 1}`]) c.fillRect(p.x - t / 2 + 3, p.y, t - 6, t);
    }
    for (const j of s.jobs) {
      if (j.x < minX || j.x > maxX || j.y < minY || j.y > maxY) continue;
      const p = this.project(j.x - 0.5, j.y - 0.5); c.save(); c.setLineDash([3, 4]); c.strokeStyle = '#ead19a88'; c.lineWidth = 1; roundRect(c, p.x + 4, p.y + 4, t - 8, t - 8, 3); c.stroke(); c.restore();
      c.fillStyle = '#e7c58a25'; c.fillRect(p.x + 4, p.y + t - 4 - (t - 8) * j.progress, t - 8, (t - 8) * j.progress);
      c.strokeStyle = '#e6c68c88'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(p.x + t * 0.4, p.y + t * 0.65); c.lineTo(p.x + t * 0.62, p.y + t * 0.36); c.moveTo(p.x + t * 0.37, p.y + t * 0.33); c.quadraticCurveTo(p.x + t * 0.57, p.y + t * 0.27, p.x + t * 0.71, p.y + t * 0.47); c.stroke();
    }
    for (const b of s.buildings) if (b.x <= maxX && b.x + BUILDINGS[b.type].w >= minX && b.y <= maxY && b.y + BUILDINGS[b.type].h >= minY - 2) this.building(b, s, selected, t);
    if (s.rally) { const p = this.project(s.rally.x, s.rally.y); c.strokeStyle = '#ecbd63'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - 5, p.y + 9); c.lineTo(p.x - 5, p.y - 12); c.stroke(); c.fillStyle = '#dca558'; c.beginPath(); c.moveTo(p.x - 5, p.y - 12); c.lineTo(p.x + 10, p.y - 6); c.lineTo(p.x - 5, p.y - 1); c.fill(); }
    for (const d of s.drops) { const p = this.project(d.x, d.y); if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) continue; ellipse(c, p.x, p.y + 2, t * 0.09, t * 0.055, d.captureTarget ? '#a9af56' : '#9b8554', -0.5); }
    const visible = a => a.x >= minX && a.x <= maxX && a.y >= tl.y - 1 && a.y <= maxY;
    // Render fewer noncombat civilian details when zoomed far out; all ants remain simulated.
    for (let i = 0; i < s.ants.length; i++) { const a = s.ants[i]; if (a.phase === 'forage' || !visible(a) || (a.staffOf && a.stationed)) continue; if (this.camera.zoom < 0.6 && a.crew !== 'warrior' && i % 2) continue; this.ant(a, alpha, s.time, t); }
    for (const e of s.enemies) if (visible(e)) this.enemy(e, alpha, s.time, t);
    if (visible(s.queen)) this.ant(s.queen, alpha, s.time, t, true);
    for (const fx of s.effects) { const a = this.project(fx.x, fx.y), b = this.project(fx.tx, fx.ty), life = 1 - (s.time - fx.at) / fx.duration; c.save(); c.globalAlpha = Math.max(0, life); if (['shot', 'attack'].includes(fx.type)) { c.strokeStyle = fx.color; c.lineWidth = fx.type === 'shot' ? 2 : 1.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); ellipse(c, b.x, b.y, 3, 3, '#f6d278'); } else if (fx.type === 'food') { c.fillStyle = '#d7e29c'; c.font = 'bold 12px Segoe UI'; c.textAlign = 'center'; c.fillText('+ food', a.x, a.y - (1 - life) * 22); } else { c.strokeStyle = fx.color; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, (1 - life) * t * 0.65 + 3, 0, 7); c.stroke(); } c.restore(); }
    if (hover && !preview) { const p = this.project(hover.x - 0.5, hover.y - 0.5); c.strokeStyle = tool === 'dig' ? '#f6d78daa' : '#fff3d833'; c.lineWidth = 1; roundRect(c, p.x + 2, p.y + 2, t - 4, t - 4, 3); c.stroke(); }
    if (preview) {
      for (const tile of preview.tiles) { const p = this.project(tile.x - 0.5, tile.y - 0.5); c.fillStyle = preview.valid ? '#d7e3a342' : '#e58d7044'; c.fillRect(p.x + 1, p.y + 1, t - 2, t - 2); }
      const p = this.project(preview.x - 0.5, preview.y - 0.5), d = BUILDINGS[preview.type]; c.save(); c.setLineDash([6, 4]); c.strokeStyle = preview.valid ? '#e0e9b2' : '#f7ad8d'; c.lineWidth = 2; roundRect(c, p.x + 1, p.y + 1, t * d.w - 2, t * d.h - 2, 7); c.stroke(); c.restore();
    }
    // A subtle edge shade keeps the map legible against the light interface.
    const vignette = c.createLinearGradient(0, 0, 0, H); vignette.addColorStop(0, '#453c2300'); vignette.addColorStop(0.75, '#453c2300'); vignette.addColorStop(1, '#32261113'); c.fillStyle = vignette; c.fillRect(0, 0, W, H);
  }
  landscape(minX, maxX, surface, t) {
    const c = this.ctx; if (surface < -40) return;
    c.fillStyle = '#c6cda95c'; c.beginPath(); c.moveTo(0, surface); for (let x = 0; x <= this.width + 40; x += 30) c.lineTo(x, surface - 28 - Math.sin(x / 130 + this.camera.x * 0.07) * 17); c.lineTo(this.width, surface); c.fill();
    for (let x = minX; x <= maxX; x++) {
      const p = this.project(x, 0.45), n = noise(x, 0);
      if (n > 0.77) { c.save(); c.translate(p.x, p.y); c.strokeStyle = '#9daa74'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3, -t * 0.4, t * 0.1, -t * (0.6 + n * 0.2)); c.stroke(); ellipse(c, -t * 0.09, -t * 0.43, t * 0.17, t * 0.065, '#acb780', 0.6); ellipse(c, t * 0.1, -t * 0.64, t * 0.15, t * 0.07, '#b6be88', -0.5); c.restore(); }
      for (let i = 0; i < 4; i++) { const xx = p.x - t / 2 + i * t / 4, h = 3 + noise(x * 4 + i, 2) * 9; c.strokeStyle = i % 2 ? '#a2ab75' : '#bac18a'; c.lineWidth = this.camera.zoom * 1.2; c.beginPath(); c.moveTo(xx, surface); c.lineTo(xx + (i % 2 ? 2 : -2), surface - h * this.camera.zoom); c.stroke(); }
      if (n < 0.24) ellipse(c, p.x + t * 0.2, surface - 1, t * 0.11, t * 0.055, '#c1b995');
    }
    c.strokeStyle = '#879b5766'; c.lineWidth = 4 * this.camera.zoom; c.beginPath(); c.moveTo(0, surface); c.lineTo(this.width, surface); c.stroke();
  }
  roots(minX, maxX, seed, t) {
    const c = this.ctx; c.save(); c.strokeStyle = '#6c563e32'; c.lineWidth = 1.1 * this.camera.zoom;
    for (let x = minX; x <= maxX; x++) if (noise(x, 11, seed) > 0.74) { const p = this.project(x, 0.5), len = t * (1.8 + noise(x, 3) * 2); c.beginPath(); c.moveTo(p.x, p.y); c.bezierCurveTo(p.x - t * 0.3, p.y + len / 3, p.x + t * 0.6, p.y + len * 0.6, p.x + t * 0.15, p.y + len); c.moveTo(p.x + t * 0.1, p.y + len * 0.45); c.quadraticCurveTo(p.x - t * 0.7, p.y + len * 0.47, p.x - t * 0.6, p.y + len * 0.75); c.stroke(); }
    c.restore();
  }
  building(b, s, selected, t) {
    const c = this.ctx, d = BUILDINGS[b.type], p = this.project(b.x - 0.5, b.y - 0.5), w = d.w * t, h = d.h * t, z = this.camera.zoom;
    if (!b.complete) { c.save(); c.fillStyle = d.color + '16'; roundRect(c, p.x + 3, p.y + 3, w - 6, h - 6, 11 * z); c.fill(); c.setLineDash([4, 4]); c.strokeStyle = d.color + 'b0'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = '#e9d7b9b0'; c.font = `${Math.max(8, 10 * z)}px Segoe UI`; c.textAlign = 'center'; c.fillText(d.short.toUpperCase(), p.x + w / 2, p.y + h / 2 + 3); c.restore(); return; }
    c.fillStyle = '#695039'; c.shadowColor = '#34291528'; c.shadowBlur = 7; c.shadowOffsetY = 2; roundRect(c, p.x + 1, p.y + 1, w - 2, h - 2, 12 * z); c.fill(); c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    const floor = c.createLinearGradient(0, p.y, 0, p.y + h); floor.addColorStop(0, '#c8a77f'); floor.addColorStop(1, '#dec198'); c.fillStyle = floor; roundRect(c, p.x + 5 * z, p.y + 5 * z, w - 10 * z, h - 10 * z, 9 * z); c.fill();
    c.strokeStyle = d.color + '88'; c.lineWidth = 2 * z; c.stroke();
    const cx = p.x + w / 2, cy = p.y + h / 2;
    c.save(); c.translate(cx, cy); c.scale(z, z);
    if (b.type === 'storage') { for (let i = 0; i < 9; i++) { const x = (i % 3 - 1) * 18, y = (Math.floor(i / 3) - 1) * 10 + 6; ellipse(c, x, y, 9, 4.5, ['#879249', '#a4ac65', '#bbc082'][i % 3], -0.5 + (i % 2) * 0.8); c.strokeStyle = '#d7d59388'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(x - 5, y + 2); c.lineTo(x + 5, y - 2); c.stroke(); } }
    else if (b.type === 'queen' || b.type === 'brood') { c.strokeStyle = '#ad895b77'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(b.type === 'queen' ? 10 : 0, 8, 28 + i * 3, 14 + i * 2, 0, 0, 7); c.stroke(); } const eggs = s.eggs.filter(e => e.buildingId === b.id); for (let i = 0; i < Math.min(12, eggs.length); i++) ellipse(c, (i % 4 - 1.5) * 10 + (b.type === 'queen' ? 13 : 0), Math.floor(i / 4) * 9 + 5, 4, 6, '#f6eacc', 0.3); }
    else if (b.type === 'quarters') { for (let i = 0; i < 3; i++) { ellipse(c, (i - 1) * 27, 8, 12, 7, '#8b9b67', -0.15); c.strokeStyle = '#b9c087'; c.beginPath(); c.moveTo((i - 1) * 27 - 8, 8); c.lineTo((i - 1) * 27 + 7, 7); c.stroke(); } }
    else if (b.type === 'waste') { for (let i = 0; i < 8; i++) ellipse(c, (noise(i, 4) - 0.5) * 42, noise(i, 5) * 18 - 2, 5 + noise(i, 9) * 5, 4, ['#968467', '#af9572', '#887656'][i % 3]); }
    else if (b.type === 'prey') { c.strokeStyle = '#9e826255'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-40, i * 9); c.lineTo(40, -i * 9); c.moveTo(i * 13, -25); c.lineTo(-i * 13, 27); c.stroke(); } ellipse(c, 7, 7, 8, 5, '#839256'); }
    else if (b.type === 'barracks') { c.strokeStyle = '#9a7250'; c.lineWidth = 2.5; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 25 - 7, 17); c.lineTo(i * 25 + 7, -10); c.moveTo(i * 25 + 7, 17); c.lineTo(i * 25 - 7, -10); c.stroke(); } }
    else if (b.type === 'barricade') { c.strokeStyle = '#8c6440'; c.lineWidth = 5; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 9 - 2, -13); c.lineTo(i * 9 + 2, 14); c.stroke(); } c.strokeStyle = '#c4a478'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, -6); c.lineTo(15, -3); c.moveTo(-14, 7); c.lineTo(15, 9); c.stroke(); }
    else if (b.type === 'trap') { c.fillStyle = '#b88b59'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 8 - 4, 8); c.lineTo(i * 8, -9); c.lineTo(i * 8 + 4, 8); c.fill(); } }
    else if (b.type === 'snare') { c.strokeStyle = '#8d8160'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, 5 + i * 4, 3 + i * 3, 0.5, 0, 7); c.stroke(); } }
    else { c.fillStyle = d.color; roundRect(c, -13, -10, 26, 21, 4); c.fill(); c.strokeStyle = '#ddc9a1'; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(0, -9); c.lineTo(0, 10); c.stroke(); for (let i = 0; i < Math.min(5, b.staff.length); i++) ellipse(c, (i - (Math.min(5, b.staff.length) - 1) / 2) * 7, 12, 2, 3, '#634832'); }
    c.restore();
    if (d.w >= 2 && t > 24) { c.fillStyle = '#755f3c'; c.textAlign = 'center'; c.font = `600 ${Math.max(8, 9 * z)}px Segoe UI`; c.fillText(d.short.toUpperCase(), cx, p.y + 17 * z); }
    if (b.level > 1) { c.fillStyle = '#f0dbb0'; c.font = `${10 * z}px Segoe UI`; c.textAlign = 'right'; c.fillText(`L${b.level}`, p.x + w - 8 * z, p.y + h - 9 * z); }
    if (b.hp < b.maxHp) this.health(p.x + 6, p.y + h - 7 * z, w - 12, b.hp / b.maxHp, '#92a464', 3);
    if (b.cooldown && ['trap', 'snare'].includes(b.type)) this.health(p.x + 5, p.y + h + 2, w - 10, 1 - b.cooldown / d.cooldown, '#e0c785', 2);
    if (selected === b.id) { c.strokeStyle = '#f3d791'; c.lineWidth = 2; roundRect(c, p.x - 2, p.y - 2, w + 4, h + 4, 13 * z); c.stroke(); }
  }
  ant(a, alpha, time, t, queen = false) {
    const c = this.ctx, x = (a.previousX ?? a.x) + (a.x - (a.previousX ?? a.x)) * alpha, y = (a.previousY ?? a.y) + (a.y - (a.previousY ?? a.y)) * alpha, p = this.project(x, y);
    const z = t / 43 * (queen ? 1.45 : 0.85), angle = Math.atan2(a.y - (a.previousY ?? a.y), a.x - (a.previousX ?? a.x));
    c.save(); c.translate(p.x, p.y); c.rotate(angle); c.scale(z, z); ellipse(c, 0, 3, 10, 3.5, '#3f2b2525');
    const color = queen ? '#754927' : a.crew === 'warrior' ? '#664333' : '#624c34', moving = Math.abs(a.x - a.previousX) + Math.abs(a.y - a.previousY) > 0.001;
    c.strokeStyle = color; c.lineWidth = 0.85;
    for (let i = 0; i < 3; i++) { const swing = moving ? Math.sin(time * 22 + i * 2) * 2 : 0; c.beginPath(); c.moveTo(i * 3 - 4, -1); c.lineTo(i * 4 - 5 + swing, -5); c.lineTo(i * 5 - 6 + swing, -7); c.moveTo(i * 3 - 4, 1); c.lineTo(i * 4 - 5 - swing, 5); c.lineTo(i * 5 - 6 - swing, 7); c.stroke(); }
    ellipse(c, -6, 0, queen ? 7 : 5, queen ? 4.5 : 3.5, color); ellipse(c, 0, 0, 2.6, 2.3, queen ? '#b27e3c' : color); ellipse(c, 5, 0, 3.1, 2.8, color);
    c.strokeStyle = color; c.beginPath(); c.moveTo(7, -1); c.lineTo(11, -5); c.moveTo(7, 1); c.lineTo(11, 5); c.stroke();
    if (queen || a.crew === 'warrior') { c.strokeStyle = queen ? '#dab267' : '#c28a51'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-6, -3); c.lineTo(-6, 3); c.stroke(); }
    if (a.cargo > 0) ellipse(c, 8, -5, 5, 2.4, '#a8b466', -0.5);
    c.restore(); if (a.hp < a.maxHp) this.health(p.x - 9, p.y - (queen ? 19 : 12), 18, a.hp / a.maxHp, queen ? '#e4bb6b' : '#a6b86f', 2);
    if (queen) { c.fillStyle = '#f1d49a'; c.font = `${Math.max(8, t / 43 * 8)}px Segoe UI`; c.textAlign = 'center'; c.fillText('QUEEN', p.x, p.y - 19 * t / 43); }
  }
  enemy(e, alpha, time, t) {
    const c = this.ctx, d = ENEMIES[e.type], x = e.previousX + (e.x - e.previousX) * alpha, y = e.previousY + (e.y - e.previousY) * alpha, p = this.project(x, y), z = t / 43;
    if (['scout', 'soldier', 'swarm', 'thief', 'tunneller'].includes(e.type)) { const a = { ...e, crew: 'warrior' }; this.ant(a, alpha, time, t * (e.type === 'swarm' ? 0.85 : 1.1)); c.strokeStyle = '#d47859'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 10 * z, 0, Math.PI * 2); c.stroke(); }
    else { c.save(); c.translate(p.x, p.y); c.scale(z, z); if (e.type === 'wasp') { ellipse(c, 0, -5, 10, 3, '#f4eed1aa', -0.4); ellipse(c, 0, 5, 10, 3, '#f4eed1aa', 0.4); ellipse(c, 0, 0, 9, 4, '#b69537'); c.strokeStyle = '#624d29'; c.lineWidth = 2.5; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 4, -3); c.lineTo(i * 4, 3); c.stroke(); } } else { c.strokeStyle = d.color; c.lineWidth = 1.2; for (let i = 0; i < (e.type === 'spider' ? 4 : 3); i++) { c.beginPath(); c.moveTo(i * 3 - 4, -2); c.lineTo(i * 6 - 8, -10); c.lineTo(i * 7 - 10, -13); c.moveTo(i * 3 - 4, 2); c.lineTo(i * 6 - 8, 10); c.lineTo(i * 7 - 10, 13); c.stroke(); } ellipse(c, 0, 0, e.type === 'beetle' ? 13 : 8, e.type === 'beetle' ? 9 : 6, d.color); c.strokeStyle = '#b7b480'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, 0); c.stroke(); } c.restore(); }
    this.health(p.x - 12 * z, p.y - 17 * z, 24 * z, e.hp / e.maxHp, '#cf785a', 2.5);
    if (e.slowUntil > time) { c.strokeStyle = '#ded3ae'; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 13 * z, 0, 7); c.stroke(); }
  }
  health(x, y, w, fraction, color, h) { const c = this.ctx; c.fillStyle = '#493d2d66'; roundRect(c, x, y, w, h, h / 2); c.fill(); c.fillStyle = color; roundRect(c, x, y, Math.max(0.1, w * Math.max(0, Math.min(1, fraction))), h, h / 2); c.fill(); }
}
