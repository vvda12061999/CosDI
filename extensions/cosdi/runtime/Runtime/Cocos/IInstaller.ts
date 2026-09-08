import { IContainerBuilder } from '../ContainerBuilder';

export interface IInstaller {
    install(builder: IContainerBuilder): void;
}
