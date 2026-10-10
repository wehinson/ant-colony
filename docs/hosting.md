# GitHub Pages and the local test server

Source repository: https://github.com/wehinson/ant-colony

Play online: https://wehinson.github.io/ant-colony/

The game is a static site. Its engine runs in the player's browser. GitHub Pages hosts the built files; it does not need a database or a game server.

## Test locally

```sh
npm run test:serve
```

Open http://localhost:5174/ant-colony/. The root URL redirects there. This server uses the same project path as GitHub Pages, which catches paths that work locally but fail after hosting. It serves the built game from `dist/` and binds only to this computer. Stop it with Ctrl+C. Re-run the command after editing to rebuild.

For direct source development, use `npm run dev` and http://localhost:5173/.

## Deploy

The workflow in `.github/workflows/pages.yml` runs engine and HTTP hosting tests on `working`, pull requests, and `main`. Only `main` can deploy. It builds and uploads only `dist/`; project notes, test fixtures, local saves, and Git history are not in the website artifact.

GitHub repository settings must select **Pages → Build and deployment → GitHub Actions**. The expected site address is https://wehinson.github.io/ant-colony/. A push to `main` or a manual workflow run on `main` deploys the tested build. A failed test prevents deployment.

On October 9, 2026 William approved making the repository public and publishing the game. The repository is public and GitHub Pages is enabled with HTTPS. This resolved the account's private-repository Pages restriction without changing the account plan.

## Verify a release

Each build contains `release.json` with its version, source commit, and SHA-256 hashes of every game file. After deployment, run:

```sh
node scripts/verify-site.mjs https://wehinson.github.io/ant-colony/ EXPECTED_FULL_COMMIT
```

The same command accepts `http://localhost:5174/ant-colony/` for local checks. It checks every hosted game file against the manifest and rejects a different commit. Release verification must use a clean, committed checkout; local builds made during editing can contain edits beyond the recorded commit.

## Move an existing colony

Browser saves belong to their website address. Export your colony from the local game through **Save and settings → Export colony**, then import it on GitHub Pages. This preserves the complete colony and permanent progress without offline advancement. A change of hosting address cannot read the old browser's local storage automatically.

Keep a save export before clearing browser data. Gameplay saves and diagnostic exports stay on the player's device; no save is uploaded to GitHub by the game.
