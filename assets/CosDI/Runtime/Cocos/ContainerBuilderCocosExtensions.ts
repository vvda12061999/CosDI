import { Component, Constructor, Node, Prefab } from 'cc';
import { IContainerBuilder } from '../ContainerBuilder.ts';
import { RegistrationBuilder } from '../RegistrationBuilder.ts';
import { Lifetime } from '../Lifetime.ts';
import { IObjectResolver } from '../IObjectResolver.ts';
import { ComponentRegistrationBuilder } from './ComponentRegistrationBuilder.ts';
import { EntryPointDispatcher } from './EntryPointDispatcher.ts';
import { EntryPointExceptionHandler } from './EntryPointExceptionHandler.ts';

export class EntryPointsBuilder {
    static ensureDispatcherRegistered(containerBuilder: IContainerBuilder): void {
        if (containerBuilder.exists(EntryPointDispatcher, false)) {
            return;
        }
        containerBuilder.register(EntryPointDispatcher, Lifetime.Scoped);

        if (!containerBuilder.exists(EntryPointExceptionHandler)) {
            containerBuilder.registerFactory(
                EntryPointExceptionHandler,
                () => new EntryPointExceptionHandler((error) => console.error(error)),
                Lifetime.Scoped,
            );
        }

        containerBuilder.registerBuildCallback((container) => {
            container.resolve(EntryPointDispatcher).dispatch();
        });
    }

    constructor(
        private readonly containerBuilder: IContainerBuilder,
        private readonly lifetime: Lifetime,
    ) {}

    add(type: Function): RegistrationBuilder {
        return this.containerBuilder.register(type, this.lifetime).asImplementedInterfaces();
    }

    onException(exceptionHandler: (error: Error) => void): void {
        registerEntryPointExceptionHandler(this.containerBuilder, exceptionHandler);
    }
}

export function useEntryPoints(
    builder: IContainerBuilder,
    lifetimeOrConfig: Lifetime | ((configuration: EntryPointsBuilder) => void),
    configuration?: (builder: EntryPointsBuilder) => void,
): void {
    if (typeof lifetimeOrConfig === 'function') {
        EntryPointsBuilder.ensureDispatcherRegistered(builder);
        lifetimeOrConfig(new EntryPointsBuilder(builder, Lifetime.Singleton));
        return;
    }
    EntryPointsBuilder.ensureDispatcherRegistered(builder);
    configuration?.(new EntryPointsBuilder(builder, lifetimeOrConfig));
}

export function registerEntryPoint(
    builder: IContainerBuilder,
    type: Function,
    lifetime: Lifetime = Lifetime.Singleton,
): RegistrationBuilder {
    EntryPointsBuilder.ensureDispatcherRegistered(builder);
    return builder.register(type, lifetime).asImplementedInterfaces();
}

export function registerEntryPointExceptionHandler(
    builder: IContainerBuilder,
    exceptionHandler: (error: Error) => void,
): RegistrationBuilder {
    return builder.registerFactory(
        EntryPointExceptionHandler,
        () => new EntryPointExceptionHandler(exceptionHandler),
        Lifetime.Scoped,
    );
}

export function registerComponent(builder: IContainerBuilder, component: Component): ComponentRegistrationBuilder {
    const registrationBuilder = ComponentRegistrationBuilder.fromInstance(component).as(component.constructor as Function);
    builder.registerBuildCallback((container) => {
        container.resolve(registrationBuilder.implementationType, registrationBuilder.key);
    });
    return builder.registerBuilder(registrationBuilder);
}

export function registerComponentInHierarchy(
    builder: IContainerBuilder,
    type: Constructor<Component>,
): ComponentRegistrationBuilder {
    const lifetimeScope = builder.applicationOrigin as { node?: Node } | null;
    const searchRoot = lifetimeScope?.node ?? null;
    const registrationBuilder = ComponentRegistrationBuilder.fromHierarchy(type, searchRoot);
    builder.registerBuildCallback((container) => {
        const contract = registrationBuilder.getInterfaceTypes()?.[0] ?? registrationBuilder.implementationType;
        container.resolve(contract, registrationBuilder.key);
    });
    return builder.registerBuilder(registrationBuilder);
}

export function registerComponentOnNewNode(
    builder: IContainerBuilder,
    type: Constructor<Component>,
    lifetime: Lifetime,
    nodeName?: string,
): ComponentRegistrationBuilder {
    return builder.registerBuilder(ComponentRegistrationBuilder.fromNewNode(type, lifetime, nodeName ?? null));
}

export function registerComponentInNewPrefab(
    builder: IContainerBuilder,
    type: Constructor<Component>,
    prefab: Prefab | Node | Component | ((resolver: IObjectResolver) => Prefab | Node | Component),
    lifetime: Lifetime,
): ComponentRegistrationBuilder {
    const finder = typeof prefab === 'function'
        ? prefab
        : () => prefab;
    const registrationBuilder = ComponentRegistrationBuilder.fromPrefab(finder, type, lifetime);
    return builder.registerBuilder(registrationBuilder);
}
