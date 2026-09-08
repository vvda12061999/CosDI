import { _decorator } from 'cc';
import { Lifetime, LifetimeScope, IContainerBuilder } from 'cosdi';
import { ExampleService, IExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
    }
}
