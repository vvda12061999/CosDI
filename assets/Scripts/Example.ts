import { _decorator, Component } from 'cc';
import { injectable, inject } from 'cosdi';
import { IExampleService } from './IExampleService';

const { ccclass } = _decorator;

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}

@injectable('IExampleService')
export class Player {
    constructor(service?: IExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

@ccclass('Example')
export class Example extends Component {
    @inject('IExampleService')
    private exampleService: IExampleService;

    start() {
        console.log('Injected field', this.exampleService && this.exampleService.name);
        const player = new Player();
        console.log('Created player', player);
    }

    update(_deltaTime: number) {
    }
}
