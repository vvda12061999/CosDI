import { IInjector } from '../IInjector';
import { MetadataInjector } from './MetadataInjector';

const injectors = new Map<Function, IInjector>();

export class InjectorCache {
    static getOrBuild(type: Function): IInjector {
        let injector = injectors.get(type);
        if (!injector) {
            injector = MetadataInjector.build(type);
            injectors.set(type, injector);
        }
        return injector;
    }

    static clear(): void {
        injectors.clear();
    }
}
