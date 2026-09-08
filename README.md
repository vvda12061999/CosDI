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

## 1. Installation

1. Download [`cosdi.zip`](https://github.com/vvda12061999/CosDI/releases/latest/download/cosdi.zip).
2. Open your game in **Cocos Creator 3.8+**.
3. **Extension → Extension Manager**.
4. Open the **Project** tab and click **+** (Import).
5. Select `cosdi.zip`.
6. Find **CosDI** in the list and **Enable** it.

Then use:

```ts
import { Lifetime, LifetimeScope, createToken, inject, injectable } from 'cosdi';
```

---

## 2. Quick start

Cocos does **not** compile parameter / constructor `@` decorators. Use field `@inject` on components, and `@injectable(token)` on plain classes.

### Token + service

```ts
import { createToken } from 'cosdi';

export interface IExampleService {
    name: string;
}

export const IExampleService = createToken<IExampleService>('IExampleService');

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}
```

### Register in a LifetimeScope

```ts
import { _decorator } from 'cc';
import { Lifetime, LifetimeScope, IContainerBuilder } from 'cosdi';
import { ExampleService, IExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
    }
}
```

Add `GameLifetimeScope` to a node in the scene.

### Inject a component field

```ts
import { _decorator, Component } from 'cc';
import { inject } from 'cosdi';
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

### `new Player()` fills constructor deps

```ts
import { injectable } from 'cosdi';
import { IExampleService } from './Example';

@injectable(IExampleService)
export class Player {
    constructor(service?: IExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

const player = new Player();
```

Pass tokens to `@injectable(...)` in constructor-argument order.

| Lifetime | Meaning |
| --- | --- |
| `Singleton` | One instance for the registration and child scopes |
| `Scoped` | One instance per scope |
| `Transient` | New instance every resolve |

---

## 3. Proof of concept

Play a scene that has a `LifetimeScope`. Components receive field injection, and `new Player()` is constructed with the registered service.

<p align="center">
  <img src="docs/images/poc-diagnostics.png" alt="CosDI running in Cocos Creator — Example injection logs and Diagnostics panel">
</p>

**CosDI Diagnostics** is a dockable editor tab (drag it next to Console). Keep it open, press Play, and it shows the live scope tree. Open it from **Panel → CosDI Diagnostics**.

---

## 4. Benchmark

The suite mirrors VContainer’s `ContainerPerformanceTest` (`N = 10_000`, 10 samples, 3 warmup), plus heavier graphs.

Add **CosDIBenchmarkRunner** to a node and press Play.

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

Singleton / scoped lookup is ~20–30 ns. Combined / Complex stay in the same order of magnitude as plain `new` (about 4–6×).

---

## 5. Notes

- Do not put `@` on constructor parameters.
- Do not put `@injectable()` on `Component` subclasses. Use field `@inject`.
- `CosDISettings.enableDiagnostics` defaults to `true` for the editor panel. Turn it off in shipping builds if you want zero tracer cost.

---

## 6. Releasing

Every push/PR to `master` packs `cosdi.zip` in CI. A version tag publishes a [GitHub Release](https://github.com/vvda12061999/CosDI/releases) and [`cosdi` on npm](https://www.npmjs.com/package/cosdi).

Add an npm Automation token as the `NPM_TOKEN` GitHub Actions secret, then:

```bash
node scripts/bump-version.js 1.0.1
git add extensions/cosdi/package.json assets/CosDI/package.json
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin master --tags
```

The tag must match `extensions/cosdi/package.json`.

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
