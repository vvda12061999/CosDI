import { Registration } from '../Runtime/Registration.ts';

export class ResolveInfo {
    refCount = 0;
    maxDepth = -1;
    resolveTime = 0;
    instanceCount = 0;

    constructor(public readonly registration: Registration) {}
}
