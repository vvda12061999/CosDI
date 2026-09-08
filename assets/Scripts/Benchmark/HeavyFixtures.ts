import { createToken, inject, injectable, TypeKey } from 'cosdi';

export const DEEP_DEPTH = 12;
export const WIDE_COUNT = 16;
export const FILLER_COUNT = 200;
export const PLUGIN_COUNT = 20;
export const FIELD_COUNT = 12;

export const deepTokens: TypeKey[] = [];
export const deepTypes: Function[] = [];
export const wideTokens: TypeKey[] = [];
export const wideTypes: Function[] = [];
export const fillerTokens: TypeKey[] = [];
export const fillerTypes: Function[] = [];
export const pluginTypes: Function[] = [];

export const IPlugin = createToken('IPlugin');
export const ILogger = createToken<ILogger>('ILogger');
export const IClock = createToken<IClock>('IClock');
export const IRng = createToken<IRng>('IRng');
export const IPathfinding = createToken<IPathfinding>('IPathfinding');
export const IDamage = createToken<IDamage>('IDamage');
export const IBlackboard = createToken<IBlackboard>('IBlackboard');
export const IAI = createToken<IAI>('IAI');
export const IWeapon = createToken<IWeapon>('IWeapon');
export const IStats = createToken<IStats>('IStats');
export const IEnemy = createToken<IEnemy>('IEnemy');
export const ISceneState = createToken<ISceneState>('ISceneState');
export const IPopupVm = createToken<IPopupVm>('IPopupVm');
export const IWideSystem = createToken<IWideSystem>('IWideSystem');
export const IDeepRoot = createToken('IDeepRoot');

export interface ILogger {}
export interface IClock {}
export interface IRng {}
export interface IPathfinding {}
export interface IDamage {}
export interface IBlackboard {}
export interface IAI {}
export interface IWeapon {}
export interface IStats {}
export interface IEnemy {}
export interface ISceneState {}
export interface IPopupVm {}
export interface IWideSystem {}

export class Logger implements ILogger {}
export class Clock implements IClock {}
export class Rng implements IRng {}
export class Pathfinding implements IPathfinding {}
export class Damage implements IDamage {}
export class Blackboard implements IBlackboard {}
export class Stats implements IStats {}

@injectable(IPathfinding, IBlackboard, ILogger)
export class AI implements IAI {
    constructor(pathfinding?: IPathfinding, blackboard?: IBlackboard, logger?: ILogger) {
        if (!pathfinding || !blackboard || !logger) {
            throw new Error('AI missing dependency');
        }
    }
}

@injectable(IDamage, IRng)
export class Weapon implements IWeapon {
    constructor(damage?: IDamage, rng?: IRng) {
        if (!damage || !rng) {
            throw new Error('Weapon missing dependency');
        }
    }
}

@injectable(IAI, IWeapon, IStats, ILogger, IClock)
export class Enemy implements IEnemy {
    constructor(ai?: IAI, weapon?: IWeapon, stats?: IStats, logger?: ILogger, clock?: IClock) {
        if (!ai || !weapon || !stats || !logger || !clock) {
            throw new Error('Enemy missing dependency');
        }
    }
}

export class SceneState implements ISceneState {}

@injectable(ISceneState, ILogger, IClock)
export class PopupVm implements IPopupVm {
    constructor(scene?: ISceneState, logger?: ILogger, clock?: IClock) {
        if (!scene || !logger || !clock) {
            throw new Error('PopupVm missing dependency');
        }
    }
}

export class FieldHeavy {}

export let WideSystem: Function;

(function buildGeneratedFixtures() {
    let parentToken: TypeKey | null = null;
    for (let i = 0; i < DEEP_DEPTH; i++) {
        const token = i === DEEP_DEPTH - 1 ? IDeepRoot : createToken(`Deep${i}`);
        const capturedParent = parentToken;
        class DeepNode {
            constructor(parent?: object) {
                if (capturedParent && !parent) {
                    throw new Error(`Deep${i} missing parent`);
                }
            }
        }
        Object.defineProperty(DeepNode, 'name', { value: `Deep${i}` });
        const type = capturedParent ? injectable(capturedParent)(DeepNode) as unknown as Function : DeepNode;
        deepTokens.push(token);
        deepTypes.push(type);
        parentToken = token;
    }

    for (let i = 0; i < WIDE_COUNT; i++) {
        const token = createToken(`WideSvc${i}`);
        class WideSvc {}
        Object.defineProperty(WideSvc, 'name', { value: `WideSvc${i}` });
        wideTokens.push(token);
        wideTypes.push(WideSvc);
    }

    class WideSystemImpl {
        constructor(...deps: object[]) {
            if (deps.length !== WIDE_COUNT || deps.some((dep) => !dep)) {
                throw new Error('WideSystem missing dependency');
            }
        }
    }
    Object.defineProperty(WideSystemImpl, 'name', { value: 'WideSystem' });
    WideSystem = injectable(...wideTokens)(WideSystemImpl) as unknown as Function;

    for (let i = 0; i < FILLER_COUNT; i++) {
        const token = createToken(`Filler${i}`);
        class Filler {}
        fillerTokens.push(token);
        fillerTypes.push(Filler);
    }

    for (let i = 0; i < PLUGIN_COUNT; i++) {
        class Plugin {}
        Object.defineProperty(Plugin, 'name', { value: `Plugin${i}` });
        pluginTypes.push(Plugin);
    }

    for (let i = 0; i < FIELD_COUNT; i++) {
        inject(wideTokens[i])(FieldHeavy.prototype, 's' + i);
    }
})();

export function createDeepDirect(): object {
    let current: object = new (deepTypes[0] as any)();
    for (let i = 1; i < deepTypes.length; i++) {
        current = new (deepTypes[i] as any)(current);
    }
    return current;
}

export function createWideDirect(): object {
    const services = wideTypes.map((type) => new (type as any)());
    return new (WideSystem as any)(...services);
}

export function createEnemyDirect(): object {
    const logger = new Logger();
    const clock = new Clock();
    const rng = new Rng();
    const pathfinding = new Pathfinding();
    const damage = new Damage();
    return new Enemy(
        new AI(pathfinding, new Blackboard(), logger),
        new Weapon(damage, rng),
        new Stats(),
        logger,
        clock,
    );
}
