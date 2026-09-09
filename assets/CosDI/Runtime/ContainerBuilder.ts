import { DiagnosticsCollector } from '../Diagnostics/DiagnosticsCollector.ts';
import { RegisterInfo } from '../Diagnostics/RegisterInfo.ts';
import { RegistrationBuilder } from './RegistrationBuilder.ts';
import { Registration } from './Registration.ts';
import { Registry } from './Internal/Registry.ts';
import { Container, ScopedContainer } from './Container.ts';
import { IObjectResolver, IScopedObjectResolver, ObjectResolverToken } from './IObjectResolver.ts';
import { TypeKey, registerNamedTypeKey } from './Token.ts';
import { ContainerInstanceProvider } from './Internal/InstanceProviders.ts';
import { Lifetime } from './Lifetime.ts';
import { DependencyGraph, buildDependencyGraph } from './DependencyGraph.ts';
import { cycleProblems } from './Internal/CircularDependency.ts';
import { validateGraph } from './Internal/Validation.ts';
import { CosDIValidationException } from './CosDIException.ts';
import { FuncRegistrationBuilder, InstanceRegistrationBuilder } from './Internal/RegistrationBuilders.ts';

/** What a build produces: the lookup table, and the graph read off it. */
export interface BuiltRegistry {
    readonly registry: Registry;
    readonly graph: DependencyGraph;
}

export interface IContainerBuilder {
    applicationOrigin: object | null;
    diagnostics: DiagnosticsCollector | null;
    validateOnBuild: boolean;
    keepDependencyGraph: boolean;
    readonly count: number;
    get(index: number): RegistrationBuilder;
    set(index: number, value: RegistrationBuilder): void;
    registerBuilder<T extends RegistrationBuilder>(registrationBuilder: T): T;
    register(type: TypeKey, lifetime?: Lifetime): RegistrationBuilder;
    registerInstance(instance: object, asType?: TypeKey): RegistrationBuilder;
    registerFactory<T>(type: TypeKey, factory: (resolver: IObjectResolver) => T, lifetime?: Lifetime): RegistrationBuilder;
    registerBuildCallback(callback: (container: IObjectResolver) => void): void;
    exists(type: TypeKey, includeInterfaceTypes?: boolean, findParentScopes?: boolean): boolean;
    dependencyGraph(): DependencyGraph;
    build(): IObjectResolver;
}

export class ContainerBuilder implements IContainerBuilder {
    /**
     * What every new builder starts with. Validation reads the registrations
     * before anything is resolved and reports what would fail, which costs a
     * pass over them at build time.
     */
    static validateByDefault = true;

    /**
     * Whether a container holds on to the graph it was built from. The graph
     * is read either way, since validation needs it; keeping it costs a few
     * hundred bytes per scope and is what the diagnostics panel draws.
     */
    static keepGraphByDefault = true;

    applicationOrigin: object | null = null;

    /** Set to false to build registrations validation would refuse. */
    validateOnBuild: boolean = ContainerBuilder.validateByDefault;

    /** Set to false to leave `container.dependencyGraph` empty. */
    keepDependencyGraph: boolean = ContainerBuilder.keepGraphByDefault;
    private _diagnostics: DiagnosticsCollector | null = null;
    private readonly registrationBuilders: RegistrationBuilder[] = [];
    private buildCallback: ((container: IObjectResolver) => void) | null = null;

    get count(): number {
        return this.registrationBuilders.length;
    }

    get diagnostics(): DiagnosticsCollector | null {
        return this._diagnostics;
    }

    set diagnostics(value: DiagnosticsCollector | null) {
        this._diagnostics = value;
        this._diagnostics?.clear();
    }

    get(index: number): RegistrationBuilder {
        return this.registrationBuilders[index];
    }

    set(index: number, value: RegistrationBuilder): void {
        this.registrationBuilders[index] = value;
    }

    registerBuilder<T extends RegistrationBuilder>(registrationBuilder: T): T {
        this.registrationBuilders.push(registrationBuilder);
        this.diagnostics?.traceRegister(new RegisterInfo(registrationBuilder));
        return registrationBuilder;
    }

    register(type: TypeKey, lifetime: Lifetime = Lifetime.Singleton): RegistrationBuilder {
        if (typeof type === 'function' && type.name) {
            registerNamedTypeKey(type.name, type);
        }
        return this.registerBuilder(new RegistrationBuilder(type, lifetime));
    }

    registerInstance(instance: object, asType?: TypeKey): RegistrationBuilder {
        const registrationBuilder = this.registerBuilder(new InstanceRegistrationBuilder(instance));
        if (asType) {
            registrationBuilder.as(asType);
        } else {
            registrationBuilder.asSelf();
        }
        return registrationBuilder;
    }

    registerFactory<T>(
        type: TypeKey,
        factory: (resolver: IObjectResolver) => T,
        lifetime: Lifetime = Lifetime.Singleton,
    ): RegistrationBuilder {
        return this.registerBuilder(
            new FuncRegistrationBuilder((resolver) => factory(resolver) as object, type, lifetime),
        );
    }

    registerBuildCallback(callback: (container: IObjectResolver) => void): void {
        const previous = this.buildCallback;
        this.buildCallback = previous
            ? (container) => {
                previous(container);
                callback(container);
            }
            : callback;
    }

    exists(type: TypeKey, includeInterfaceTypes = false, _findParentScopes = false): boolean {
        for (const registrationBuilder of this.registrationBuilders) {
            if (registrationBuilder.implementationType === type) {
                return true;
            }
            if (includeInterfaceTypes) {
                const interfaces = registrationBuilder.getInterfaceTypes();
                if (interfaces && interfaces.indexOf(type) >= 0) {
                    return true;
                }
            }
        }
        return false;
    }

    build(): IObjectResolver {
        const built = this.buildRegistry();
        const container = new Container(built.registry, this.applicationOrigin);
        container.dependencyGraph = this.keepDependencyGraph ? built.graph : null;
        container.diagnostics = this.diagnostics;
        this.emitCallbacks(container);
        return container;
    }

    /**
     * What the registrations describe, without building the container. Reads
     * the same as `container.dependencyGraph` and can be read after a build
     * was refused, which is where a loop is easiest to look at.
     */
    dependencyGraph(): DependencyGraph {
        const registrations = this.createRegistrations(false);
        return buildDependencyGraph(registrations, Registry.build(registrations), this.parentResolver);
    }

    protected buildRegistry(): BuiltRegistry {
        const registrations = this.createRegistrations(true);
        const registry = Registry.build(registrations);
        const graph = buildDependencyGraph(registrations, registry, this.parentResolver);
        // A loop is checked for either way: left alone it is a stack overflow
        // at the first resolve, not a message anyone can act on.
        const problems = this.validateOnBuild ? validateGraph(graph) : cycleProblems(graph);
        if (problems.length > 0) {
            throw new CosDIValidationException(problems);
        }
        return { registry, graph };
    }

    /** The scopes a dependency can also come from. A root build has none. */
    protected get parentResolver(): IScopedObjectResolver | null {
        return null;
    }

    /** The registrations, plus the resolver itself, which is always one. */
    private createRegistrations(trace: boolean): Registration[] {
        const registrations: Registration[] = new Array(this.registrationBuilders.length + 1);
        for (let i = 0; i < this.registrationBuilders.length; i++) {
            const registrationBuilder = this.registrationBuilders[i];
            const registration = registrationBuilder.build();
            if (trace) {
                this.diagnostics?.traceBuild(registrationBuilder, registration);
            }
            registrations[i] = registration;
        }
        registrations[registrations.length - 1] = new Registration(
            ObjectResolverToken,
            Lifetime.Transient,
            [ObjectResolverToken],
            ContainerInstanceProvider.Default,
        );
        return registrations;
    }

    protected emitCallbacks(container: IObjectResolver): void {
        this.buildCallback?.(container);
        this.diagnostics?.notifyContainerBuilt(container);
    }
}

export class ScopedContainerBuilder extends ContainerBuilder {
    constructor(
        private readonly root: IObjectResolver,
        private readonly parent: IScopedObjectResolver,
    ) {
        super();
    }

    protected get parentResolver(): IScopedObjectResolver | null {
        return this.parent;
    }

    buildScope(): IScopedObjectResolver {
        const built = this.buildRegistry();
        const container = new ScopedContainer(built.registry, this.root, this.parent, this.applicationOrigin);
        container.dependencyGraph = this.keepDependencyGraph ? built.graph : null;
        container.diagnostics = this.diagnostics;
        this.emitCallbacks(container);
        return container;
    }

    build(): IObjectResolver {
        return this.buildScope();
    }

    exists(type: TypeKey, includeInterfaceTypes = false, findParentScopes = false): boolean {
        if (super.exists(type, includeInterfaceTypes, findParentScopes)) {
            return true;
        }
        if (findParentScopes) {
            let next: IScopedObjectResolver | null = this.parent;
            while (next != null) {
                const registration = next.tryGetRegistration(type);
                if (registration) {
                    if (includeInterfaceTypes || registration.implementationType === type) {
                        return true;
                    }
                }
                next = next.parent;
            }
        }
        return false;
    }
}
