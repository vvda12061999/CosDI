import { Node } from 'cc';
import { IObjectResolver, ObjectResolverToken } from '../IObjectResolver';
import { IDisposable } from '../IDisposable';
import {
    IInitializable, IPostInitializable, IStartable, IPostStartable,
    ITickable, IPostTickable, ILateTickable, IAsyncStartable,
} from '../Annotations/EntryPoints';
import { EntryPointExceptionHandler } from './EntryPointExceptionHandler';
import { EntryPointRunner } from './EntryPointRunner';
import { injectable } from '../Annotations/injectable';

@injectable(ObjectResolverToken)
export class EntryPointDispatcher implements IDisposable {
    private runner: EntryPointRunner | null = null;

    constructor(private readonly container: IObjectResolver) {}

    dispatch(): void {
        const origin = this.container.applicationOrigin as { node?: Node } | null;
        const node = origin?.node;
        const exceptionHandler = this.container.tryResolve(EntryPointExceptionHandler) as EntryPointExceptionHandler | null;

        const run = <T>(items: T[], invoke: (item: T) => void) => {
            for (let i = 0; i < items.length; i++) {
                try {
                    invoke(items[i]);
                } catch (error) {
                    if (exceptionHandler) {
                        exceptionHandler.publish(error);
                    } else {
                        console.error(error);
                    }
                }
            }
        };

        const initializables = this.container.resolveAll(IInitializable, true) as IInitializable[];
        run(initializables, (item) => item.initialize());

        const postInitializables = this.container.resolveAll(IPostInitializable, true) as IPostInitializable[];
        run(postInitializables, (item) => item.postInitialize());

        const asyncStartables = this.container.resolveAll(IAsyncStartable, true) as IAsyncStartable[];
        run(asyncStartables, (item) => {
            const result = item.startAsync();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                (result as Promise<void>).catch((error) => {
                    if (exceptionHandler) {
                        exceptionHandler.publish(error);
                    } else {
                        console.error(error);
                    }
                });
            }
        });

        if (!node) {
            const startables = this.container.resolveAll(IStartable, true) as IStartable[];
            run(startables, (item) => item.start());
            const postStartables = this.container.resolveAll(IPostStartable, true) as IPostStartable[];
            run(postStartables, (item) => item.postStart());
            return;
        }

        let runner = node.getComponent(EntryPointRunner);
        if (!runner) {
            runner = node.addComponent(EntryPointRunner);
        }
        runner.exceptionHandler = exceptionHandler;
        runner.startables = this.container.resolveAll(IStartable, true) as IStartable[];
        runner.postStartables = this.container.resolveAll(IPostStartable, true) as IPostStartable[];
        runner.tickables = this.container.resolveAll(ITickable, true) as ITickable[];
        runner.postTickables = this.container.resolveAll(IPostTickable, true) as IPostTickable[];
        runner.lateTickables = this.container.resolveAll(ILateTickable, true) as ILateTickable[];
        this.runner = runner;
    }

    dispose(): void {
        if (this.runner && this.runner.isValid) {
            this.runner.destroy();
        }
        this.runner = null;
    }
}
