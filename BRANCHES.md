# Ant Colony work log

## GitHub Pages migration — October 9, 2026

- Agent: Codex. Release branch: `main`. Version: 0.1.1.
- Status: GitHub Pages enabled with HTTPS; release workflow publishes the tested `main` commit. Local test server is ready.
- Public source: `https://github.com/wehinson/ant-colony`. William explicitly approved public visibility and publication on October 9. This supersedes the earlier local-only restriction.
- Live game: `https://wehinson.github.io/ant-colony/`. Release metadata records the exact source commit and all game-file hashes.
- Changed root-relative asset and home links to relative links so the complete module graph works at `/ant-colony/`.
- Added a test/build/deploy workflow; only `main` publishes. Website artifacts contain only the built game.
- Added a local Pages-style test server, release metadata and file hashes, and a hosted-release verification command.
- Verification: 81 tests pass, including complete module loading at both root and `/ant-colony/`, redirect behavior, and rejection of private and outside paths. Syntax and production build pass.
- GitHub initially returned HTTP 422 for private-repository Pages. William approved public visibility; Pages activation then succeeded. No billing change was made.
- The browser tool blocked the preview check under its URL policy. Direct HTTP module-loading tests and complete artifact hash checks are the hosting verification for this release. The previous full gameplay UI audit remains recorded below.
- Local test URL: `http://localhost:5174/ant-colony/`. Restart with `npm run test:serve`. See [hosting instructions](docs/hosting.md).

## Previous complete-game verification — October 4, 2026

- Integration branch: `working`
- Agent: Codex
- Status: Complete — system implementation and second-pass audit
- Version: 0.1.0, save format 2
- Verified: 2026-10-04
- Backup: local Git only, as William requested. No remote or deployment was created.

## Independent system branches

Each requested system was implemented, directly tested, committed on its own branch, and merged into `working`. The branches remain available for review. The second pass is also integrated into `working`.

| Branch                          | System checkpoint                   |
| ------------------------------- | ----------------------------------- |
| `codex/infinite-excavation`     | `17534a0`                           |
| `codex/room-placement`          | `ff53ace`                           |
| `codex/ant-assignment`          | `40e60cb`                           |
| `codex/foraging-simulation`     | `05d7451`                           |
| `codex/individual-combat`       | `c08fb6c`                           |
| `codex/raids`                   | `b7abcb6`                           |
| `codex/defensive-structures`    | `114d8e7`                           |
| `codex/prestige-lineages`       | `b896ef0`                           |
| `codex/save-system`             | `ab1bd10`                           |
| `codex/balance-instrumentation` | `28963c6`                           |
| `codex/debug-admin`             | `4351eb5`                           |
| `codex/second-pass-audit`       | `cb9633c` plus final audit evidence |

No shipped `main` branch existed at the start of this task. None was created or changed. Integration used merge commits and did not rewrite history.

## Complete game and ant collection

The headless engine owns all rules, timing, commands, saves, and debug actions. Separate systems handle the infinite grid, rooms, assignment, foraging, individual combat, defenses, raids, and prestige. The UI draws interpolated snapshots and sends orders.

William's ranking was found at `C:\Code\mapcrush-main\docs\ants-top-50.md` and copied into [the project source record](docs/ants-top-50.md). The other project was not changed. Each completed colony unlocks the next ant, from rank 50 through rank 1, then starts a stronger cycle. Permanent purchases remain separate. All 50 names, scientific names, regions, and tiers are retained.

Practice controls use a separate copy and save key. They cannot change real-colony currency, purchased improvements, or ant unlocks. Settings provides both save export/import and a diagnostic report export.

## Final verification

- **78 engine tests passed.** These cover the full colony loop, rule accounting, physical movement and combat, parallel excavation, invalid input, deterministic replay, save recovery, practice isolation, and 102 lineage restarts.
- **24 generated gameplay scenarios passed, with 1,087 save round trips.** Seven natural defeats verified one-time awards, a purchase, the next ant, and founding again. Fortress cases built every one of the 14 structure types with earned resources.
- **600 generated raid compositions** passed budget, unlock, and special-enemy limits inside the direct test suite.
- **12 longer balance scenarios completed.** Idle/economy defeat: 13:28–13:39. Defended defeat: 34:51–37:19. Level-four permanent improvements: one defeat at 39:12 and two alive at the 40-minute limit. These results use a simpler defense policy than the fortress scenarios, which all reached 40 minutes with permanent improvements.
- **Population and combat load checks passed.** Sixty simulated seconds with 1,000 starting workers took 235 ms on this machine; the saved state restored exactly. Thirty simulated seconds with 1,000 warriors and 30 beetles took 7.52 seconds (25.1 ms per 100 ms tick). This artificial combat load includes real damage and an exact save reload.
- **Authorized browser checks passed.** Founding, construction, paused orders, cancellation, dig controls, raids, saving, export, import, visible invalid-file errors, permanent purchases, next colony, the 50-ant collection, practice controls, and restoration were checked through the UI.
- **Phone, tablet, and desktop layouts were inspected.** The 390, 768, and 1440 pixel checks found no horizontal page overflow. Full-page screenshots were captured and reviewed. T3's browser tools were unavailable in this session; the checks used the Codex in-app browser for the local game.
- **Production build passed.** The built game completed founding, loaded natural-play saves, advanced through raid waves, and showed individual attackers and casualties. No browser script errors or warnings were recorded.
- **Ten SHA-256 checks matched** the source, built files, and files served by the local production server: entry page, engine, session, save, view, lineages, combat, UI, renderer, and stylesheet.
- **Syntax and whitespace checks passed.** No runtime package installation is required.

See [the system-by-system audit](docs/system-audit.md) and [machine-readable results](docs/verification-results.json). Full generated reports and screenshots remain in the ignored `artifacts/` folder and can be regenerated with the commands in [README.md](README.md).

## Play locally

Production preview: `http://localhost:5174` while this session's server runs. Development preview: `http://localhost:5173`.

To restart later, run `npm run dev` from this folder and open `http://localhost:5173`. To serve the built game, run `npm run preview`; it also uses port 5173 unless `PORT` is set. Browser saves belong to that browser and port. Use export/import to move a colony between previews.

The game has no fixed terrain or population cap. Memory and CPU remain practical limits. No check proves indefinite survival or the absence of every possible defect; no known failure remains in the completed checks.

## Cloud paused-order persistence correction — 2026-10-21

- Task: `HOME-PROJECT-IDEAS-20261021/idea005/candidateANT-20261021-01/ant-session-realengine-20261021-v1`.
- Agent: Codex, sole hosted-cloud worker. Branch: `task/ant-session-persistence-20261021`, from main `d0fe60a063de24c043497523945efdcb25ecf1eb`. No version bump, merge, or deployment.
- Status: verification in progress; isolated unmerged correction for review.
- Confirmed on unchanged base with the actual GameSession/ColonyEngine: start, pause, accepted dig at (2,4), 800 foreground updates of 0.025 seconds. Job exists in memory, simulation time stays zero, zero subsequent saves, and a new session loses the job. No unload or suspension hook was used.
- UI source path: `src/ui/app.js` map input sends dig through the command wrapper to GameSession. Normal pagehide/beforeunload saves mitigate ordinary closes but do not prevent abrupt-loss cases.
- Correction: accepted commands mark pending changes; existing foreground updates flush within ten elapsed seconds independently of simulation time. Success clears pending changes; failures retry on the same interval. No new timer. Practice state keeps its save key and restores pending real-colony changes after a failed pre-practice save. Corrupt saves remain protected.
- Verification so far: original `node artifacts/paused-proof.mjs` failed on base (exit 1, missing reloaded job) and passed after correction (exit 0). Executable regression copied beside an unchanged `git archive` of the exact base: `node --test --test-name-pattern='real accepted paused excavation' artifacts/base/tests/session-persistence.test.js` failed (exit 1); `node --test tests/session-persistence.test.js` passed 8/8 (exit 0). `npm test` passed 86/86 before three additional lifecycle tests, which passed in the focused run. Syntax and build passed; broader README checks are running.
- Tradeoff: abrupt termination can still lose up to ten seconds of foreground changes; no saves can succeed while storage is unavailable. The existing simulation-based periodic save remains. Accepted no-op commands also record diagnostics and may cause one coalesced save.
- UI gap: no browser, visual, or user interaction verification. No preview server or deployment is part of this task.
