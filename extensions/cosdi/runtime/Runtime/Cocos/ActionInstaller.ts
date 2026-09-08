import { IContainerBuilder } from '../ContainerBuilder';
import { IInstaller } from './IInstaller';

export class ActionInstaller implements IInstaller {
    constructor(private readonly configuration: (builder: IContainerBuilder) => void) {}

    install(builder: IContainerBuilder): void {
        this.configuration(builder);
    }
}
