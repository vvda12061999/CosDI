import type { ServiceTypes } from './index.ts';

export type { ServiceTypes };

export class Token<T = unknown> {
    readonly name: string;

    constructor(name: string) {
        this.name = name;
        registerNamedTypeKey(name, this);
    }

    toString(): string {
        return `Token(${this.name})`;
    }
}

/**
 * Carries the service type through the API. Merged in as an interface so it
 * stays in the type system: Creator only allows `declare` class fields when
 * the project enables `allowDeclareFields`.
 */
export interface Token<T = unknown> {
    readonly type: T;
}

export type TypeKey = Function | Token | string;

export type Constructor<T = unknown> = abstract new (...args: any[]) => T;

/** A runtime key that resolves to `T`: either an interface token or a class. */
export type TypeKeyOf<T> = Token<T> | Constructor<T>;

/** A key that `ServiceTypes` gives a type to. */
export type ServiceKey = Extract<keyof ServiceTypes, string>;

/** A known key, without closing the door on keys the map has not seen. */
export type ServiceKeyHint = ServiceKey | (string & {});

const namedTypeKeys = new Map<string, TypeKey>();

export function registerNamedTypeKey(name: string, type: TypeKey): void {
    if (name) {
        namedTypeKeys.set(name, type);
    }
}

export function getNamedTypeKey(name: string | undefined): TypeKey | undefined {
    if (!name) {
        return undefined;
    }
    return namedTypeKeys.get(name);
}

/**
 * Works out what a member called `playerService` asks for when `@inject` is
 * given nothing: the class `PlayerService`, or the interface `IPlayerService`.
 * Registering a class or creating a token is what puts a name in reach.
 */
export function inferTypeKey(name: string | undefined): TypeKey | undefined {
    if (!name) {
        return undefined;
    }
    const bare = name.replace(/^_+/, '').replace(/[$_]+$/, '');
    if (!bare) {
        return undefined;
    }
    const pascal = bare.charAt(0).toUpperCase() + bare.slice(1);
    return getNamedTypeKey(bare) || getNamedTypeKey(pascal) || getNamedTypeKey('I' + pascal);
}

/**
 * Creates the runtime key for a type Cocos erases at compile time.
 *
 * A token is only needed when the key has to be a value. The interface name
 * works as a key on its own — `builder.register(ExampleService).as('IExampleService')`
 * — and leaves the interface file holding nothing but the interface.
 *
 * Reach for a token when you want the key to survive a rename, or to be
 * unambiguous under minification:
 *
 * ```ts
 * export interface IExampleService {
 *     name: string;
 * }
 * export const IExampleService = createToken<IExampleService>('IExampleService');
 * ```
 *
 * Passing a class instead registers that class as its own key, which is only
 * needed when the class name has to survive minification.
 */
export function createToken<T>(name: string): Token<T>;
export function createToken<T extends Function>(target: T): T;
export function createToken(): ClassDecorator;
export function createToken(target?: string | Function): Token | Function | ClassDecorator {
    if (target == null) {
        return ((ctor: Function) => decorateTypeKey(ctor)) as ClassDecorator;
    }
    if (typeof target === 'string') {
        return new Token(target);
    }
    return decorateTypeKey(target);
}

function decorateTypeKey<T extends Function>(ctor: T): T {
    registerNamedTypeKey(ctor.name, ctor);
    return ctor;
}

export function typeKeyName(type: TypeKey | null | undefined): string {
    if (type == null) {
        return 'unknown';
    }
    if (typeof type === 'string') {
        return type;
    }
    if (type instanceof Token) {
        return type.name;
    }
    return type.name || String(type);
}

export function isToken(value: unknown): value is Token {
    return value instanceof Token;
}

/** True for a key given by name, such as `'IExampleService'`. */
export function isServiceKey(value: unknown): value is string {
    return typeof value === 'string';
}
