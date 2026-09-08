export class EntryPointExceptionHandler {
    constructor(private readonly handler: (error: Error) => void) {}

    publish(error: unknown): void {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handler(err);
    }
}
