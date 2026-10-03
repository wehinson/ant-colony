export const VERSION = 1;
export const STEP = 0.1;
export const ECONOMIC = ['queen', 'storage', 'brood', 'waste', 'prey', 'quarters'];
export const CREWS = ['food', 'dig', 'warrior'];
export const BUILDINGS = {
  queen: { name: "Queen’s Chamber", short: 'Queen', branch: 'economy', w: 3, h: 2, food: 0, energy: 0, staff: 0, hp: 260, color: '#d49d42', icon: 'crown', description: 'The heart of your colony. One brood slot. Protect her at all costs.' },
  storage: { name: 'Food Storage', short: 'Storage', branch: 'economy', w: 3, h: 2, food: 18, energy: 0, staff: 0, hp: 130, color: '#8a9e51', icon: 'leaf', description: '+90 food capacity. Food is delivered at any nest entrance.' },
  brood: { name: 'Brood Chamber', short: 'Brood', branch: 'economy', w: 3, h: 2, food: 32, energy: 0, staff: 0, hp: 110, color: '#d1ad7d', icon: 'egg', description: '+2 concurrent eggs. More slots, never a population limit.' },
  waste: { name: 'Waste Chamber', short: 'Waste', branch: 'economy', w: 2, h: 2, food: 38, energy: 0, staff: 0, hp: 130, color: '#a48d76', icon: 'recycle', description: 'Processes waste automatically to keep your colony efficient.' },
  prey: { name: 'Prey Chamber', short: 'Prey', branch: 'economy', w: 3, h: 2, food: 52, energy: 0, staff: 0, hp: 155, color: '#b78461', icon: 'bug', description: 'Catches prey through a real surface route. Improves salvage.' },
  quarters: { name: 'Worker Quarters', short: 'Quarters', branch: 'economy', w: 3, h: 2, food: 60, energy: 0, staff: 0, hp: 150, color: '#7a9b8b', icon: 'rest', description: '+55 shared energy and +1.2 recovery per second. No housing cap.' },
  barracks: { name: 'Barracks', short: 'Barracks', branch: 'military', w: 3, h: 2, food: 28, energy: 0, staff: 0, hp: 190, color: '#9a7663', icon: 'shield', description: '+8 mobile warrior capacity. Assign existing workers to fight.' },
  guard: { name: 'Guard Post', short: 'Guard', branch: 'military', w: 1, h: 1, food: 18, energy: 0, staff: 2, hp: 145, damage: 11, range: 1.5, cooldown: 1.1, color: '#b27051', icon: 'swords', description: 'Commits 2 warriors. A strong melee position; ants can pass.' },
  ranged: { name: 'Ranged Ant Post', short: 'Ranged', branch: 'military', w: 2, h: 1, food: 75, energy: 0, staff: 15, hp: 210, damage: 22, range: 7, cooldown: 1, color: '#b98d47', icon: 'target', description: 'Commits 15 warriors. Sustained fire through open tunnels.' },
  outpost: { name: 'Surface Outpost', short: 'Outpost', branch: 'military', w: 2, h: 1, surface: true, food: 75, energy: 0, staff: 15, hp: 220, damage: 24, range: 8, cooldown: 1, flying: true, color: '#8d9758', icon: 'tower', description: 'Commits 15 warriors. Surface fire that can hit flying enemies.' },
  spray: { name: 'Spray Post', short: 'Spray', branch: 'military', w: 1, h: 1, food: 42, energy: 0, staff: 5, hp: 150, damage: 14, range: 3, cooldown: 2, splash: 1.7, color: '#9b9e4a', icon: 'spray', description: 'Commits 5 warriors. Short-range spray damages enemy groups.' },
  snare: { name: 'Snare Trap', short: 'Snare', branch: 'military', w: 1, h: 1, food: 12, energy: 8, staff: 0, hp: 55, range: 0.8, cooldown: 7, slow: true, color: '#ab976c', icon: 'web', description: 'Slows attackers by 70% for 5 seconds. Resets in 7 seconds.' },
  trap: { name: 'Damage Trap', short: 'Trap', branch: 'military', w: 1, h: 1, food: 20, energy: 12, staff: 0, hp: 65, damage: 45, range: 0.85, cooldown: 9, color: '#b98565', icon: 'spike', description: 'A powerful close-range hit. Resets in 9 seconds.' },
  barricade: { name: 'Barricade', short: 'Barricade', branch: 'military', w: 1, h: 1, food: 12, energy: 10, staff: 0, hp: 260, blocking: true, color: '#947453', icon: 'wall', description: 'Blocks enemies with destructible health. Friendly ants can pass.' },
};
export const ENEMIES = {
  scout: { name: 'Rival scout', cost: 2, hp: 30, speed: 1.25, damage: 5, cooldown: 1.2, range: 0.85, color: '#8e4541', minRaid: 1 },
  soldier: { name: 'Rival soldier', cost: 5, hp: 95, speed: 0.75, damage: 12, cooldown: 1.2, range: 0.95, color: '#793d36', minRaid: 2 },
  swarm: { name: 'Army ant', cost: 1, hp: 16, speed: 1.6, damage: 3.5, cooldown: 0.9, range: 0.8, color: '#b8513e', minRaid: 2 },
  beetle: { name: 'Armored beetle', cost: 11, hp: 280, armor: 0.35, speed: 0.48, damage: 18, cooldown: 1.7, range: 1, color: '#596341', minRaid: 2 },
  spider: { name: 'Hunter spider', cost: 8, hp: 135, speed: 1.4, damage: 18, cooldown: 1, range: 1.15, color: '#66517a', minRaid: 3 },
  wasp: { name: 'Wasp', cost: 8, hp: 90, speed: 1.8, damage: 11, cooldown: 1, range: 0.9, flying: true, color: '#c18d29', minRaid: 3 },
  tunneller: { name: 'Tunnelling rival', cost: 12, hp: 180, speed: 0.65, damage: 15, cooldown: 1.5, range: 0.95, tunnelling: true, color: '#886351', minRaid: 4 },
  thief: { name: 'Brood thief', cost: 6, hp: 70, speed: 1.6, damage: 7, cooldown: 1, range: 0.8, thief: true, color: '#896489', minRaid: 3 },
};
export const PERMANENT = {
  foraging: { name: 'Abundant trails', icon: 'leaf', description: '+15% carrying capacity and +5% travel speed per level.', base: 3 },
  brood: { name: 'New generations', icon: 'egg', description: 'Eggs develop 12% faster per level; food cost falls gradually.', base: 3 },
  excavation: { name: 'Deeper roots', icon: 'pick', description: '+18% digging speed and +0.15 energy recovery per level.', base: 3 },
  military: { name: 'Unbroken colony', icon: 'shield', description: '+15% combat health and damage; +2 mobile capacity per level.', base: 4 },
  founding: { name: 'A stronger start', icon: 'crown', description: '+12 starting food, +20 energy capacity, and faster founding per level.', base: 3 },
};
export const RESEARCH = {
  carry: { name: 'Foraging baskets', description: '+2 food per completed trip.', base: 28 },
  speed: { name: 'Scent trails', description: '+12% worker travel speed.', base: 32 },
  armor: { name: 'Chitin training', description: '+15% warrior health and damage.', base: 36 },
};
export const key = (x, y) => `${x},${y}`;
export const cell = p => ({ x: Math.round(p.x), y: Math.round(p.y) });
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const center = b => ({ x: b.x + (BUILDINGS[b.type].w - 1) / 2, y: b.y + (BUILDINGS[b.type].h - 1) / 2 });
export function footprint(type, x, y) {
  const d = BUILDINGS[type], result = [];
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) result.push({ x: xx, y: yy });
  return result;
}
export function formatTime(t) { return `${Math.floor(Math.max(0, t) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, t) % 60).toString().padStart(2, '0')}`; }
