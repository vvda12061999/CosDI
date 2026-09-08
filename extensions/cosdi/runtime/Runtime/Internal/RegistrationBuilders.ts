import { RegistrationBuilder } from '../RegistrationBuilder.ts';
import { IObjectResolver } from '../IObjectResolver.ts';
import { TypeKey } from '../Token.ts';
import { Lifetime } from '../Lifetime.ts';
import { Registration } from '../Registration.ts';
import { FuncInstanceProvider, ExistingInstanceProvider } from './InstanceProviders.ts';

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
