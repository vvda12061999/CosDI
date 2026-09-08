import { CosDIException } from '../CosDIException.ts';
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
        try {
            return params.map((param) => {
                const token = param.token || getNamedTypeKey(param.name);
                return resolveOrParameter(
                    resolver,
                    token,
                    param.name || `arg${param.index}`,
                    parameters,
                    param.key,
                );
            });
        } catch (ex) {
            if (ex instanceof CosDIException) {
                throw new CosDIException(
                    ex.invalidType,
                    `Failed to resolve ${this.type.name} : ${ex.message}`,
                );
            }
            throw ex;
        }
    }

    createInstance(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): object {
        const ctor = ((this.type as any)[ORIGINAL_CTOR] as Function) || this.type;
        const args = this.resolveConstructorParams(resolver, parameters);
        const instance = Reflect.construct(ctor, args);
        this.inject(instance, resolver, parameters);
        return instance;
    }

    inject(instance: object, resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): void {
        for (const prop of this.info.properties) {
            const token = prop.token || inferTypeKey(prop.name);
            if (token == null && !matchesParameter(parameters, String(prop.propertyKey))) {
                throw new CosDIException(
                    this.type,
                    `@inject on ${this.type.name}.${String(prop.propertyKey)} has nothing to go on: `
                    + 'no registration is named after the field. Name the key, as in '
                    + `@inject(${String(prop.propertyKey).charAt(0).toUpperCase()}${String(prop.propertyKey).slice(1)}).`,
                );
            }
            const value = resolveOrParameter(
                resolver,
                token as TypeKey,
                String(prop.propertyKey),
                parameters,
                prop.key,
            );
            (instance as any)[prop.propertyKey] = value;
        }

        for (const method of this.info.methods) {
            const fn = (instance as any)[method.methodName];
            if (typeof fn !== 'function') {
                continue;
            }
            try {
                const args = method.params.map((param) =>
                    resolveOrParameter(
                        resolver,
                        param.token,
                        param.name || `arg${param.index}`,
                        parameters,
                        param.key,
                    ),
                );
                fn.apply(instance, args);
            } catch (ex) {
                if (ex instanceof CosDIException) {
                    throw new CosDIException(
                        ex.invalidType,
                        `Failed to resolve ${this.type.name}.${String(method.methodName)} : ${ex.message}`,
                    );
                }
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
