<p align="center">
  <img src="docs/images/logo.png" width="120" alt="CosDI logo">
</p>

<h1 align="center">CosDI</h1>

<p align="center">
  <strong>VContainer-style dependency injection for Cocos Creator 3.x</strong>
</p>

<p align="center">
  <a href="https://github.com/vvda12061999/CosDI/stargazers"><img src="https://img.shields.io/github/stars/vvda12061999/CosDI?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/cosdi"><img src="https://img.shields.io/npm/v/cosdi" alt="npm"></a>
  <a href="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml"><img src="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Cocos%20Creator-3.0%2B-00d4aa" alt="Cocos Creator 3.0+">
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
   - [Interface token](#interface-token)
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

In your Cocos Creator project:

```bash
npm install cosdi
```

Or from GitHub:

```bash
npm install git+https://github.com/vvda12061999/CosDI.git
```

Then:

```ts
import { LifetimeScope, inject, injectable } from 'cosdi';
```

For the Diagnostics editor panel, also import [`cosdi.zip`](https://github.com/vvda12061999/CosDI/releases/latest/download/cosdi.zip) in **Extension → Extension Manager → Project**.

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

### Interface token

Cocos erases `interface`, so it cannot hold a runtime token. Keep the interface and let `createToken` supply the value under the same name:

```ts
export interface IExampleService {
    name: string;
}
export const IExampleService = createToken<IExampleService>('IExampleService');

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}
```

`IExampleService` is now the interface in type position and the token in value position, so the same name works everywhere:

```ts
builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);

@inject(IExampleService)
private exampleService: IExampleService;
```

The token carries the interface type, so resolving it needs no cast:

```ts
const service = container.resolve(IExampleService); // IExampleService
```

No abstract class is required. `@createToken` on a class still works when you want a class to keep its own key.

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
| ResolveSingleton | CosDI | 0.70 ms | 23 |
| ResolveTransient | CosDI | 1.50 ms | 50 |
| ResolveCombined | CosDI | 4.10 ms | 137 |
| ResolveCombined | Direct `new` | 0.60 ms | 20 |
| ResolveComplex | CosDI | 11.60 ms | 387 |
| ResolveComplex | Direct `new` | 2.40 ms | 80 |
| SpawnEnemy | CosDI | 4.30 ms | 430 |
| SpawnEnemy | Direct `new` | 0.70 ms | 70 |
| ContainerBuildComplex | CosDI | 71.75 ms | 7175 |

Singleton lookup is ~23 ns. Combined / Complex stay in the same order of magnitude as plain `new` (about 5–7×). Keep diagnostics off for timing runs; the tracer case is ~180× slower on purpose.

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
