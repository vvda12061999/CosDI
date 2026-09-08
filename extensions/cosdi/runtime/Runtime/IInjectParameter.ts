import { IObjectResolver } from './IObjectResolver.ts';
import { TypeKey } from './Token.ts';

export interface IInjectParameter {
    match(parameterType: TypeKey, parameterName: string): boolean;
    getValue(resolver: IObjectResolver): unknown;
}
