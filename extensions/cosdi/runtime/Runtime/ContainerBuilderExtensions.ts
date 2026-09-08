import { IContainerBuilder } from './ContainerBuilder';
import { IObjectResolver } from './IObjectResolver';

export function registerDisposeCallback(
    builder: IContainerBuilder,
    callback: (container: IObjectResolver) => void,
): void {
    builder.registerBuildCallback((container) => {
        const original = container.dispose.bind(container);
        (container as IObjectResolver).dispose = () => {
            callback(container);
            original();
        };
    });
}
