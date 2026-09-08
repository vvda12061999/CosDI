import { _decorator, Component } from 'cc';
import { injectable, inject } from 'cosdi';

const { ccclass } = _decorator;

export class ExampleService {
    name = 'ExampleService';
}

@injectable(ExampleService)
export class Player {
    constructor(service?: ExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

@ccclass('Example')
export class Example extends Component {
    @inject(ExampleService)
    private exampleService: ExampleService;

    start() {
        console.log('Injected field', this.exampleService && this.exampleService.name);
        const player = new Player();
        console.log('Created player', player);
    }

    update(_deltaTime: number) {
    }
}
