# @pairswap/aviation

Parsers shared by **PairSwap** (`~/ps_dev/pairswap`) and **jetpanel** (`~/ps_dev/jetpanel`).

Both projects read the same FAA data and the same dispatch releases, and both had grown their own
copy of the code that does it — 28 functions duplicated by name, with jetpanel's release parser an
explicit port of PairSwap's `edr.js`. A bug found in one was a bug left standing in the other.

## The one rule: plain ESM, no build

PairSwap's static assistants are served **raw to the browser with no bundler**. So everything here
must be importable by a browser as-is:

- plain ESM JavaScript, never TypeScript
- types in JSDoc, which TypeScript reads fully via `allowJs` — jetpanel gets real typing without
  this package needing a build
- no bare specifiers, no Node built-ins, no DOM, no framework
- pure functions over strings and plain objects

Anything that needs a filesystem, a network, a `Store` or a canvas belongs in the consuming
project, not here.

## Consumers

Repo: <https://github.com/pairswap5150/ps-aviation>

| | How it consumes |
|---|---|
| jetpanel | a git dependency, imported straight from `node_modules` — it has a build, so nothing else is needed |
| PairSwap | **vendored**, not depended on. Its static assistants are served raw to the browser and cannot reach `node_modules`, so `scripts/sync-aviation.mjs` copies `src/` into `frontend/public/static/preflight/shared/vendor/` and commits it. The copy records the commit it came from in `VENDORED.json`, and three guards stop it drifting: a do-not-edit banner on every file, `--check` in the sync script, and a test that fails the build when the copy differs from this repo |

PairSwap's copy is committed on purpose — its deploys build what is in the tree and need nothing
from here. Run `node scripts/sync-aviation.mjs --check --remote` from PairSwap to find out whether
its vendored copy is behind this repo.

## Testing

`npm test` — `node --test`, no framework. Every parser here is pure, so a test is a string in and
an object out.
