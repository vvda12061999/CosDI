import { RegisterInfo } from './RegisterInfo';
import { ResolveInfo } from './ResolveInfo';

export class DiagnosticsInfo {
    readonly dependencies: DiagnosticsInfo[] = [];
    resolveInfo: ResolveInfo | null = null;

    constructor(
        public readonly scopeName: string,
        public readonly registerInfo: RegisterInfo,
    ) {}
}
