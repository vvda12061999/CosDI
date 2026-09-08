import { IInjectParameter } from '../IInjectParameter.ts';
import { IScopedObjectResolver } from '../IObjectResolver.ts';
import { Registration } from '../Registration.ts';
import { TypeKey, typeKeyName, getNamedTypeKey, inferTypeKey } from '../Token.ts';
import { getInjectTypeInfo } from './InjectMetadata.ts';
import { Registry } from './Registry.ts';

/** One thing wrong with a registration, found before anything is resolved. */
export interface ValidationProblem {
    readonly registration: Registration;
    readonly type: TypeKey | null;
    readonly message: string;
}

/**
 * Reads every registration the way the container will, and reports what would
 * fail: a dependency nothing registers, a parameter or field with no key to
 * look up, a key registered as if it were a class.
 *
 * A dependency is looked for here and in the scopes above, which is where the
 * container looks. It cannot see a scope built later, so a service that only
 * arrives in a child scope reads as missing.
 */
export function validateRegistrations(
    registrations: readonly Registration[],
    registry: Registry,
    parent: IScopedObjectResolver | null = null,
): ValidationProblem[] {
    const problems: ValidationProblem[] = [];
    for (const registration of registrations) {
        validateRegistration(registration, registry, parent, problems);
    }
    return problems;
}

function validateRegistration(
    registration: Registration,
    registry: Registry,
    parent: IScopedObjectResolver | null,
    problems: ValidationProblem[],
): void {
    const injection = registration.provider.injection ?? 'none';
    if (injection === 'none') {
        return;
    }

    const type = registration.implementationType;
    if (typeof type !== 'function') {
        problems.push({
            registration,
            type,
            message: `${typeKeyName(type)} is registered as something to construct, but it is a key, not a class. `
                + `Register the class and name it with .as(${typeKeyName(type)}), `
                + 'or hand over an instance with registerInstance / registerFactory.',
        });
        return;
    }

    const name = typeKeyName(type);
    const parameters = registration.provider.parameters ?? null;
    const info = getInjectTypeInfo(type);

    if (injection === 'constructor') {
        for (const param of info.constructorParams) {
            const paramName = param.name || `arg${param.index}`;
            check(
                param.token || getNamedTypeKey(param.name),
                `constructor parameter '${paramName}'`,
                paramName,
                param.key,
                `Pass it to @injectable(...) in constructor order, or give it a value with .withParameter('${paramName}', ...).`,
            );
        }
    }

    for (const prop of info.properties) {
        const propName = String(prop.propertyKey);
        check(
            prop.token || inferTypeKey(prop.name),
            `field '${propName}'`,
            propName,
            prop.key,
            `Name the key, as in @inject(${pascal(propName)}).`,
        );
    }

    for (const method of info.methods) {
        for (const param of method.params) {
            const paramName = param.name || `arg${param.index}`;
            check(
                param.token,
                `${String(method.methodName)}() parameter '${paramName}'`,
                paramName,
                param.key,
                'Name the key on the parameter.',
            );
        }
    }

    function check(
        token: TypeKey | undefined,
        site: string,
        siteName: string,
        key: object | undefined,
        keylessHint: string,
    ): void {
        if (matchesParameter(parameters, token, siteName)) {
            return;
        }
        if (token == null) {
            problems.push({
                registration,
                type,
                message: `${name} has no key for ${site}: nothing registered goes by that name. ${keylessHint}`,
            });
            return;
        }
        if (isRegistered(token, key, registry, parent)) {
            return;
        }
        problems.push({
            registration,
            type: token,
            message: `${name} asks for ${typeKeyName(token)} (${site}), which nothing registers`
                + `${key == null ? '' : ` with Key: ${String(key)}`}.`,
        });
    }
}

function matchesParameter(
    parameters: readonly IInjectParameter[] | null,
    token: TypeKey | undefined,
    name: string,
): boolean {
    if (!parameters) {
        return false;
    }
    for (const parameter of parameters) {
        if (parameter.match(token as TypeKey, name)) {
            return true;
        }
    }
    return false;
}

function isRegistered(
    token: TypeKey,
    key: object | undefined,
    registry: Registry,
    parent: IScopedObjectResolver | null,
): boolean {
    if (registry.exists(token, key)) {
        return true;
    }
    let scope = parent;
    while (scope != null) {
        if (scope.tryGetRegistration(token, key)) {
            return true;
        }
        scope = scope.parent;
    }
    return false;
}

function pascal(name: string): string {
    const bare = name.replace(/^_+/, '');
    return bare.charAt(0).toUpperCase() + bare.slice(1);
}
