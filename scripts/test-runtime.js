#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { buildRuntime } = require('./build-runtime-test.js');

const compiled = buildRuntime();
const runtime = require(path.join(compiled, 'index.js'));
const {
    ContainerBuilder,
    Lifetime,
    createToken,
    inject,
    injectable,
    useEntryPoints,
    registerEntryPoint,
    IStartable,
    ITickable,
    AmbientResolver,
    CosDIException,
} = runtime;

let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log('ok   ' + name);
    } catch (error) {
        failures += 1;
        console.error('FAIL ' + name + ': ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : error));
    }
}

class PlayerService {
    constructor() {
        this.name = 'PlayerService';
    }
}

check('a token resolves the class registered under it', () => {
    const IPlayerService = createToken('IPlayerService');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);
    const container = builder.build();
    assert.strictEqual(container.resolve(IPlayerService).name, 'PlayerService');
    assert.strictEqual(container.resolve(IPlayerService), container.resolve(IPlayerService));
});

check('a name works as a key beside a token', () => {
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as('IPlayerService');
    const container = builder.build();
    assert.strictEqual(container.resolve('IPlayerService').name, 'PlayerService');
    assert.strictEqual(container.tryResolve('INothing'), null);
});

check('an unregistered key throws with its name in the message', () => {
    const container = new ContainerBuilder().build();
    assert.throws(() => container.resolve('IPlayerService'), /Nothing registers IPlayerService/);
});

check('a bare @inject finds the class the field name points at', () => {
    class Consumer {}
    inject(Consumer.prototype, 'playerService');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton);
    builder.register(Consumer, Lifetime.Transient).asSelf();
    const container = builder.build();
    assert.strictEqual(container.resolve(Consumer).playerService.name, 'PlayerService');
});

check('a bare @inject finds the interface token the field name points at', () => {
    const IPlayerService = createToken('IPlayerService2');
    class Consumer {}
    inject(Consumer.prototype, 'playerService2');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);
    builder.register(Consumer, Lifetime.Transient).asSelf();
    const container = builder.build();
    assert.strictEqual(container.resolve(Consumer).playerService2.name, 'PlayerService');
});

check('a bare @inject looks past a leading underscore', () => {
    class Consumer {}
    inject(Consumer.prototype, '_playerService');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton);
    builder.register(Consumer, Lifetime.Transient).asSelf();
    const container = builder.build();
    assert.strictEqual(container.resolve(Consumer)._playerService.name, 'PlayerService');
});

check('a named key wins over the field name', () => {
    class Other {
        constructor() {
            this.name = 'Other';
        }
    }
    class Consumer {}
    inject(Other)(Consumer.prototype, 'playerService');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton);
    builder.register(Other, Lifetime.Singleton);
    builder.register(Consumer, Lifetime.Transient).asSelf();
    const container = builder.build();
    assert.strictEqual(container.resolve(Consumer).playerService.name, 'Other');
});

check('a scope inherits what the container above it registered', () => {
    const IPlayerService = createToken('IPlayerService3');
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);
    const container = builder.build();
    const scope = container.createScope(() => {});
    assert.strictEqual(scope.resolve(IPlayerService).name, 'PlayerService');
});

check('what the sample registers builds and resolves', () => {
    const IExampleService = createToken('IExampleService');

    class ExampleService {
        constructor() {
            this.name = 'ExampleService';
        }
    }

    class Player {
        constructor(service) {
            this.service = service;
        }
    }
    const InjectablePlayer = injectable(IExampleService)(Player);

    const builder = new ContainerBuilder();
    builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
    builder.register(InjectablePlayer, Lifetime.Transient);
    const container = builder.build();

    assert.strictEqual(container.resolve(IExampleService).name, 'ExampleService');
    assert.strictEqual(container.resolve(InjectablePlayer).service.name, 'ExampleService');

    // What a LifetimeScope does for a scene, so `new Player()` finds the container.
    AmbientResolver.push(container);
    try {
        assert.strictEqual(new InjectablePlayer().service.name, 'ExampleService');
    } finally {
        AmbientResolver.pop(container);
    }
});

check('entry points build, dispatch, and pass validation', () => {
    const ticks = [];

    class GameLoop {
        start() {
            ticks.push('start');
        }

        tick(_delta) {
            ticks.push('tick');
        }
    }

    const builder = new ContainerBuilder();
    useEntryPoints(builder, Lifetime.Singleton, (entryPoints) => entryPoints.add(GameLoop));
    const container = builder.build();

    assert.ok(container.resolve(GameLoop));
    assert.strictEqual(container.resolveAll(IStartable).length, 1);
    assert.strictEqual(container.resolveAll(ITickable).length, 1);
});

check('an entry point that wants an unregistered service is refused at build', () => {
    const IMissing = createToken('IMissingEntryPointDep');

    class NeedsService {
        constructor(service) {
            this.service = service;
        }

        start() {}
    }
    const Injectable = injectable(IMissing)(NeedsService);

    const builder = new ContainerBuilder();
    registerEntryPoint(builder, Injectable, Lifetime.Singleton);
    assert.throws(() => builder.build(), /NeedsService asks for IMissingEntryPointDep/);
});

check('a LifetimeScope builds its scene container and passes validation', () => {
    const cc = require(path.join(compiled, '..', '..', 'cc-stub.js'));
    const { LifetimeScope, CosDISettings } = runtime;
    CosDISettings.enableDiagnostics = false;
    CosDISettings.autoInjectScene = false;

    const IExampleService = createToken('IExampleServiceScene');

    class ExampleService {
        constructor() {
            this.name = 'ExampleService';
        }
    }

    class GameScope extends LifetimeScope {
        configure(builder) {
            builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
        }
    }

    const scope = new GameScope();
    scope.node = new cc.Node();
    scope.node.isValid = true;
    scope.build();

    try {
        assert.strictEqual(scope.container.resolve(IExampleService).name, 'ExampleService');
    } finally {
        scope.disposeCore();
    }
});

check('resolving what a factory made still reports a missing dependency at resolve time', () => {
    const builder = new ContainerBuilder();
    builder.registerFactory(PlayerService, (resolver) => resolver.resolve('INothingAtAll'), Lifetime.Transient);
    const container = builder.build();
    assert.throws(() => container.resolve(PlayerService), CosDIException);
});

process.exit(failures ? 1 : 0);
