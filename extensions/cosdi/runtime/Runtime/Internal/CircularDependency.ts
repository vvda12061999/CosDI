import { getInjectTypeInfo } from './InjectMetadata';
import { Registry } from './Registry';
import { Registration } from '../Registration';
import { TypeKey, typeKeyName } from '../Token';
import { CosDIException } from '../CosDIException';
import { CollectionInstanceProvider } from './InstanceProviders';

export function checkCircularDependency(registrations: Registration[], registry: Registry): void {
    for (const registration of registrations) {
        if (typeof registration.implementationType !== 'function') {
            continue;
        }
        if (registration.provider instanceof CollectionInstanceProvider) {
            continue;
        }
        const stack: TypeKey[] = [];
        visit(registration.implementationType as Function, stack, registry);
    }
}

function visit(type: Function, stack: TypeKey[], registry: Registry): void {
    if (stack.indexOf(type) >= 0) {
        const cycle = [...stack, type].map(typeKeyName).join(' -> ');
        throw new CosDIException(type, `Circular dependency detected: ${cycle}`);
    }
    stack.push(type);
    const info = getInjectTypeInfo(type);
    for (const param of info.constructorParams) {
        const dep = registry.tryGet(param.token, param.key);
        if (dep && typeof dep.implementationType === 'function') {
            visit(dep.implementationType as Function, stack, registry);
        }
    }
    for (const prop of info.properties) {
        const dep = registry.tryGet(prop.token, prop.key);
        if (dep && typeof dep.implementationType === 'function') {
            visit(dep.implementationType as Function, stack, registry);
        }
    }
    stack.pop();
}
