/**
 * CDP client — implements IPage by connecting directly to a Chrome/Electron CDP WebSocket.
 *
 * Architecture:
 * - Reuses user's existing browser context (Cookie sharing)
 * - Creates a new page target in the default browser context
 * - On close: closes the page target (not the browser context)
 *
 * This ensures:
 * - Cookie sharing with user's logged-in sessions
 * - No need to re-login for each command
 * - Clean page cleanup after each session
 * - User's existing pages are not affected
 *
 * Fixes applied:
 * - send() now has a 30s timeout guard (P0 #4)
 * - goto() waits for Page.loadEventFired instead of hardcoded 1s sleep (P1 #3)
 * - Implemented scroll, autoScroll, screenshot, networkRequests (P1 #2)
 * - Shared DOM helper methods extracted to reduce duplication with Page (P1 #5)
 */
import type { IPage } from '../types.js';
import type { IBrowserFactory } from '../runtime.js';
export interface CDPTarget {
    id?: string;
    type?: string;
    url?: string;
    title?: string;
    webSocketDebuggerUrl?: string;
}
export declare const CDP_RESPONSE_BODY_CAPTURE_LIMIT: number;
/**
 * CDPBridge - Manages CDP connections with Cookie sharing.
 *
 * Connection flow:
 * 1. Get browser WebSocket URL from /json/version
 * 2. Create a new page target in the DEFAULT browser context (shares cookies)
 * 3. Connect to the page target's WebSocket
 * 4. Execute commands on the page
 * 5. On close: close target → close WebSocket
 */
export declare class CDPBridge implements IBrowserFactory {
    private _ws;
    private _idCounter;
    private _pending;
    private _eventListeners;
    private _targetId;
    private _cdpEndpoint;
    connect(opts?: {
        timeout?: number;
        workspace?: string;
        cdpEndpoint?: string;
        initialUrl?: string;
    }): Promise<IPage>;
    /**
     * Connect to browser WebSocket temporarily (for creating targets).
     */
    private _connectBrowserTemp;
    /**
     * Send a command on a specific WebSocket (for temporary browser connection).
     */
    private _sendOnWs;
    /**
     * Connect to page-level WebSocket for page operations.
     */
    private _connectPage;
    /**
     * Setup message handler for page-level WebSocket.
     */
    private _setupPageMessageHandler;
    /**
     * Cleanup resources on connection failure.
     */
    private _cleanupOnFailure;
    /**
     * Mark the target as already closed (e.g. by closeWindow) to avoid double-close.
     */
    markTargetClosed(): void;
    /**
     * Close the CDP connection and cleanup all resources.
     */
    close(): Promise<void>;
    /**
     * Get the target ID of the current page (for CDPPage to use).
     */
    getTargetId(): string | undefined;
    /**
     * Send command via page-level WebSocket.
     */
    send(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    on(event: string, handler: (params: unknown) => void): void;
    off(event: string, handler: (params: unknown) => void): void;
    waitForEvent(event: string, timeoutMs?: number): Promise<unknown>;
}
/**
 * Select the best CDP target from a list.
 * Note: In Cookie-sharing mode, this is only used for Electron apps.
 */
declare function selectCDPTarget(targets: CDPTarget[]): CDPTarget | undefined;
declare function scoreCDPTarget(target: CDPTarget, preferredPattern?: RegExp): number;
export declare const __test__: {
    selectCDPTarget: typeof selectCDPTarget;
    scoreCDPTarget: typeof scoreCDPTarget;
};
export {};
