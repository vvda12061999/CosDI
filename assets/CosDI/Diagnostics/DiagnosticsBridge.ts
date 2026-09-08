import { CosDISettings } from '../Runtime/Cocos/CosDISettings';
import { DiagnosticsContext, DiagnosticsSnapshot } from './DiagnosticsContext';

export class DiagnosticsBridge {
    private static started = false;
    private static timer: ReturnType<typeof setInterval> | null = null;
    private static lastSentAt = 0;

    static ensure(): void {
        if (!CosDISettings.enableDiagnostics || this.started) {
            return;
        }
        this.started = true;
        DiagnosticsContext.addSnapshotListener((snapshot) => this.post(snapshot));
        this.post(DiagnosticsContext.toJSON());
        this.timer = setInterval(() => this.post(DiagnosticsContext.toJSON()), 400);
    }

    static stop(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.started = false;
    }

    private static post(snapshot: DiagnosticsSnapshot): void {
        if (!snapshot) {
            return;
        }
        const url = 'http://127.0.0.1:' + CosDISettings.diagnosticsPort + '/diagnostics';
        let body: string;
        try {
            body = JSON.stringify(snapshot);
        } catch (error) {
            console.warn('[CosDI] Failed to serialize diagnostics', error);
            return;
        }

        // text/plain is a "simple" CORS request, so the POST is delivered even when
        // application/json would be blocked by a failed preflight.
        if (!postXhr(url, body) && !postFetch(url, body)) {
            const now = Date.now();
            if (now - this.lastSentAt > 4000) {
                this.lastSentAt = now;
                console.warn('[CosDI] Diagnostics panel is not reachable at ' + url);
            }
            return;
        }
        this.lastSentAt = Date.now();
    }
}

function postXhr(url: string, body: string): boolean {
    if (typeof XMLHttpRequest !== 'function') {
        return false;
    }
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
        xhr.send(body);
        return true;
    } catch (_error) {
        return false;
    }
}

function postFetch(url: string, body: string): boolean {
    if (typeof fetch !== 'function') {
        return false;
    }
    try {
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body,
            mode: 'cors',
            keepalive: true,
        }).catch(() => undefined);
        return true;
    } catch (_error) {
        return false;
    }
}
