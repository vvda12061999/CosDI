import { createToken } from '../Token';

export interface IInitializable {
    initialize(): void;
}
export const IInitializable = createToken<IInitializable>('IInitializable');

export interface IPostInitializable {
    postInitialize(): void;
}
export const IPostInitializable = createToken<IPostInitializable>('IPostInitializable');

export interface IStartable {
    start(): void;
}
export const IStartable = createToken<IStartable>('IStartable');

export interface IPostStartable {
    postStart(): void;
}
export const IPostStartable = createToken<IPostStartable>('IPostStartable');

export interface ITickable {
    tick(deltaTime: number): void;
}
export const ITickable = createToken<ITickable>('ITickable');

export interface IPostTickable {
    postTick(deltaTime: number): void;
}
export const IPostTickable = createToken<IPostTickable>('IPostTickable');

export interface ILateTickable {
    lateTick(deltaTime: number): void;
}
export const ILateTickable = createToken<ILateTickable>('ILateTickable');

export interface IAsyncStartable {
    startAsync(): Promise<void>;
}
export const IAsyncStartable = createToken<IAsyncStartable>('IAsyncStartable');
