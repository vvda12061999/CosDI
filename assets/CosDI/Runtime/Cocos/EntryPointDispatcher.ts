import { Node } from 'cc';
import { IObjectResolver, ObjectResolverToken } from '../IObjectResolver.ts';
import { IDisposable } from '../IDisposable.ts';
import {
    IInitializable, IPostInitializable, IStartable, IPostStartable,
    ITickable, IPostTickable, ILateTickable, IAsyncStartable,
} from '../Annotations/EntryPoints.ts';
import { EntryPointExceptionHandler } from './EntryPointExceptionHandler.ts';
import { EntryPointRunner } from './EntryPointRunner.ts';
import { injectable } from '../Annotations/injectable.ts';

@injectable(ObjectResolverToken)
export class EntryPointDispatcher implements IDisposable {
    private runner: EntryPointRunner | null = null;

    constructor(private readonly container: IObjectResolver) {}

    dispatch(): void {
        const origin = this.container.applicationOrigin as { node?: Node } | null;
        const node = origin?.node;
        const exceptionHandler = this.container.tryResolve(EntryPointExceptionHandler);

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

        const initializables = this.container.resolveAll(IInitializable, true);
        run(initializables, (item) => item.initialize());

        const postInitializables = this.container.resolveAll(IPostInitializable, true);
        run(postInitializables, (item) => item.postInitialize());

        const asyncStartables = this.container.resolveAll(IAsyncStartable, true);
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
            const startables = this.container.resolveAll(IStartable, true);
            run(startables, (item) => item.start());
            const postStartables = this.container.resolveAll(IPostStartable, true);
            run(postStartables, (item) => item.postStart());
            return;
        }

        let runner = node.getComponent(EntryPointRunner);
        if (!runner) {
            runner = node.addComponent(EntryPointRunner);
        }
        runner.exceptionHandler = exceptionHandler;
        runner.startables = this.container.resolveAll(IStartable, true);
        runner.postStartables = this.container.resolveAll(IPostStartable, true);
        runner.tickables = this.container.resolveAll(ITickable, true);
        runner.postTickables = this.container.resolveAll(IPostTickable, true);
        runner.lateTickables = this.container.resolveAll(ILateTickable, true);
        this.runner = runner;
    }

    dispose(): void {
        if (this.runner && this.runner.isValid) {
            this.runner.destroy();
        }
        this.runner = null;
    }
}
