import { IContainerBuilder } from '../ContainerBuilder.ts';

export interface IInstaller {
    install(builder: IContainerBuilder): void;
}
