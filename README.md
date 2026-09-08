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

## Contents

1. [Installation](#1-installation)
2. [Quick start](#2-quick-start)
   - [Service](#service)
   - [Register in a LifetimeScope](#register-in-a-lifetimescope)
   - [Inject a component field](#inject-a-component-field)
   - [`new Player()` fills constructor deps](#new-player-fills-constructor-deps)
3. [Proof of concept](#3-proof-of-concept)
4. [Benchmark](#4-benchmark)
   - [Environment](#environment)
5. [Notes](#5-notes)
6. [How to contribute](#6-how-to-contribute)
7. [Bug reports](#7-bug-reports)
8. [How to support](#8-how-to-support)

---

## 1. Installation

1. Download [`cosdi.zip`](https://github.com/vvda12061999/CosDI/releases/latest/download/cosdi.zip).
2. Open your game in **Cocos Creator 3.8+**.
3. **Extension → Extension Manager**.
4. Open the **Project** tab and click **+** (Import).
5. Select `cosdi.zip`.
6. Find **CosDI** in the list and **Enable** it.
7. **Project → Project Settings → Scripting → Import Maps** → choose `import-map.json`, then restart Creator if Play cannot find `cosdi`.

Then use:

```ts
import { LifetimeScope, inject, injectable } from 'cosdi';
```

---

## 2. Quick start

Cocos does **not** compile parameter / constructor `@` decorators. Use field `@inject` on components, and `@injectable(Class)` on plain classes.

### Service

The class is the service. No interface or token required.

```ts
export class ExampleService {
    name = 'ExampleService';
}
```

### Register in a LifetimeScope

```ts
import { _decorator } from 'cc';
import { LifetimeScope, IContainerBuilder } from 'cosdi';
import { ExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService);
    }
}
```

Add `GameLifetimeScope` to a node in the scene. `register` is a singleton unless you pass `Lifetime.Scoped` or `Lifetime.Transient`.

### Inject a component field

```ts
import { _decorator, Component } from 'cc';
import { inject } from 'cosdi';
import { ExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('Example')
export class Example extends Component {
    @inject(ExampleService)
    private exampleService: ExampleService;

    start() {
        console.log('Injected field', this.exampleService.name);
    }
}
```

### `new Player()` fills constructor deps

```ts
import { injectable } from 'cosdi';
import { ExampleService } from './Example';

@injectable(ExampleService)
export class Player {
    constructor(service?: ExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

const player = new Player();
```

Pass classes to `@injectable(...)` in constructor-argument order.

To bind an interface instead of the class, use `createToken` and `.as(token)`.

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

Add **CosDIBenchmarkRunner** to a node and press Play. Results appear in Game View and in **Panel → CosDI Diagnostics**.

### Environment

Sample numbers below were taken on this setup. Your times will differ.

| Item | Value |
| --- | --- |
| Engine | Cocos Creator 3.8.8 |
| Mode | Preview in Editor |
| OS | Windows 11 Pro (build 26200) |
| CPU | Intel Core i7-14700K |
| RAM | 32 GB |
| Diagnostics | Off during the run (`CosDISettings.enableDiagnostics = false`) |

<p align="center">
  <img src="docs/images/benchmark.png" alt="CosDI benchmark results in Game View">
</p>

Sample results:

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

## 6. How to contribute

See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

1. Fork and branch from `master`.
2. Edit `assets/CosDI/` (runtime) or `extensions/cosdi/` (extension).
3. Run `node scripts/pack-extension.js` after runtime changes.
4. Open a pull request. Describe the change and how you tested it.

---

## 7. Bug reports

Open a **[Bug report](https://github.com/vvda12061999/CosDI/issues/new?template=bug_report.yml)** on GitHub.

Include Creator version, OS, CosDI version, steps to reproduce, expected vs actual, and logs or a screenshot.

Feature ideas: **[Feature request](https://github.com/vvda12061999/CosDI/issues/new?template=feature_request.yml)**.

---

## 8. How to support

See **[SUPPORT.md](SUPPORT.md)**.

- [⭐ Star the repo](https://github.com/vvda12061999/CosDI) so other Creator developers can find it
- [Buy Me a Coffee](https://buymeacoffee.com/vvda1206) if you want to support development

<p align="center">
  <a href="https://buymeacoffee.com/vvda1206">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
  </a>
</p>
