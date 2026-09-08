import { IDisposable } from '../IDisposable';

export class CompositeDisposable implements IDisposable {
    private readonly disposables: IDisposable[] = [];

    add(disposable: IDisposable): void {
        this.disposables.push(disposable);
    }

    dispose(): void {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}

export class Lazy<T> {
    private _value: T | undefined;
    private _created = false;

    constructor(private readonly factory: () => T) {}

    get isValueCreated(): boolean {
        return this._created;
    }

    get value(): T {
        if (!this._created) {
            this._value = this.factory();
            this._created = true;
        }
        return this._value as T;
    }
}
