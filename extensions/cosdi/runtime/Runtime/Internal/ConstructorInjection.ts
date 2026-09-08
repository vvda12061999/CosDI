import { TypeKey, getNamedTypeKey, registerNamedTypeKey } from '../Token';
import { addConstructorParam, getInjectTypeInfo } from './InjectMetadata';
import { InjectorCache } from './InjectorCache';

export function parseConstructorParamNames(ctor: Function): string[] {
    const source = ctor.toString();
    const ctorMatch = source.match(/constructor\s*\(([^)]*)\)/);
    const fnMatch = ctorMatch ? null : source.match(/^(?:async\s+)?(?:function\s+)?[\w$]*\s*\(([^)]*)\)/);
    const raw = (ctorMatch || fnMatch)?.[1];
    if (!raw || !raw.trim()) {
        return [];
    }
    return raw.split(',').map((part) => {
        let name = part.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '').trim();
        if (!name) {
            return '';
        }
        name = name.replace(/^\.\.\./, '');
        name = name.replace(/=[\s\S]*$/, '').trim();
        return name;
    }).filter((name) => !!name);
}

function getDesignParamTypes(ctor: Function): Function[] | undefined {
    const reflect = (globalThis as any).Reflect;
    if (!reflect || typeof reflect.getMetadata !== 'function') {
        return undefined;
    }
    const types = reflect.getMetadata('design:paramtypes', ctor);
    return Array.isArray(types) ? types : undefined;
}

export function applyConstructorInjection(ctor: Function, explicitTokens?: readonly TypeKey[]): void {
    const names = parseConstructorParamNames(ctor);
    const designTypes = getDesignParamTypes(ctor);
    const count = Math.max(
        names.length,
        explicitTokens?.length ?? 0,
        designTypes?.length ?? 0,
        getInjectTypeInfo(ctor).constructorParams.length,
    );

    for (let index = 0; index < count; index++) {
        const name = names[index];
        const explicit = explicitTokens?.[index];
        const named = getNamedTypeKey(name);
        const design = designTypes?.[index];
        const designToken = design && design !== Object && design !== Function ? design : undefined;
        const token = explicit ?? named ?? designToken;
        if (!token && !name) {
            continue;
        }
        addConstructorParam(ctor, {
            index,
            token: token as TypeKey,
            name: name || `arg${index}`,
        });
        if (typeof token === 'function' && token.name) {
            registerNamedTypeKey(token.name, token);
        }
    }

    InjectorCache.clear();
}
