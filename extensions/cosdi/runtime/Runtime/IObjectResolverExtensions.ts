import { IObjectResolver } from './IObjectResolver.ts';
import { IInjectParameter } from './IInjectParameter.ts';
import { Registration } from './Registration.ts';
import { TypeKey, TypeKeyOf } from './Token.ts';

export function resolveOf<T>(resolver: IObjectResolver, type: TypeKeyOf<T>, key?: object): T;
export function resolveOf<T = object>(resolver: IObjectResolver, type: TypeKey, key?: object): T;
export function resolveOf<T>(resolver: IObjectResolver, type: TypeKey, key?: object): T {
    return resolver.resolve(type, key) as T;
}

export function tryResolveOf<T>(resolver: IObjectResolver, type: TypeKeyOf<T>, key?: object): T | null;
export function tryResolveOf<T = object>(resolver: IObjectResolver, type: TypeKey, key?: object): T | null;
export function tryResolveOf<T>(resolver: IObjectResolver, type: TypeKey, key?: object): T | null {
    return resolver.tryResolve(type, key) as T | null;
}

export function resolveOrDefault<T>(
    resolver: IObjectResolver,
    type: TypeKeyOf<T>,
    defaultValue?: T | null,
    key?: object,
): T | null;
export function resolveOrDefault<T = object>(
    resolver: IObjectResolver,
    type: TypeKey,
    defaultValue?: T | null,
    key?: object,
): T | null;
export function resolveOrDefault<T>(
    resolver: IObjectResolver,
    type: TypeKey,
    defaultValue: T | null = null,
    key?: object,
): T | null {
    const value = resolver.tryResolve(type, key);
    return value != null ? (value as T) : defaultValue;
}

export function resolveAllOf<T>(resolver: IObjectResolver, type: TypeKeyOf<T>): T[];
export function resolveAllOf<T = object>(resolver: IObjectResolver, type: TypeKey): T[];
export function resolveAllOf<T>(resolver: IObjectResolver, type: TypeKey): T[] {
    return resolver.resolveAll(type) as T[];
}

export function resolveOrParameter(
    resolver: IObjectResolver,
    parameterType: TypeKey,
    parameterName: string,
    parameters: readonly IInjectParameter[] | null,
    key?: object,
): unknown {
    if (parameters) {
        for (let i = 0; i < parameters.length; i++) {
            const parameter = parameters[i];
            if (parameter.match(parameterType, parameterName)) {
                return parameter.getValue(resolver);
            }
        }
    }
    return resolver.resolve(parameterType, key);
}

export function isRegistration(value: TypeKey | Registration): value is Registration {
    return value != null && typeof value === 'object' && 'provider' in value && 'implementationType' in value;
}
