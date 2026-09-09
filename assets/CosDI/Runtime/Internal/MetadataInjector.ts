import { CosDIException, traceResolution } from '../CosDIException.ts';
import { IInjector } from '../IInjector.ts';
import { IInjectParameter } from '../IInjectParameter.ts';
import { IObjectResolver } from '../IObjectResolver.ts';
import { TypeKey, typeKeyName, getNamedTypeKey, inferTypeKey } from '../Token.ts';
import { getInjectTypeInfo, InjectTypeInfo, ORIGINAL_CTOR } from './InjectMetadata.ts';
import { resolveOrParameter } from '../IObjectResolverExtensions.ts';

export class MetadataInjector implements IInjector {
    static build(type: Function): MetadataInjector {
        return new MetadataInjector(type, getInjectTypeInfo(type));
    }

    private constructor(
        private readonly type: Function,
        private readonly info: InjectTypeInfo,
    ) {}

    resolveConstructorParams(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): unknown[] {
        const params = this.info.constructorParams;
        if (params.length === 0) {
            return [];
        }
        let asking = '';
        try {
            return params.map((param) => {
                const name = param.name || `arg${param.index}`;
                asking = name;
                const token = param.token || getNamedTypeKey(param.name);
                return resolveOrParameter(resolver, token, name, parameters, param.key);
            });
        } catch (ex) {
            traceResolution(ex, this.type, `constructor parameter '${asking}'`);
            throw ex;
        }
    }

    createInstance(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): object {
        const ctor = ((this.type as any)[ORIGINAL_CTOR] as Function) || this.type;
        const args = this.resolveConstructorParams(resolver, parameters);
        let instance;
        try {
            instance = Reflect.construct(ctor, args);
        } catch (ex) {
            traceResolution(ex, this.type, 'constructor');
            throw ex;
        }
        this.inject(instance, resolver, parameters);
        return instance;
    }

    inject(instance: object, resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): void {
        let asking = '';
        try {
            for (const prop of this.info.properties) {
                const name = String(prop.propertyKey);
                asking = name;
                const token = prop.token || inferTypeKey(prop.name);
                if (token == null && !matchesParameter(parameters, name)) {
                    throw new CosDIException(
                        this.type,
                        `@inject on ${this.type.name}.${name} has nothing to go on: `
                        + 'no registration is named after the field. Name the key, as in '
                        + `@inject(${name.charAt(0).toUpperCase()}${name.slice(1)}).`,
                    );
                }
                (instance as any)[prop.propertyKey] = resolveOrParameter(
                    resolver,
                    token as TypeKey,
                    name,
                    parameters,
                    prop.key,
                );
            }
        } catch (ex) {
            traceResolution(ex, this.type, `field '${asking}'`);
            throw ex;
        }

        for (const method of this.info.methods) {
            const fn = (instance as any)[method.methodName];
            if (typeof fn !== 'function') {
                continue;
            }
            let asking = '';
            try {
                const args = method.params.map((param) => {
                    const name = param.name || `arg${param.index}`;
                    asking = name;
                    return resolveOrParameter(resolver, param.token, name, parameters, param.key);
                });
                asking = '';
                fn.apply(instance, args);
            } catch (ex) {
                const site = asking
                    ? `method '${String(method.methodName)}' parameter '${asking}'`
                    : `method '${String(method.methodName)}'`;
                traceResolution(ex, this.type, site);
                throw ex;
            }
        }
    }
}

function matchesParameter(parameters: readonly IInjectParameter[] | null, name: string): boolean {
    if (!parameters) {
        return false;
    }
    for (const parameter of parameters) {
        if (parameter.match(undefined as unknown as TypeKey, name)) {
            return true;
        }
    }
    return false;
}

export function describeInjectGraph(type: Function): string {
    const info = getInjectTypeInfo(type);
    return info.constructorParams.map((p) => typeKeyName(p.token)).join(', ');
}
