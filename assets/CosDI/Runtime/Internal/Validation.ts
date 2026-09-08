import { IScopedObjectResolver } from '../IObjectResolver.ts';
import { Registration } from '../Registration.ts';
import { TypeKey, typeKeyName } from '../Token.ts';
import { findCircularDependencies } from './CircularDependency.ts';
import { dependenciesOf } from './Dependencies.ts';
import { Registry } from './Registry.ts';

export type ValidationProblemKind = 'cycle' | 'missing' | 'keyless' | 'unconstructible';

/** One thing wrong with a registration, found before anything is resolved. */
export interface ValidationProblem {
    readonly kind: ValidationProblemKind;
    readonly registration: Registration;
    readonly type: TypeKey | null;
    readonly message: string;
    /** For a cycle: what it runs through, with the start repeated at the end. */
    readonly cycle?: readonly Registration[];
}

/**
 * Reads every registration the way the container will, and reports what would
 * fail: a loop, a dependency nothing registers, a parameter or field with no
 * key to look up, a key registered as if it were a class.
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
    const problems: ValidationProblem[] = findCircularDependencies(registrations, registry);
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
            kind: 'unconstructible',
            registration,
            type,
            message: `${typeKeyName(type)} is registered as something to construct, but it is a key, not a class. `
                + `Register the class and name it with .as(${typeKeyName(type)}), `
                + 'or hand over an instance with registerInstance / registerFactory.',
        });
        return;
    }

    const name = typeKeyName(type);
    for (const dependency of dependenciesOf(registration)) {
        if (dependency.token == null) {
            problems.push({
                kind: 'keyless',
                registration,
                type,
                message: `${name} has no key for ${dependency.site}: nothing registered goes by that name. `
                    + hint(dependency.kind, dependency.name),
            });
            continue;
        }
        if (isRegistered(dependency.token, dependency.key, registry, parent)) {
            continue;
        }
        problems.push({
            kind: 'missing',
            registration,
            type: dependency.token,
            message: `${name} asks for ${typeKeyName(dependency.token)} (${dependency.site}), which nothing registers`
                + `${dependency.key == null ? '' : ` with Key: ${String(dependency.key)}`}.`,
        });
    }
}

function hint(kind: string, name: string): string {
    if (kind === 'field') {
        return `Name the key, as in @inject(${pascal(name)}).`;
    }
    if (kind === 'parameter') {
        return `Pass it to @injectable(...) in constructor order, or give it a value with .withParameter('${name}', ...).`;
    }
    return 'Name the key on the parameter.';
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
