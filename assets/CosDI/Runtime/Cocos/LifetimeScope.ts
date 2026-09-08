import { _decorator, Component, Node, instantiate, Constructor, director } from 'cc';
import { IObjectResolver } from '../IObjectResolver';
import { IContainerBuilder, ContainerBuilder } from '../ContainerBuilder';
import { AmbientResolver } from '../AmbientResolver';
import { CosDISettings } from './CosDISettings';
import { DiagnosticsContext } from '../../Diagnostics/DiagnosticsContext';
import { DiagnosticsBridge } from '../../Diagnostics/DiagnosticsBridge';
import { IInstaller } from './IInstaller';
import { ActionInstaller } from './ActionInstaller';
import { injectNode, injectScene } from './ObjectResolverCocosExtensions';
import { EntryPointsBuilder } from './ContainerBuilderCocosExtensions';
import { CosDIParentTypeReferenceNotFound } from '../CosDIException';

const { ccclass, property, executionOrder } = _decorator;

const globalOverrideParents: LifetimeScope[] = [];
const globalExtraInstallers: IInstaller[] = [];
const waitingList: LifetimeScope[] = [];

export interface ParentOverrideScope {
    dispose(): void;
}

export interface ExtraInstallationScope {
    dispose(): void;
}

@ccclass('LifetimeScope')
@executionOrder(-5000)
export class LifetimeScope extends Component {
    @property({ type: Component })
    parentReference: LifetimeScope | null = null;

    @property
    autoRun = true;

    @property
    autoInjectScene = true;

    @property({ type: [Node] })
    autoInjectNodes: Node[] = [];

    container: IObjectResolver | null = null;
    parent: LifetimeScope | null = null;

    private readonly localExtraInstallers: IInstaller[] = [];
    private scopeName = '';

    static create(installer?: IInstaller | ((builder: IContainerBuilder) => void) | null, name?: string): LifetimeScope {
        const node = new Node(name ?? 'LifetimeScope');
        node.active = false;
        const scope = node.addComponent(LifetimeScope);
        if (installer) {
            scope.localExtraInstallers.push(
                typeof installer === 'function' ? new ActionInstaller(installer) : installer,
            );
        }
        node.active = true;
        return scope;
    }

    static enqueueParent(parent: LifetimeScope): ParentOverrideScope {
        globalOverrideParents.push(parent);
        return {
            dispose: () => {
                const index = globalOverrideParents.lastIndexOf(parent);
                if (index >= 0) {
                    globalOverrideParents.splice(index, 1);
                }
            },
        };
    }

    static enqueue(installing: IInstaller | ((builder: IContainerBuilder) => void)): ExtraInstallationScope {
        const installer = typeof installing === 'function' ? new ActionInstaller(installing) : installing;
        globalExtraInstallers.push(installer);
        return {
            dispose: () => {
                const index = globalExtraInstallers.lastIndexOf(installer);
                if (index >= 0) {
                    globalExtraInstallers.splice(index, 1);
                }
            },
        };
    }

    static find<T extends LifetimeScope>(type: Constructor<T>, root?: Node): T | null {
        const search = root ?? director.getScene();
        if (!search) {
            return null;
        }
        return findScope(search, type);
    }

    protected onLoad(): void {
        this.ensureScopeName();
        if (CosDISettings.enableDiagnostics) {
            DiagnosticsBridge.ensure();
        }
        try {
            if (this.autoRun) {
                this.build();
            }
        } catch (error) {
            if (error instanceof CosDIParentTypeReferenceNotFound) {
                if (waitingList.indexOf(this) >= 0) {
                    throw error;
                }
                waitingList.push(this);
                return;
            }
            throw error;
        }
    }

    protected onDestroy(): void {
        this.disposeCore();
    }

    protected configure(_builder: IContainerBuilder): void {}

    protected findParent(): LifetimeScope | null {
        return null;
    }

    dispose(): void {
        this.disposeCore();
        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }

    disposeCore(): void {
        if (this.container) {
            AmbientResolver.pop(this.container);
            this.container.dispose();
            this.container = null;
        }
        const waitingIndex = waitingList.indexOf(this);
        if (waitingIndex >= 0) {
            waitingList.splice(waitingIndex, 1);
        }
        if (CosDISettings.enableDiagnostics && this.scopeName) {
            DiagnosticsContext.removeCollector(this.scopeName);
        }
    }

    build(): void {
        if (this.parent == null) {
            this.parent = this.getRuntimeParent();
        }

        if (this.parent != null) {
            if (this.parent.container == null) {
                this.parent.build();
            }
            this.parent.container.createScope((builder) => {
                builder.registerBuildCallback((container) => this.setContainer(container));
                builder.applicationOrigin = this;
                builder.diagnostics = this.createDiagnosticsCollector();
                this.installTo(builder);
            });
        } else {
            const builder = new ContainerBuilder();
            builder.applicationOrigin = this;
            builder.diagnostics = this.createDiagnosticsCollector();
            builder.registerBuildCallback((container) => this.setContainer(container));
            this.installTo(builder);
            builder.build();
        }

        this.awakeWaitingChildren();
    }

    createChild(
        installer?: IInstaller | ((builder: IContainerBuilder) => void) | null,
        childScopeName?: string,
    ): LifetimeScope {
        const childNode = new Node(childScopeName ?? 'LifetimeScope (Child)');
        childNode.active = false;
        this.node.addChild(childNode);
        const child = childNode.addComponent(LifetimeScope);
        if (installer) {
            child.localExtraInstallers.push(
                typeof installer === 'function' ? new ActionInstaller(installer) : installer,
            );
        }
        child.parentReference = this;
        childNode.active = true;
        return child;
    }

    createChildFromPrefab(
        prefab: LifetimeScope,
        installer?: IInstaller | ((builder: IContainerBuilder) => void) | null,
    ): LifetimeScope {
        const wasActive = prefab.node.active;
        prefab.node.active = false;
        const childNode = instantiate(prefab.node);
        this.node.addChild(childNode);
        const child = childNode.getComponent(LifetimeScope) ?? childNode.addComponent(LifetimeScope);
        if (installer) {
            child.localExtraInstallers.push(
                typeof installer === 'function' ? new ActionInstaller(installer) : installer,
            );
        }
        child.parentReference = this;
        prefab.node.active = wasActive;
        childNode.active = wasActive;
        return child;
    }

    private setContainer(container: IObjectResolver): void {
        this.container = container;
        AmbientResolver.push(container);
        this.autoInjectAll();
        if (CosDISettings.enableDiagnostics) {
            DiagnosticsBridge.ensure();
        }
    }

    private createDiagnosticsCollector() {
        if (!CosDISettings.enableDiagnostics) {
            return null;
        }
        const collector = DiagnosticsContext.getCollector(this.ensureScopeName());
        collector.parentScopeName = this.parent ? this.parent.ensureScopeName() : '';
        return collector;
    }

    private ensureScopeName(): string {
        if (!this.scopeName) {
            this.scopeName = `${this.node.name} (${this.node.uuid})`;
        }
        return this.scopeName;
    }

    private installTo(builder: IContainerBuilder): void {
        this.configure(builder);

        for (const installer of this.localExtraInstallers) {
            installer.install(builder);
        }
        this.localExtraInstallers.length = 0;

        for (const installer of globalExtraInstallers) {
            installer.install(builder);
        }

        builder.registerInstance(this, LifetimeScope).asSelf();
        EntryPointsBuilder.ensureDispatcherRegistered(builder);
    }

    private getRuntimeParent(): LifetimeScope | null {
        if (this.parentReference != null) {
            return this.parentReference;
        }

        const implParent = this.findParent();
        if (implParent != null) {
            return implParent;
        }

        if (globalOverrideParents.length > 0) {
            return globalOverrideParents[globalOverrideParents.length - 1];
        }

        return null;
    }

    private autoInjectAll(): void {
        if (!this.container) {
            return;
        }
        if (this.autoInjectScene || CosDISettings.autoInjectScene) {
            injectScene(this.container, this.node.scene ?? this.node);
        }
        for (const target of this.autoInjectNodes) {
            if (target) {
                injectNode(this.container, target);
            }
        }
    }

    private awakeWaitingChildren(): void {
        const pending = waitingList.filter((scope) => scope.parentReference === this || scope.getRuntimeParent() === this);
        for (const child of pending) {
            const index = waitingList.indexOf(child);
            if (index >= 0) {
                waitingList.splice(index, 1);
            }
            child.build();
        }
    }
}

function findScope<T extends LifetimeScope>(node: Node, type: Constructor<T>): T | null {
    const found = node.getComponent(type);
    if (found) {
        return found;
    }
    for (const child of node.children) {
        const nested = findScope(child, type);
        if (nested) {
            return nested;
        }
    }
    return null;
}
