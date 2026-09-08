import { _decorator } from 'cc';
import { LifetimeScope, IContainerBuilder } from 'cosdi';
import { ExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService);
    }
}
