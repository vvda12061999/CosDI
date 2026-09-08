import { _decorator } from 'cc';
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';
import { ExampleService, IExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
    }
}
