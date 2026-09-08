import { IContainerBuilder } from '../ContainerBuilder.ts';
import { IInstaller } from './IInstaller.ts';

export class ActionInstaller implements IInstaller {
    constructor(private readonly configuration: (builder: IContainerBuilder) => void) {}

    install(builder: IContainerBuilder): void {
        this.configuration(builder);
    }
}
