# Contributing to CosDI

Thanks for helping. This repo is developed in Cocos Creator **3.8.8** and ships two npm packages (Creator 3.0+):

| Package | Source | What it is |
| --- | --- | --- |
| `cosdi` | `assets/CosDI/` | The DI runtime games import |
| `cosdi-diagnostics` | `extensions/cosdi-diagnostics/` | The CosDI Diagnostics editor panel |

`cosdi-diagnostics.zip` is only a manual-import fallback for the panel; npm is the supported path.

## Bug reports

Use **[New issue → Bug report](https://github.com/vvda12061999/CosDI/issues/new?template=bug_report.yml)**.

Please include:

- Cocos Creator version
- OS
- CosDI version (extension version, npm version, or commit)
- Steps to reproduce
- Expected vs actual
- Editor / PreviewInEditor logs or a screenshot

Search [existing issues](https://github.com/vvda12061999/CosDI/issues) first.

## Feature requests

Use **[New issue → Feature request](https://github.com/vvda12061999/CosDI/issues/new?template=feature_request.yml)**.

## Pull requests

1. Fork the repo and create a branch from `master`.
2. Open the project in Cocos Creator 3.8.8.
3. Change `assets/CosDI/` (runtime), `extensions/cosdi-diagnostics/` (Diagnostics panel) or `extensions/cosdi-codegen/` (interface token generator).
4. Keep the sample in `assets/Scripts/` working (`import { ... } from 'cosdi'`).
5. After touching the runtime, an extension, or an install CLI:

```bash
npm ci
npm test
node scripts/pack-extension.js
```

`npm test` runs every suite in `scripts/` and prints a line per suite; it takes
about ten seconds. To run one while working on it, either name it or run the
script itself:

```bash
node scripts/test-all.js --list
node scripts/test-all.js --filter errors
node scripts/test-codegen-modes.js --mode keys
```

6. After adding or removing a `@generateToken` interface, regenerate the tokens. They live in `node_modules/cosdi-tokens`, so nothing to commit. The same extension reads the project's DI, which `npm test` runs over the sample.

```bash
npm run tokens
npm run validate
```

7. Open a pull request against `master`. Say what you changed and how you tested it (Play, Diagnostics panel, or benchmark).

CI runs every suite across a matrix and packs `cosdi-diagnostics.zip` on every PR. Do not commit the zip; GitHub Actions builds it.

## What CI runs

`npm test` is run on each of these, and the packing job waits for all of them:

| Axis | Covered |
| --- | --- |
| Operating system | Linux, Windows, macOS |
| Node | 18, 20, 22, 24, 26 on Linux; 20 and 24 on Windows; 24 on macOS |
| TypeScript | 4.7, 4.9, 5.4 and the newest release, on top of the pinned one |

Creator ships its own TypeScript, which is why the runtime and everything the
generator writes is compiled against a range of them rather than the pinned
version alone. A leg failing on its own tells you where a change is
platform-specific or version-specific; nothing is cancelled when one goes red.

## Releasing

`node scripts/bump-version.js <version>` keeps `package.json`, `assets/CosDI/package.json`, `extensions/cosdi-diagnostics/package.json` and `extensions/cosdi-codegen/package.json` on the same version. All three npm packages are published from the `v*` tag.

## Code notes

- `build()` reads the registrations into a `DependencyGraph`, then validates that and reports every problem at once, loops included. Anything new that the container constructs or injects belongs in `Internal/Dependencies.ts`, which is what the graph is built from, with a case in `scripts/test-validation.js`, `scripts/test-circular.js` or `scripts/test-graph.js`.
- A resolve that fails builds its message on the way out: `Container.ts` says what is missing through `Internal/ResolutionDiagnostics.ts`, and every place that constructs or injects calls `traceResolution` to add where it asked. A new injection site needs that call and a case in `scripts/test-errors.js`. Foreign errors keep their own type and message; only their stack is added to.
- The graph is also what `container.dependencyGraph`, `dependencyGraphText` and the Diagnostics panel read, so a new provider needs a `source` in `DependencyGraph.ts` and, if the panel should draw it, a field in the snapshot in `Diagnostics/DiagnosticsContext.ts`.
- The same mistakes are read out of the sources before a build by `extensions/cosdi-codegen/lib/di-analyzer.js`, which the CLI, the save hook and the Creator build hook all call. A new rule needs a default severity there, a case in `scripts/test-di-analyzer.js`, and a row in both READMEs. It reads text, so a rule that would need types belongs in `build()` instead.
- A new suite belongs in the `SUITES` list in `scripts/test-all.js`. That list is what `npm test` and every leg of the CI matrix run, so a suite left out of it runs nowhere.
- What the generator writes is checked by compiling it: `scripts/test-codegen-modes.js` generates into a scratch project in each mode and reads the type errors TypeScript reports, so a mode that writes something unusable, or a token that comes back as `any`, fails there.
- Field `@inject(Class)`, or a bare `@inject` when the field name matches what it wants. `@injectable(Class)` on plain classes. No `@` on constructor parameters (Creator can leave `@` in the emitted JS).
- An interface is keyed by the token generated from its `/** @generateToken */` tag, imported from `cosdi-tokens`. Never hand-edit generated output, and never write a `// cosdi:token` line yourself.
- Do not put `@injectable()` on `Component` subclasses.
- Match nearby TypeScript style. No extra docs files unless the change needs them.
