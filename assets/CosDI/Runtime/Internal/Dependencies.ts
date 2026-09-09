import { Registration } from '../Registration.ts';
import { TypeKey, getNamedTypeKey, inferTypeKey } from '../Token.ts';
import { getInjectTypeInfo } from './InjectMetadata.ts';

export type DependencyKind = 'parameter' | 'field' | 'method';

/** One thing a registration asks the container for while it is being made. */
export interface Dependency {
    readonly kind: DependencyKind;
    /** The parameter or field it lands on. */
    readonly name: string;
    /** How to say where it lands, as in `constructor parameter 'service'`. */
    readonly site: string;
    /** What to look up, worked out the way the injector works it out. */
    readonly token: TypeKey | undefined;
    readonly key: object | undefined;
}

/**
 * Reads a registration the way the injector will. Only what the container
 * itself resolves is listed: a provider that hands over a finished instance
 * asks for nothing, a component asks for its fields alone, and a value given
 * with `withParameter` never reaches the container at all.
 */
export function dependenciesOf(registration: Registration): Dependency[] {
    const injection = registration.provider.injection ?? 'none';
    const type = registration.implementationType;
    if (injection === 'none' || typeof type !== 'function') {
        return [];
    }

    const info = getInjectTypeInfo(type);
    const dependencies: Dependency[] = [];

    if (injection === 'constructor') {
        for (const param of info.constructorParams) {
            const name = param.name || `arg${param.index}`;
            dependencies.push({
                kind: 'parameter',
                name,
                site: `constructor parameter '${name}'`,
                token: param.token || getNamedTypeKey(param.name),
                key: param.key,
            });
        }
    }

    for (const prop of info.properties) {
        const name = String(prop.propertyKey);
        dependencies.push({
            kind: 'field',
            name,
            site: `field '${name}'`,
            token: prop.token || inferTypeKey(prop.name),
            key: prop.key,
        });
    }

    for (const method of info.methods) {
        for (const param of method.params) {
            const name = param.name || `arg${param.index}`;
            dependencies.push({
                kind: 'method',
                name,
                site: `${String(method.methodName)}() parameter '${name}'`,
                token: param.token,
                key: param.key,
            });
        }
    }

    const parameters = registration.provider.parameters;
    if (!parameters || parameters.length === 0) {
        return dependencies;
    }
    return dependencies.filter(
        (dependency) => !parameters.some((parameter) => parameter.match(dependency.token as TypeKey, dependency.name)),
    );
}
