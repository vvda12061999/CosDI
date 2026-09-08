import { IObjectResolver } from './IObjectResolver';

export interface IInstanceProvider {
    spawnInstance(resolver: IObjectResolver): object;
}
