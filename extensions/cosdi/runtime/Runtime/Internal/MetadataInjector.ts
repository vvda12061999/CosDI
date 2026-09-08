import { CosDIException } from '../CosDIException';
import { IInjector } from '../IInjector';
import { IInjectParameter } from '../IInjectParameter';
import { IObjectResolver } from '../IObjectResolver';
import { typeKeyName, getNamedTypeKey } from '../Token';
import { getInjectTypeInfo, InjectTypeInfo, ORIGINAL_CTOR } from './InjectMetadata';
import { resolveOrParameter } from '../IObjectResolverExtensions';

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
            const value = resolveOrParameter(
                resolver,
                prop.token,
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

export function describeInjectGraph(type: Function): string {
    const info = getInjectTypeInfo(type);
    return info.constructorParams.map((p) => typeKeyName(p.token)).join(', ');
}
