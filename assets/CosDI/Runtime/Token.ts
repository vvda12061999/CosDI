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

export type TypeKey = Function | Token;

export type Constructor<T = unknown> = abstract new (...args: any[]) => T;

/** A runtime key that resolves to `T`: either an interface token or a class. */
export type TypeKeyOf<T> = Token<T> | Constructor<T>;

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
 * Creates the runtime key for a type Cocos erases at compile time.
 *
 * For an interface, declare the token next to it under the same name. The
 * interface stays a type, the token becomes its value, and `IExampleService`
 * then works in both positions:
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
    if (type instanceof Token) {
        return type.name;
    }
    return type.name || String(type);
}

export function isToken(value: unknown): value is Token {
    return value instanceof Token;
}
