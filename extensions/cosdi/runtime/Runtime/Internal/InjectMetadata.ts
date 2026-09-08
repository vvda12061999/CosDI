import { TypeKey } from '../Token.ts';

export interface InjectParamInfo {
    index: number;
    token: TypeKey;
    key?: object;
    name?: string;
}

export interface InjectPropInfo {
    propertyKey: string | symbol;
    token: TypeKey;
    key?: object;
}

export interface InjectMethodInfo {
    methodName: string | symbol;
    params: InjectParamInfo[];
}

export interface InjectTypeInfo {
    constructorParams: InjectParamInfo[];
    properties: InjectPropInfo[];
    methods: InjectMethodInfo[];
}

export const INJECT_CTOR_PARAMS = '__cosdi_ctorParams';
export const INJECT_PROPS = '__cosdi_props';
export const INJECT_METHODS = '__cosdi_methods';
export const INJECT_PARAM_KEYS = '__cosdi_paramKeys';
export const ORIGINAL_CTOR = '__cosdi_originalCtor';
export const IS_INJECTABLE = '__cosdi_injectable';

function getOwnArray<T>(target: object, key: string): T[] {
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
        Object.defineProperty(target, key, {
            value: [],
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return (target as any)[key] as T[];
}

export function addConstructorParam(ctor: Function, info: InjectParamInfo): void {
    const params = getOwnArray<InjectParamInfo>(ctor, INJECT_CTOR_PARAMS);
    const existing = params.find((p) => p.index === info.index);
    if (existing) {
        if (info.token !== undefined) {
            existing.token = info.token;
        }
        if (info.key !== undefined) {
            existing.key = info.key;
        }
        if (info.name !== undefined) {
            existing.name = info.name;
        }
    } else {
        params.push(info);
        params.sort((a, b) => a.index - b.index);
    }
}

export function addPropertyInject(ctor: Function, info: InjectPropInfo): void {
    const props = getOwnArray<InjectPropInfo>(ctor, INJECT_PROPS);
    const existing = props.find((p) => p.propertyKey === info.propertyKey);
    if (existing) {
        if (info.token !== undefined) {
            existing.token = info.token;
        }
        if (info.key !== undefined) {
            existing.key = info.key;
        }
        if (info.name !== undefined) {
            existing.name = info.name;
        }
    } else {
        props.push(info);
    }
}

export function addMethodParam(ctor: Function, methodName: string | symbol, info: InjectParamInfo): void {
    const methods = getOwnArray<InjectMethodInfo>(ctor, INJECT_METHODS);
    let method = methods.find((m) => m.methodName === methodName);
    if (!method) {
        method = { methodName, params: [] };
        methods.push(method);
    }
    const existing = method.params.find((p) => p.index === info.index);
    if (existing) {
        if (info.token !== undefined) {
            existing.token = info.token;
        }
        if (info.key !== undefined) {
            existing.key = info.key;
        }
        if (info.name !== undefined) {
            existing.name = info.name;
        }
    } else {
        method.params.push(info);
        method.params.sort((a, b) => a.index - b.index);
    }
}

export function addParamKey(ctor: Function, propertyKey: string | symbol | undefined, index: number, key: object): void {
    if (propertyKey === undefined) {
        addConstructorParam(ctor, { index, token: undefined as any, key });
        return;
    }
    addMethodParam(ctor, propertyKey, { index, token: undefined as any, key });
}

function collectFromPrototypeChain<T>(ctor: Function, key: string, merge: (acc: T[], own: T[]) => void): T[] {
    const result: T[] = [];
    let current: any = ctor;
    const seen = new Set<Function>();
    while (current && current !== Function.prototype && current !== Object && !seen.has(current)) {
        seen.add(current);
        if (Object.prototype.hasOwnProperty.call(current, key)) {
            merge(result, current[key] as T[]);
        }
        current = Object.getPrototypeOf(current);
        if (current && current.prototype && current.prototype.constructor && current.prototype.constructor !== current) {
            current = current.prototype.constructor;
            break;
        }
        if (current && typeof current === 'function') {
            continue;
        }
        const proto = ctor.prototype && Object.getPrototypeOf(ctor.prototype);
        if (proto && proto.constructor && proto.constructor !== ctor && proto.constructor !== Object) {
            current = proto.constructor;
            ctor = current;
            continue;
        }
        break;
    }
    return result;
}

function collectInherited(ctor: Function): InjectTypeInfo {
    const constructorParams: InjectParamInfo[] = [];
    const properties: InjectPropInfo[] = [];
    const methods: InjectMethodInfo[] = [];
    const visited = new Set<Function>();

    let current: Function | null = ctor;
    while (current && !visited.has(current)) {
        visited.add(current);
        if (Object.prototype.hasOwnProperty.call(current, INJECT_CTOR_PARAMS) && constructorParams.length === 0) {
            constructorParams.push(...((current as any)[INJECT_CTOR_PARAMS] as InjectParamInfo[]));
        }
        if (Object.prototype.hasOwnProperty.call(current, INJECT_PROPS)) {
            for (const prop of (current as any)[INJECT_PROPS] as InjectPropInfo[]) {
                if (!properties.some((p) => p.propertyKey === prop.propertyKey)) {
                    properties.push(prop);
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(current, INJECT_METHODS)) {
            for (const method of (current as any)[INJECT_METHODS] as InjectMethodInfo[]) {
                if (!methods.some((m) => m.methodName === method.methodName)) {
                    methods.push(method);
                }
            }
        }
        const proto = Object.getPrototypeOf(current.prototype || {});
        current = proto && proto.constructor !== current && proto.constructor !== Object ? proto.constructor : null;
    }

    return { constructorParams, properties, methods };
}

export function getInjectTypeInfo(ctor: Function): InjectTypeInfo {
    const original = (ctor as any)[ORIGINAL_CTOR] as Function | undefined;
    return collectInherited(original || ctor);
}

export function copyInjectMetadata(from: Function, to: Function): void {
    for (const key of [INJECT_CTOR_PARAMS, INJECT_PROPS, INJECT_METHODS]) {
        if (Object.prototype.hasOwnProperty.call(from, key)) {
            Object.defineProperty(to, key, {
                value: [...((from as any)[key] as unknown[])],
                enumerable: false,
                configurable: true,
                writable: true,
            });
        }
    }
}
