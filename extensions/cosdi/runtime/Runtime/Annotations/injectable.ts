import { AmbientResolver } from '../AmbientResolver.ts';
import { InjectorCache } from '../Internal/InjectorCache.ts';
import { ORIGINAL_CTOR, IS_INJECTABLE, copyInjectMetadata } from '../Internal/InjectMetadata.ts';
import { applyConstructorInjection } from '../Internal/ConstructorInjection.ts';
import { TypeKey } from '../Token.ts';

export function wrapInjectable(ctor: Function): Function {
    if ((ctor as any)[IS_INJECTABLE]) {
        return ctor;
    }

    const proxy = new Proxy(ctor, {
        construct(target: Function, args: unknown[], newTarget: Function) {
            if (args.length === 0 && !AmbientResolver.constructing) {
                const resolver = AmbientResolver.require(target);
                const injector = InjectorCache.getOrBuild(target);
                AmbientResolver.constructing = true;
                try {
                    return injector.createInstance(resolver, null);
                } finally {
                    AmbientResolver.constructing = false;
                }
            }
            return Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
        },
        get(target, property, receiver) {
            if (property === ORIGINAL_CTOR) {
                return target;
            }
            if (property === IS_INJECTABLE) {
                return true;
            }
            return Reflect.get(target, property, receiver);
        },
    });

    Object.defineProperty(proxy, ORIGINAL_CTOR, { value: ctor, enumerable: false });
    Object.defineProperty(proxy, IS_INJECTABLE, { value: true, enumerable: false });
    Object.defineProperty(ctor, ORIGINAL_CTOR, { value: ctor, enumerable: false });
    Object.defineProperty(ctor, IS_INJECTABLE, { value: true, enumerable: false });
    copyInjectMetadata(ctor, proxy as Function);
    return proxy;
}

/**
 * Marks a class for constructor injection. Pass tokens in constructor-argument
 * order. Do not place this on the constructor itself — Cocos cannot compile that.
 */
export function injectable(...tokens: TypeKey[]): ClassDecorator {
    return ((target: Function) => {
        applyConstructorInjection(target, tokens.length > 0 ? tokens : undefined);
        return wrapInjectable(target) as any;
    }) as ClassDecorator;
}
