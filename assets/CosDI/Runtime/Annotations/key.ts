import { addPropertyInject } from '../Internal/InjectMetadata';

export function key(keyValue: object): PropertyDecorator {
    return (target: object, propertyKey: string | symbol) => {
        const ctor = (target as { constructor: Function }).constructor;
        addPropertyInject(ctor, { propertyKey, token: undefined as any, key: keyValue });
    };
}
