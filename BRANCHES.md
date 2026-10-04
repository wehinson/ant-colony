# Ant Colony work log

- Branch: `working`
- Agent: Codex
- Status: Active — first-principles system audit
- Version: 0.1.0 (first complete game; not shipped)
- Updated: 2026-10-03
- Scope: independent local system branches, ranked ant lineages, debug tools, balance instrumentation, and a second audit with automated gameplay simulations.
- Verification: 46 tests pass; syntax checks and production build pass.
- Backup: local Git commits only, as William requested. No remote or deployment was created.

## Work on working

The complete game is implemented: engine-owned clock and rules, expandable terrain, ordered parallel digging, all six economic chambers, military construction, individual combat, raids, destruction, repairs, shelter, queen relocation, defeat, permanent improvements, subsequent colonies, and full save import/export.

The UI binds player commands and draws interpolated engine snapshots. It includes placement previews, crew controls, structure upgrades, warnings, a journal, help, map navigation, and layouts for narrow screens.

## Verification

- `npm test`: 46 passing tests. Coverage includes the full natural colony loop, accounting, path constraints, combat mechanics, saved random state, corrupt saves, and mixed player orders with repeated reloads.
- `npm run check`: all source and script syntax checks pass.
- `npm run build`: standalone static game built successfully in `dist/`.
- `npm run test:balance`: 12 scenarios across three seeds. Idle or economy-only first colonies fell at 13:29–14:05. Defended colonies lasted 26:31–36:18. All three level-four legacy scenarios were alive at the 40-minute test limit. This limit applies only to the test, not the game.
- `npm run benchmark`: 100, 500, and 1,000-worker simulations and save reloads pass. A separate 1,000-ant / 30-enemy combat check ran 300 simulation steps in about 1.93 seconds on this machine.
- Browser UI events verified construction previews, placing and canceling blueprints, digging, help, saving, export, valid and invalid import, permanent purchases, and starting colony 02. Camera controls did not change the serialized simulation.
- Layout checks at 390, 768, and 1440 pixels passed without horizontal overflow. Captured map images were inspected.
- Production browser check: founding completed, the first worker hatched, the engine clock advanced without relying on render frames, and no script errors were recorded. The production game was left paused for the player.
- SHA-256 checks matched source files, production files, and HTTP-served files for the engine, session, UI, renderer, stylesheet, and entry page.
- `git diff --check`: no whitespace errors.

## Caveat and launch

T3's native full-page screenshot and viewport-resize tools failed in this session. Browser DOM checks, same-origin responsive frames, UI events, and captured canvas images were used. A native full-page visual review remains unverified.

Production game: `http://localhost:5174` while the current preview server is running. Development game: `http://localhost:5173`.

To restart later, run `npm run dev` from this folder and open `http://localhost:5173`. No dependency installation is needed. The full instructions are in `README.md`.

No known engine or gameplay defect remains from these checks. The work stays on `working`; main, GitHub, and deployment were not changed. Recommended next release step: ship this version after the remaining full-page visual check.
