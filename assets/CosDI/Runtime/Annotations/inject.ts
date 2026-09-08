import { TypeKey } from '../Token';
import { addPropertyInject } from '../Internal/InjectMetadata';

/**
 * Field injector. Cocos Creator does not compile parameter or constructor
 * decorators (it can leave `@` in the emitted JS). Use `@injectable(token)` on
 * the class for constructor dependencies.
 */
export function inject(token: TypeKey): PropertyDecorator {
    return (target: object, propertyKey: string | symbol) => {
        const ctor = (target as { constructor: Function }).constructor;
        addPropertyInject(ctor, { propertyKey, token });
    };
}
