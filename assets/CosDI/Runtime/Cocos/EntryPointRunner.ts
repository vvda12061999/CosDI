import { _decorator, Component } from 'cc';
import {
    ITickable, IPostTickable, ILateTickable, IStartable, IPostStartable,
} from '../Annotations/EntryPoints';
import { EntryPointExceptionHandler } from './EntryPointExceptionHandler';

const { ccclass } = _decorator;

@ccclass('CosDIEntryPointRunner')
export class EntryPointRunner extends Component {
    startables: IStartable[] = [];
    postStartables: IPostStartable[] = [];
    tickables: ITickable[] = [];
    postTickables: IPostTickable[] = [];
    lateTickables: ILateTickable[] = [];
    exceptionHandler: EntryPointExceptionHandler | null = null;
    private started = false;

    start(): void {
        this.runList(this.startables, (item) => item.start());
        this.runList(this.postStartables, (item) => item.postStart());
        this.started = true;
    }

    update(deltaTime: number): void {
        this.runList(this.tickables, (item) => item.tick(deltaTime));
        this.runList(this.postTickables, (item) => item.postTick(deltaTime));
    }

    lateUpdate(deltaTime: number): void {
        this.runList(this.lateTickables, (item) => item.lateTick(deltaTime));
    }

    private runList<T>(items: T[], invoke: (item: T) => void): void {
        for (let i = 0; i < items.length; i++) {
            try {
                invoke(items[i]);
            } catch (error) {
                if (this.exceptionHandler) {
                    this.exceptionHandler.publish(error);
                } else {
                    console.error(error);
                }
            }
        }
    }
}
