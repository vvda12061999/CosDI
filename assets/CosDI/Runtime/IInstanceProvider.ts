import { IObjectResolver } from './IObjectResolver.ts';

export interface IInstanceProvider {
    spawnInstance(resolver: IObjectResolver): object;
}
