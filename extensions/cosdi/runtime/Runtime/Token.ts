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

export type TypeKey = Function | Token;

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
