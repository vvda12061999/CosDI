import { _decorator } from 'cc';
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';
import { ExampleService, Player } from './Example';
import { IExampleService } from './Services';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService, Lifetime.Singleton).as(IExampleService);
        builder.register(Player, Lifetime.Transient);
    }
}
