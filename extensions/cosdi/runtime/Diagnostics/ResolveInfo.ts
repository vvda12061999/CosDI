import { Registration } from '../Runtime/Registration';

export class ResolveInfo {
    refCount = 0;
    maxDepth = -1;
    resolveTime = 0;
    readonly instances: object[] = [];

    constructor(public readonly registration: Registration) {}
}
