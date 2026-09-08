export interface IDisposable {
    dispose(): void;
}

export function isDisposable(value: unknown): value is IDisposable {
    return value != null && typeof (value as IDisposable).dispose === 'function';
}
