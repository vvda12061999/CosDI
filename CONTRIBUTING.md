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
5. After touching the extension or its install CLI:

```bash
node scripts/check-versions.js
node scripts/test-diagnostics-install.js
node scripts/pack-extension.js
```

6. After adding or removing an exported interface, regenerate the service key map. CI fails when it is stale.

```bash
node scripts/generate-tokens.js
```

7. When you touch `extensions/cosdi-codegen/lib/token-codegen.js`, run its tests.

```bash
node scripts/test-token-codegen.js
```

8. Open a pull request against `master`. Say what you changed and how you tested it (Play, Diagnostics panel, or benchmark).

CI runs those checks and packs `cosdi-diagnostics.zip` on every PR. Do not commit the zip; GitHub Actions builds it.

## Releasing

`node scripts/bump-version.js <version>` keeps `package.json`, `assets/CosDI/package.json` and `extensions/cosdi-diagnostics/package.json` on the same version. Both npm packages are published from the `v*` tag.

## Code notes

- Field `@inject(Class)` on components. `@injectable(Class)` on plain classes. No `@` on constructor parameters (Creator can leave `@` in the emitted JS).
- An interface is keyed by its name: `.as('IExampleService')`, `@inject('IExampleService')`. `cosdi-service-keys.d.ts` is generated, so never edit it by hand, and neither a `// cosdi:token` line.
- Do not put `@injectable()` on `Component` subclasses.
- Match nearby TypeScript style. No extra docs files unless the change needs them.
