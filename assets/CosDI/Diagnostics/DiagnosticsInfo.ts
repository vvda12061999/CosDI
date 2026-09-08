import { RegisterInfo } from './RegisterInfo.ts';
import { ResolveInfo } from './ResolveInfo.ts';

export class DiagnosticsInfo {
    readonly dependencies: DiagnosticsInfo[] = [];
    resolveInfo: ResolveInfo | null = null;

    constructor(
        public readonly scopeName: string,
        public readonly registerInfo: RegisterInfo,
    ) {}

    addDependency(info: DiagnosticsInfo): void {
        if (info === this) {
            return;
        }
        if (this.dependencies.indexOf(info) < 0) {
            this.dependencies.push(info);
        }
    }
}
