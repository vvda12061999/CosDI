#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { buildRuntime } = require('./build-runtime-test.js');

const compiled = buildRuntime();
const runtime = require(path.join(compiled, 'index.js'));
const { addMethodParam } = require(path.join(compiled, 'Internal', 'InjectMetadata.js'));
const { COLLECTION_ANY_KEY } = require(path.join(compiled, 'Internal', 'InstanceProviders.js'));
const {
    ContainerBuilder,
    Lifetime,
    createToken,
    inject,
    injectable,
    key,
    CosDIValidationException,
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

/** Runs build() and hands back the loop it refused with. */
function refusal(configure, options) {
    const builder = new ContainerBuilder();
    if (options && options.validateOnBuild === false) {
        builder.validateOnBuild = false;
    }
    configure(builder);
    try {
        builder.build();
    } catch (error) {
        if (error instanceof CosDIValidationException) {
            return error;
        }
        throw error;
    }
    throw new Error('build() was expected to refuse a circular dependency');
}

function builds(configure) {
    const builder = new ContainerBuilder();
    configure(builder);
    return builder.build();
}

check('two classes that need each other are refused, naming both and where they ask', () => {
    const IPlayer = createToken('ICyclePlayer');
    const IInventory = createToken('ICycleInventory');

    class PlayerService {
        constructor(inventory) {
            this.inventory = inventory;
        }
    }
    class InventoryService {
        constructor(player) {
            this.player = player;
        }
    }
    const Player = injectable(IInventory)(PlayerService);
    const Inventory = injectable(IPlayer)(InventoryService);

    const error = refusal((builder) => {
        builder.register(Player, Lifetime.Singleton).as(IPlayer);
        builder.register(Inventory, Lifetime.Singleton).as(IInventory);
    });

    assert.strictEqual(error.problems.length, 1);
    assert.strictEqual(error.problems[0].kind, 'cycle');
    assert.match(
        error.problems[0].message,
        /Circular dependency detected: PlayerService -> InventoryService \(constructor parameter 'inventory'\) -> PlayerService \(constructor parameter 'player'\)/,
    );
    assert.match(error.problems[0].message, /Break it by taking IObjectResolver/);
    assert.strictEqual(error.problems[0].cycle.length, 3);
});

check('a class that needs itself is refused', () => {
    const ISelf = createToken('ICycleSelf');
    class SelfService {
        constructor(self) {
            this.self = self;
        }
    }
    const Self = injectable(ISelf)(SelfService);
    const error = refusal((builder) => builder.register(Self, Lifetime.Singleton).as(ISelf));
    assert.match(error.message, /Circular dependency detected: SelfService -> SelfService \(constructor parameter 'self'\)/);
});

check('a loop through injected fields is refused', () => {
    const IFieldA = createToken('ICycleFieldA');
    const IFieldB = createToken('ICycleFieldB');
    class FieldA {}
    class FieldB {}
    inject(IFieldB)(FieldA.prototype, 'b');
    inject(IFieldA)(FieldB.prototype, 'a');

    const error = refusal((builder) => {
        builder.register(FieldA, Lifetime.Singleton).as(IFieldA);
        builder.register(FieldB, Lifetime.Singleton).as(IFieldB);
    });
    assert.match(error.message, /FieldA -> FieldB \(field 'b'\) -> FieldA \(field 'a'\)/);
});

check('a loop through a bare @inject is refused', () => {
    class BareA {}
    class BareB {}
    inject(BareA.prototype, 'bareB');
    inject(BareB.prototype, 'bareA');

    const error = refusal((builder) => {
        builder.register(BareA, Lifetime.Singleton).asSelf();
        builder.register(BareB, Lifetime.Singleton).asSelf();
    });
    assert.match(error.message, /BareA -> BareB \(field 'bareB'\) -> BareA \(field 'bareA'\)/);
});

check('a loop through an injected method is refused', () => {
    const IMethodA = createToken('ICycleMethodA');
    const IMethodB = createToken('ICycleMethodB');
    class MethodA {
        setUp(_b) {}
    }
    class MethodB {
        setUp(_a) {}
    }
    addMethodParam(MethodA, 'setUp', { index: 0, token: IMethodB, name: 'b' });
    addMethodParam(MethodB, 'setUp', { index: 0, token: IMethodA, name: 'a' });

    const error = refusal((builder) => {
        builder.register(MethodA, Lifetime.Singleton).as(IMethodA);
        builder.register(MethodB, Lifetime.Singleton).as(IMethodB);
    });
    assert.match(error.message, /MethodA -> MethodB \(setUp\(\) parameter 'b'\) -> MethodA \(setUp\(\) parameter 'a'\)/);
});

check('a loop of three is refused, once rather than once per class', () => {
    const IOne = createToken('ICycleOne');
    const ITwo = createToken('ICycleTwo');
    const IThree = createToken('ICycleThree');
    class One {
        constructor(two) {
            this.two = two;
        }
    }
    class Two {
        constructor(three) {
            this.three = three;
        }
    }
    class Three {
        constructor(one) {
            this.one = one;
        }
    }
    const A = injectable(ITwo)(One);
    const B = injectable(IThree)(Two);
    const C = injectable(IOne)(Three);

    const error = refusal((builder) => {
        builder.register(A, Lifetime.Singleton).as(IOne);
        builder.register(B, Lifetime.Singleton).as(ITwo);
        builder.register(C, Lifetime.Singleton).as(IThree);
    });
    assert.strictEqual(error.problems.length, 1);
    assert.match(error.message, /One -> Two \(constructor parameter 'two'\) -> Three \(constructor parameter 'three'\) -> One \(constructor parameter 'one'\)/);
});

check('two separate loops are both reported', () => {
    const tokens = ['A', 'B', 'C', 'D'].map((letter) => createToken('ICyclePair' + letter));
    const classes = ['A', 'B', 'C', 'D'].map((letter) => ({
        [`Pair${letter}`]: class {
            constructor(other) {
                this.other = other;
            }
        },
    })[`Pair${letter}`]);
    injectable(tokens[1])(classes[0]);
    injectable(tokens[0])(classes[1]);
    injectable(tokens[3])(classes[2]);
    injectable(tokens[2])(classes[3]);

    const error = refusal((builder) => {
        for (let i = 0; i < 4; i++) {
            builder.register(classes[i], Lifetime.Singleton).as(tokens[i]);
        }
    });
    assert.strictEqual(error.problems.filter((problem) => problem.kind === 'cycle').length, 2);
});

check('a factory breaks the loop, as it does at runtime', () => {
    const IFactoryA = createToken('ICycleFactoryA');
    const IFactoryB = createToken('ICycleFactoryB');
    class FactoryA {
        constructor(b) {
            this.b = b;
        }
    }
    class FactoryB {
        constructor(a) {
            this.a = a;
        }
    }
    injectable(IFactoryB)(FactoryA);
    const B = injectable(IFactoryA)(FactoryB);

    const container = builds((builder) => {
        builder.registerFactory(FactoryA, () => new FactoryA(null), Lifetime.Singleton).as(IFactoryA);
        builder.register(B, Lifetime.Singleton).as(IFactoryB);
    });
    assert.ok(container.resolve(IFactoryB));
});

check('a registered instance breaks the loop', () => {
    const IInstanceA = createToken('ICycleInstanceA');
    const IInstanceB = createToken('ICycleInstanceB');
    class InstanceA {}
    class InstanceB {
        constructor(a) {
            this.a = a;
        }
    }
    inject(IInstanceB)(InstanceA.prototype, 'b');
    const B = injectable(IInstanceA)(InstanceB);

    builds((builder) => {
        builder.registerInstance(new InstanceA(), IInstanceA);
        builder.register(B, Lifetime.Singleton).as(IInstanceB);
    });
});

check('withParameter breaks the loop', () => {
    const IGivenA = createToken('ICycleGivenA');
    const IGivenB = createToken('ICycleGivenB');
    class GivenA {
        constructor(b) {
            this.b = b;
        }
    }
    class GivenB {
        constructor(a) {
            this.a = a;
        }
    }
    const A = injectable(IGivenB)(GivenA);
    const B = injectable(IGivenA)(GivenB);

    const container = builds((builder) => {
        builder.register(A, Lifetime.Singleton).as(IGivenA).withParameter(IGivenB, { standIn: true });
        builder.register(B, Lifetime.Singleton).as(IGivenB);
    });
    assert.strictEqual(container.resolve(IGivenA).b.standIn, true);
});

check('a loop is caught even with validation turned off', () => {
    const IOffA = createToken('ICycleOffA');
    const IOffB = createToken('ICycleOffB');
    class OffA {
        constructor(b) {
            this.b = b;
        }
    }
    class OffB {
        constructor(a) {
            this.a = a;
        }
    }
    const A = injectable(IOffB)(OffA);
    const B = injectable(IOffA)(OffB);

    const error = refusal((builder) => {
        builder.register(A, Lifetime.Singleton).as(IOffA);
        builder.register(B, Lifetime.Singleton).as(IOffB);
    }, { validateOnBuild: false });
    assert.strictEqual(error.problems.length, 1);
    assert.strictEqual(error.problems[0].kind, 'cycle');
});

check('a shared dependency reached twice is not a loop', () => {
    const IShared = createToken('ICycleShared');
    const ILeft = createToken('ICycleLeft');
    const IRight = createToken('ICycleRight');
    const ITop = createToken('ICycleTop');

    class Shared {}
    class Left {
        constructor(shared) {
            this.shared = shared;
        }
    }
    class Right {
        constructor(shared) {
            this.shared = shared;
        }
    }
    class Top {
        constructor(left, right) {
            this.left = left;
            this.right = right;
        }
    }
    const L = injectable(IShared)(Left);
    const R = injectable(IShared)(Right);
    const T = injectable(ILeft, IRight)(Top);

    const container = builds((builder) => {
        builder.register(Shared, Lifetime.Singleton).as(IShared);
        builder.register(L, Lifetime.Singleton).as(ILeft);
        builder.register(R, Lifetime.Singleton).as(IRight);
        builder.register(T, Lifetime.Singleton).as(ITop);
    });
    assert.ok(container.resolve(ITop).left.shared);
});

check('a graph wide enough to walk twice over stays quick', () => {
    // Every level needs the two below it, so following each path separately
    // grows about 1.6x per level: 34 levels took seconds before.
    const levels = 34;
    const tokens = [];
    const classes = [];
    for (let i = 0; i < levels; i++) {
        tokens.push(createToken('ICycleLevel' + i));
        const built = i >= 2
            ? { ['Level' + i]: class { constructor(a, b) { this.a = a; this.b = b; } } }['Level' + i]
            : { ['Level' + i]: class {} }['Level' + i];
        injectable(...(i >= 2 ? [tokens[i - 1], tokens[i - 2]] : []))(built);
        classes.push(built);
    }

    const started = Date.now();
    builds((builder) => {
        for (let i = 0; i < levels; i++) {
            builder.register(classes[i], Lifetime.Singleton).as(tokens[i]);
        }
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 500, `building ${levels} levels took ${elapsed} ms`);
});

check('a loop through one of many registrations of a contract is refused', () => {
    const IHandler = createToken('ICycleHandler');
    const IHub = createToken('ICycleHub');

    class QuietHandler {}
    class LoudHandler {
        constructor(hub) {
            this.hub = hub;
        }
    }
    class Hub {}
    // The whole collection, the way resolveAll asks for it.
    inject(IHandler)(Hub.prototype, 'handlers');
    key(COLLECTION_ANY_KEY)(Hub.prototype, 'handlers');
    const Loud = injectable(IHub)(LoudHandler);

    const error = refusal((builder) => {
        builder.register(QuietHandler, Lifetime.Singleton).as(IHandler);
        builder.register(Loud, Lifetime.Singleton).as(IHandler);
        builder.register(Hub, Lifetime.Singleton).as(IHub);
    });
    assert.match(error.message, /Circular dependency detected/);
    assert.match(error.message, /LoudHandler/);
    assert.match(error.message, /Hub/);
    assert.match(error.message, /field 'handlers'/);
});

check('the same class registered under two keys is not a loop', () => {
    const IRed = createToken('ICycleRed');
    const IBlue = createToken('ICycleBlue');
    const IBridge = createToken('ICycleBridge');

    class Paint {}
    class Bridge {
        constructor(red) {
            this.red = red;
        }
    }
    const B = injectable(IRed)(Bridge);
    inject(IBridge)(Paint.prototype, 'bridge');

    const container = builds((builder) => {
        builder.register(Paint, Lifetime.Transient).as(IBlue);
        builder.registerInstance(new Paint(), IRed);
        builder.register(B, Lifetime.Singleton).as(IBridge);
    });
    assert.ok(container.resolve(IBridge).red);
});

process.exit(failures ? 1 : 0);
