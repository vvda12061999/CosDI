import { IObjectResolver } from './IObjectResolver';
import { IInjectParameter } from './IInjectParameter';

export interface IInjector {
    inject(instance: object, resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): void;
    createInstance(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): object;
    resolveConstructorParams(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): unknown[];
}
