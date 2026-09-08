import { _decorator, Component } from 'cc';
import { injectable, inject } from 'cosdi';
import { IExampleService } from './Services';

const { ccclass } = _decorator;

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}

@injectable(IExampleService)
export class Player {
    constructor(service?: IExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

@ccclass('Example')
export class Example extends Component {
    @inject(IExampleService)
    private exampleService: IExampleService;

    @inject
    private player: Player;

    start() {
        console.log('Injected field', this.exampleService && this.exampleService.name);
        console.log('Injected player', this.player);
    }

    update(_deltaTime: number) {
    }
}
