import { IContainerBuilder } from './ContainerBuilder.ts';
import { IObjectResolver } from './IObjectResolver.ts';

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
