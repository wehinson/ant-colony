import { mkdir, writeFile } from 'node:fs/promises';
import { ColonyEngine } from '../src/engine/engine.js';
import { develop, simulate } from './balance.mjs';

await mkdir('artifacts', { recursive: true });
const early = new ColonyEngine({ seed: 23 }); early.command({ type: 'start' });
for (let t = 0; t < 165; t++) { develop(early, { defend: true }); early.advance(1, { exact: true }); }
early.command({ type: 'pause', value: true }); await writeFile('artifacts/early.json', early.serialize());
const mature = new ColonyEngine({ seed: 23 }); mature.command({ type: 'start' });
for (let t = 0; t < 700 && mature.state.status !== 'defeat'; t++) { develop(mature, { defend: true, advanced: true }); mature.advance(1, { exact: true }); }
mature.command({ type: 'pause', value: true }); await writeFile('artifacts/mature.json', mature.serialize());
const { game: defeat } = simulate(23, { defend: false, limit: 1500 }); await writeFile('artifacts/defeat.json', defeat.serialize());
console.log('Natural-play QA saves: early, mature, defeat. These files are ignored by Git.');
