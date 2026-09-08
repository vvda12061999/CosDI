#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildRuntime } = require('./build-runtime-test.js');

const path = require('path');

const compiled = buildRuntime();
const runtime = require(path.join(compiled, 'index.js'));
const {
    ContainerBuilder,
    Lifetime,
    createToken,
    inject,
    injectable,
    key,
    CosDIValidationException,
    CosDIException,
    ObjectResolverToken,
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

/** Runs build() and hands back the validation exception it refused with. */
function refusal(configure) {
    const builder = new ContainerBuilder();
    configure(builder);
    try {
        builder.build();
    } catch (error) {
        if (error instanceof CosDIValidationException) {
            return error;
        }
        throw error;
    }
    throw new Error('build() was expected to refuse these registrations');
}

function builds(configure) {
    const builder = new ContainerBuilder();
    configure(builder);
    return builder.build();
}

class Service {
    constructor() {
        this.name = 'Service';
    }
}

check('a dependency nothing registers is named, with the class that wants it', () => {
    const IMissing = createToken('IMissing');
    class Consumer {}
    injectable(IMissing)(Consumer);
    const error = refusal((builder) => builder.register(Consumer, Lifetime.Singleton));
    assert.strictEqual(error.problems.length, 1);
    assert.match(error.problems[0].message, /Consumer asks for IMissing \(constructor parameter 'arg0'\), which nothing registers/);
});

check('every problem is reported by the same build', () => {
    const IMissing = createToken('IMissing');
    const IAlsoMissing = createToken('IAlsoMissing');
    class First {}
    class Second {}
    injectable(IMissing)(First);
    injectable(IAlsoMissing)(Second);
    const error = refusal((builder) => {
        builder.register(First, Lifetime.Singleton);
        builder.register(Second, Lifetime.Singleton);
    });
    assert.strictEqual(error.problems.length, 2);
    assert.match(error.message, /found 2 problems/);
    assert.match(error.message, /IMissing/);
    assert.match(error.message, /IAlsoMissing/);
});

check('a registered dependency passes', () => {
    const IService = createToken('IService');
    class Consumer {
        constructor(service) {
            this.service = service;
        }
    }
    const Injectable = injectable(IService)(Consumer);
    const container = builds((builder) => {
        builder.register(Service, Lifetime.Singleton).as(IService);
        builder.register(Injectable, Lifetime.Singleton).asSelf();
    });
    assert.strictEqual(container.resolve(Injectable).service.name, 'Service');
});

check('a constructor parameter with no key at all is reported', () => {
    class Consumer {
        constructor(somethingNobodyRegistered) {
            this.value = somethingNobodyRegistered;
        }
    }
    injectable()(Consumer);
    const error = refusal((builder) => builder.register(Consumer, Lifetime.Singleton));
    assert.match(error.problems[0].message, /has no key for constructor parameter 'somethingNobodyRegistered'/);
    assert.match(error.problems[0].message, /@injectable\(\.\.\.\)/);
});

check('a key registered as if it were a class is reported', () => {
    const IService = createToken('IService');
    const error = refusal((builder) => builder.register(IService, Lifetime.Singleton));
    assert.match(error.problems[0].message, /IService is registered as something to construct, but it is a key, not a class/);
    assert.match(error.problems[0].message, /\.as\(IService\)/);
});

check('a string key registered as if it were a class is reported', () => {
    const error = refusal((builder) => builder.register('IPlayerService', Lifetime.Singleton));
    assert.match(error.problems[0].message, /IPlayerService is registered as something to construct/);
});

check('a field nothing registers is reported', () => {
    const IMissing = createToken('IMissing');
    class Consumer {}
    inject(IMissing)(Consumer.prototype, 'missing');
    const error = refusal((builder) => builder.register(Consumer, Lifetime.Singleton).asSelf());
    assert.match(error.problems[0].message, /Consumer asks for IMissing \(field 'missing'\), which nothing registers/);
});

check('a bare @inject that the field name answers for passes', () => {
    class Consumer {}
    inject(Consumer.prototype, 'service');
    const container = builds((builder) => {
        builder.register(Service, Lifetime.Singleton);
        builder.register(Consumer, Lifetime.Singleton).asSelf();
    });
    assert.strictEqual(container.resolve(Consumer).service.name, 'Service');
});

check('a bare @inject on a name nothing answers to is reported', () => {
    class Consumer {}
    inject(Consumer.prototype, 'noSuchThing');
    const error = refusal((builder) => builder.register(Consumer, Lifetime.Singleton).asSelf());
    assert.match(error.problems[0].message, /Consumer has no key for field 'noSuchThing'/);
    assert.match(error.problems[0].message, /@inject\(NoSuchThing\)/);
});

check('withParameter stands in for a registration, by name and by type', () => {
    const IMissing = createToken('IMissing');
    class ByName {
        constructor(amount) {
            this.amount = amount;
        }
    }
    class ByType {}
    injectable()(ByName);
    injectable(IMissing)(ByType);
    const container = builds((builder) => {
        builder.register(ByName, Lifetime.Singleton).asSelf().withParameter('amount', 42);
        builder.register(ByType, Lifetime.Singleton).asSelf().withParameter(IMissing, { name: 'given' });
    });
    assert.strictEqual(container.resolve(ByName).amount, 42);
});

check('an instance or a factory is left alone, since the container builds neither', () => {
    const IMissing = createToken('IMissing');
    class Handmade {}
    inject(IMissing)(Handmade.prototype, 'missing');
    builds((builder) => {
        builder.registerInstance(new Handmade());
        builder.registerFactory(Service, () => new Handmade(), Lifetime.Singleton);
    });
});

check('a keyed registration answers a keyed field, and a different key does not', () => {
    const IService = createToken('IService');
    const RED = { name: 'red' };
    const BLUE = { name: 'blue' };
    class Consumer {}
    inject(IService)(Consumer.prototype, 'service');
    key(RED)(Consumer.prototype, 'service');

    builds((builder) => {
        builder.register(Service, Lifetime.Singleton).as(IService).keyed(RED);
        builder.register(Consumer, Lifetime.Singleton).asSelf();
    });

    const error = refusal((builder) => {
        builder.register(Service, Lifetime.Singleton).as(IService).keyed(BLUE);
        builder.register(Consumer, Lifetime.Singleton).asSelf();
    });
    assert.match(error.problems[0].message, /which nothing registers with Key/);
});

check('the resolver itself is a dependency like any other', () => {
    class Consumer {
        constructor(resolver) {
            this.resolver = resolver;
        }
    }
    const Injectable = injectable(ObjectResolverToken)(Consumer);
    const container = builds((builder) => builder.register(Injectable, Lifetime.Singleton).asSelf());
    assert.ok(container.resolve(Injectable).resolver);
});

check('a scope can lean on what its parent registered', () => {
    const IService = createToken('IService');
    class Consumer {
        constructor(service) {
            this.service = service;
        }
    }
    const Injectable = injectable(IService)(Consumer);
    const container = builds((builder) => builder.register(Service, Lifetime.Singleton).as(IService));
    const scope = container.createScope((builder) => builder.register(Injectable, Lifetime.Scoped).asSelf());
    assert.strictEqual(scope.resolve(Injectable).service.name, 'Service');
});

check('a scope missing a dependency is refused too', () => {
    const IMissing = createToken('IMissing');
    class Consumer {}
    const Injectable = injectable(IMissing)(Consumer);
    const container = builds(() => {});
    assert.throws(
        () => container.createScope((builder) => builder.register(Injectable, Lifetime.Scoped).asSelf()),
        (error) => error instanceof CosDIValidationException && /IMissing/.test(error.message),
    );
});

check('validateOnBuild = false builds what validation would refuse', () => {
    const IMissing = createToken('IMissing');
    class Consumer {}
    const Injectable = injectable(IMissing)(Consumer);
    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Injectable, Lifetime.Singleton).asSelf();
    const container = builder.build();
    assert.throws(() => container.resolve(Injectable), CosDIException);
});

check('validateByDefault carries to every builder made after it', () => {
    const IMissing = createToken('IMissing');
    class Consumer {}
    const Injectable = injectable(IMissing)(Consumer);
    ContainerBuilder.validateByDefault = false;
    try {
        const builder = new ContainerBuilder();
        builder.register(Injectable, Lifetime.Singleton).asSelf();
        builder.build();
    } finally {
        ContainerBuilder.validateByDefault = true;
    }
});

check('a cycle still reports as a cycle', () => {
    class A {}
    class B {}
    const IA = createToken('CycleA');
    const IB = createToken('CycleB');
    injectable(IB)(A);
    injectable(IA)(B);
    const builder = new ContainerBuilder();
    builder.register(A, Lifetime.Singleton).as(IA);
    builder.register(B, Lifetime.Singleton).as(IB);
    assert.throws(() => builder.build(), /Circular dependency detected/);
});

check('a provider that only fills fields is checked for fields, not for constructor parameters', () => {
    const { Registration, validateRegistrations } = runtime;
    const { Registry } = require(path.join(compiled, 'Internal', 'Registry.js'));
    const IMissing = createToken('IMissing');

    class Component {
        constructor(engineOwned) {
            this.engineOwned = engineOwned;
        }
    }
    injectable()(Component);
    inject(IMissing)(Component.prototype, 'missing');

    const fieldsOnly = {
        injection: 'fields',
        spawnInstance() {
            return new Component();
        },
    };
    const registration = new Registration(Component, Lifetime.Singleton, [Component], fieldsOnly);
    const problems = validateRegistrations([registration], Registry.build([registration]));
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0].message, /field 'missing'/);
});

process.exit(failures ? 1 : 0);
