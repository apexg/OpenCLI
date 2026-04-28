/**
 * Browser session manager — auto-spawns daemon and provides IPage.
 */
import type { IPage } from '../types.js';
import type { IBrowserFactory } from '../runtime.js';
export type BrowserBridgeState = 'idle' | 'connecting' | 'connected' | 'closing' | 'closed';
/**
 * Browser factory: manages daemon lifecycle and provides IPage instances.
 */
export declare class BrowserBridge implements IBrowserFactory {
    private _state;
    private _page;
    private _daemonProc;
    get state(): BrowserBridgeState;
    connect(opts?: {
        timeout?: number;
        workspace?: string;
        idleTimeout?: number;
    }): Promise<IPage>;
    close(): Promise<void>;
    private _ensureDaemon;
    /** Poll until daemon is fully stopped (port released). */
    private _waitForDaemonStop;
    /** Poll getDaemonHealth() until state is 'ready' or deadline is reached. */
    private _pollUntilReady;
}
