import { _decorator, Component } from 'cc';
import { injectable, inject, createToken } from 'db://assets/CosDI/Runtime/index';

const { ccclass } = _decorator;

export interface IExampleService {
    name: string;
}

export const IExampleService = createToken<IExampleService>('IExampleService');

export class ExampleService implements IExampleService {
    name: string = 'ExampleService';
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

    start() {
        console.log('Injected field', this.exampleService && this.exampleService.name);
        const player = new Player();
        console.log('Created player', player);
    }

    update(_deltaTime: number) {
    }
}
