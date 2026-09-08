<p align="center">
  <img src="docs/images/logo.png" width="120" alt="CosDI logo">
</p>

<h1 align="center">CosDI</h1>

<p align="center">
  <strong>VContainer-style dependency injection for Cocos Creator 3.8</strong>
</p>

<p align="center">
  <a href="https://github.com/vvda12061999/CosDI/stargazers"><img src="https://img.shields.io/github/stars/vvda12061999/CosDI?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/cosdi"><img src="https://img.shields.io/npm/v/cosdi" alt="npm"></a>
  <a href="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml"><img src="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Cocos%20Creator-3.8.8-00d4aa" alt="Cocos Creator 3.8.8">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
</p>

<p align="center">
  <img src="docs/images/banner.png" alt="CosDI — VContainer-style DI for Cocos Creator">
</p>

If this saves you time in a Cocos project, please **[⭐ star the repo](https://github.com/vvda12061999/CosDI)**. Stars help other Creator developers find it.

CosDI ports the [VContainer](https://github.com/hadashiA/VContainer) mental model to TypeScript: explicit tokens, `LifetimeScope`, constructor / field injection, nested scopes, and an editor diagnostics window.

---

## Install

Install CosDI like any other Creator extension. You do **not** copy folders by hand.

### Option A — Extension zip (GitHub Release)

1. Download [`cosdi.zip`](https://github.com/vvda12061999/CosDI/releases/latest/download/cosdi.zip) from the latest release.
2. Open your game in **Cocos Creator 3.8+**.
3. **Extension → Extension Manager → Project → +** (Import).
4. Select `cosdi.zip`, then **Enable** CosDI.

### Option B — npm

From your Cocos Creator **project root**:

```bash
npx cosdi install
```

Then **Extension → Extension Manager → Project → Enable CosDI**.

You can also `npm install cosdi` and copy `node_modules/cosdi` to `extensions/cosdi`.

Enabling the extension:

- Installs the DI runtime into `assets/CosDI`
- Starts the diagnostics listener
- Adds **Panel → CosDI Diagnostics**

Then import from:

```ts
import {
    Lifetime,
    LifetimeScope,
    IContainerBuilder,
    createToken,
    inject,
    injectable,
} from 'db://assets/CosDI/Runtime/index';
```

To refresh after an update: import the new zip (or run `npx cosdi install` again), then **CosDI → Install Runtime into Project**.

Creator’s packer does not honor a project `import-map.json` alias, so keep the `db://assets/CosDI/Runtime/index` path.

---

## Releasing (GitHub Actions + npm)

Every push/PR to `master` packs `cosdi.zip` in CI. Pushing a version tag publishes a [GitHub Release](https://github.com/vvda12061999/CosDI/releases) and the [`cosdi`](https://www.npmjs.com/package/cosdi) npm package.

1. Create an npm [Automation access token](https://www.npmjs.com/settings/~/tokens).
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NPM_TOKEN`
   - Value: the npm token
3. Bump the version and push a tag:

```bash
node scripts/bump-version.js 1.0.1
git add extensions/cosdi/package.json assets/CosDI/package.json
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin master --tags
```

The tag (`v1.0.1`) must match `extensions/cosdi/package.json`. You can also run the **Release** workflow manually from the Actions tab.

---

## Quick start

Cocos does **not** compile parameter / constructor `@` decorators (they can leak into JS and crash). Use field `@inject` on components, and `@injectable(token)` on plain classes.

### 1. Token + service

```ts
import { createToken } from 'db://assets/CosDI/Runtime/index';

export interface IExampleService {
    name: string;
}

export const IExampleService = createToken<IExampleService>('IExampleService');

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}
```

### 2. Register in a LifetimeScope

```ts
import { _decorator } from 'cc';
import { Lifetime, LifetimeScope, IContainerBuilder } from 'db://assets/CosDI/Runtime/index';
import { ExampleService, IExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
    }
}
```

Add `GameLifetimeScope` to a node in the scene (same role as Unity’s `LifetimeScope`).

### 3. Inject a component field

```ts
import { _decorator, Component } from 'cc';
import { inject } from 'db://assets/CosDI/Runtime/index';
import { IExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('Example')
export class Example extends Component {
    @inject(IExampleService)
    private exampleService: IExampleService;

    start() {
        console.log('Injected field', this.exampleService.name);
    }
}
```

### 4. `new Player()` fills constructor deps

```ts
import { injectable } from 'db://assets/CosDI/Runtime/index';
import { IExampleService } from './Example';

@injectable(IExampleService)
export class Player {
    constructor(service?: IExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

const player = new Player(); // IExampleService comes from the active scope
```

Pass tokens to `@injectable(...)` in **constructor argument order**.

### Lifetimes

| Lifetime | Meaning |
| --- | --- |
| `Singleton` | One instance for the registration and child scopes |
| `Scoped` | One instance per scope |
| `Transient` | New instance every resolve |

Child scopes: `scope.createChild(...)` or `container.createScope(builder => { ... })`.

---

## Proof of concept

Play a scene that has a `LifetimeScope`. Components receive field injection, and `new Player()` is constructed with the registered service:

<p align="center">
  <img src="docs/images/poc-diagnostics.png" alt="CosDI running in Cocos Creator — Example injection logs and Diagnostics panel">
</p>

The **CosDI Diagnostics** panel is a normal dockable editor tab (drag it next to Console / Inspector). Enable the `cosdi` extension, keep the panel open, then press Play. It shows the live scope tree, registrations, resolve counts, and parent inheritance.

Open it from **Panel → CosDI Diagnostics**, **Extensions → CosDI Diagnostics**, or **CosDI → Diagnostics**.

---

## Benchmark

The suite mirrors VContainer’s `ContainerPerformanceTest` (`N = 10_000`, 10 samples, 3 warmup) and adds heavier graphs (deep chain, wide deps, 200-type container, enemy spawn, nested scopes).

Run it: add **CosDIBenchmarkRunner** (`assets/Scripts/Benchmark/BenchmarkRunner.ts`) to a node and press Play.

<p align="center">
  <img src="docs/images/benchmark.png" alt="CosDI benchmark results in Game View">
</p>

Sample results from Preview in Editor on Cocos Creator 3.8.8 (diagnostics off):

| Case | Group | Median | ns/op |
| --- | --- | ---: | ---: |
| ResolveSingleton | CosDI | 0.60 ms | 20 |
| ResolveTransient | CosDI | 1.00 ms | 33 |
| ResolveScoped | CosDI | 0.80 ms | 27 |
| ResolveCombined | CosDI | 3.85 ms | 128 |
| ResolveCombined | Direct `new` | 0.60 ms | 20 |
| ResolveComplex | CosDI | 11.60 ms | 387 |
| ResolveComplex | Direct `new` | 2.60 ms | 87 |
| ContainerBuildComplex | CosDI | 67.85 ms | 6785 |

**Reading the numbers:** singleton / scoped lookup is cheap (~20–30 ns). Combined / Complex are in the same order of magnitude as plain `new` of the same graph (about 4–6×), which is fine for gameplay resolves. `Direct new` is the theoretical floor with no container.

---

## Project layout

```
extensions/cosdi/             ← import this (or cosdi.zip) in Extension Manager
  package.json
  main.js                     installs runtime + diagnostics
  runtime/                    copied into assets/CosDI on enable
  panels/                     CosDI Diagnostics editor tab
assets/Scripts/               sample scene scripts + benchmarks
cosdi.zip                     built by CI / scripts/pack-extension.js

```

---

## Notes

- Do not put `@` on constructor parameters. Creator’s compiler can leave the `@` in the emitted JS.
- Do not put `@injectable()` on `Component` subclasses. The engine constructs those; use field `@inject`.
- `CosDISettings.enableDiagnostics` defaults to `true` so the editor panel can receive play-mode data. Turn it off in shipping builds if you want zero tracer cost.
- After Enable, **CosDI → Install Runtime into Project** re-copies `assets/CosDI` if you updated the extension zip.

---

<p align="center">
  <strong>If CosDI helped you, a star means a lot.</strong><br>
  <a href="https://github.com/vvda12061999/CosDI">⭐ Star this project</a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/vvda1206">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
  </a>
</p>
