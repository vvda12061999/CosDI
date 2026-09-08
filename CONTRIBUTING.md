# Contributing to CosDI

Thanks for helping. This repo is developed in Cocos Creator **3.8.8**. The installable `cosdi` zip supports **Creator 3.0+**.

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
3. Change the library in `assets/CosDI/` (runtime) or `extensions/cosdi/` (editor extension).
4. Keep the sample in `assets/Scripts/` working (`import { ... } from 'cosdi'`).
5. After runtime changes, refresh the packaged extension:

```bash
node scripts/pack-extension.js
```

6. Open a pull request against `master`. Say what you changed and how you tested it (Play, Diagnostics panel, or benchmark).

CI packs `cosdi.zip` on every PR. Do not commit `cosdi.zip`; GitHub Actions builds it.

## Code notes

- Field `@inject(Class)` on components. `@injectable(Class)` on plain classes. No `@` on constructor parameters (Creator can leave `@` in the emitted JS).
- Do not put `@injectable()` on `Component` subclasses.
- Match nearby TypeScript style. No extra docs files unless the change needs them.
