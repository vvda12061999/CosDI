import { RegistrationBuilder } from '../RegistrationBuilder';
import { IObjectResolver } from '../IObjectResolver';
import { TypeKey } from '../Token';
import { Lifetime } from '../Lifetime';
import { Registration } from '../Registration';
import { FuncInstanceProvider, ExistingInstanceProvider } from './InstanceProviders';

export class FuncRegistrationBuilder extends RegistrationBuilder {
    constructor(
        private readonly implementationProvider: (resolver: IObjectResolver) => object,
        implementationType: TypeKey,
        lifetime: Lifetime,
    ) {
        super(implementationType, lifetime);
    }

    build(): Registration {
        const spawner = new FuncInstanceProvider(this.implementationProvider);
        return new Registration(this.implementationType, this.lifetime, this.interfaceTypes, spawner, this.key);
    }
}

export class InstanceRegistrationBuilder extends RegistrationBuilder {
    constructor(private readonly implementationInstance: object) {
        super(implementationInstance.constructor, Lifetime.Singleton);
    }

    build(): Registration {
        const spawner = new ExistingInstanceProvider(this.implementationInstance);
        return new Registration(this.implementationType, this.lifetime, this.interfaceTypes, spawner, this.key);
    }
}
