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
node scripts/check-versions.js
node scripts/test-runtime.js
node scripts/test-validation.js
node scripts/test-circular.js
node scripts/test-graph.js
node scripts/test-di-analyzer.js
node scripts/test-validate-cli.js
node scripts/test-diagnostics-install.js
node scripts/test-codegen-install.js
node scripts/pack-extension.js
```

6. After adding or removing a `@generateToken` interface, regenerate the tokens. They live in `node_modules/cosdi-tokens`, so nothing to commit. The same extension reads the project's DI, which CI runs over the sample.

```bash
node scripts/generate-tokens.js
node extensions/cosdi-codegen/bin/cosdi-codegen.js validate --project . --strict
```

7. When you touch `extensions/cosdi-codegen/lib/token-codegen.js`, run its tests.

```bash
node scripts/test-token-codegen.js
```

8. Open a pull request against `master`. Say what you changed and how you tested it (Play, Diagnostics panel, or benchmark).

CI runs those checks and packs `cosdi-diagnostics.zip` on every PR. Do not commit the zip; GitHub Actions builds it.

## Releasing

`node scripts/bump-version.js <version>` keeps `package.json`, `assets/CosDI/package.json`, `extensions/cosdi-diagnostics/package.json` and `extensions/cosdi-codegen/package.json` on the same version. All three npm packages are published from the `v*` tag.

## Code notes

- `build()` reads the registrations into a `DependencyGraph`, then validates that and reports every problem at once, loops included. Anything new that the container constructs or injects belongs in `Internal/Dependencies.ts`, which is what the graph is built from, with a case in `scripts/test-validation.js`, `scripts/test-circular.js` or `scripts/test-graph.js`.
- The graph is also what `container.dependencyGraph`, `dependencyGraphText` and the Diagnostics panel read, so a new provider needs a `source` in `DependencyGraph.ts` and, if the panel should draw it, a field in the snapshot in `Diagnostics/DiagnosticsContext.ts`.
- The same mistakes are read out of the sources before a build by `extensions/cosdi-codegen/lib/di-analyzer.js`, which the CLI, the save hook and the Creator build hook all call. A new rule needs a default severity there, a case in `scripts/test-di-analyzer.js`, and a row in both READMEs. It reads text, so a rule that would need types belongs in `build()` instead.
- Field `@inject(Class)`, or a bare `@inject` when the field name matches what it wants. `@injectable(Class)` on plain classes. No `@` on constructor parameters (Creator can leave `@` in the emitted JS).
- An interface is keyed by the token generated from its `/** @generateToken */` tag, imported from `cosdi-tokens`. Never hand-edit generated output, and never write a `// cosdi:token` line yourself.
- Do not put `@injectable()` on `Component` subclasses.
- Match nearby TypeScript style. No extra docs files unless the change needs them.
