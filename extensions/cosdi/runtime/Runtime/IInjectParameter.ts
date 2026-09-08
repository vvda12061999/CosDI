import { IObjectResolver } from './IObjectResolver';
import { TypeKey } from './Token';

export interface IInjectParameter {
    match(parameterType: TypeKey, parameterName: string): boolean;
    getValue(resolver: IObjectResolver): unknown;
}
