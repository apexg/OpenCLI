import type { IPage } from './types.js';
/**
 * Returns the appropriate browser factory based on site type and environment.
 * - If OPENCLI_CDP_ENDPOINT is set, use CDPBridge for direct CDP connection
 * - If site is a registered Electron app, use CDPBridge
 * - Otherwise, use BrowserBridge (requires extension)
 */
export declare function getBrowserFactory(site?: string): new () => IBrowserFactory;
export declare const DEFAULT_BROWSER_CONNECT_TIMEOUT: number;
export declare const DEFAULT_BROWSER_COMMAND_TIMEOUT: number;
export declare const DEFAULT_BROWSER_EXPLORE_TIMEOUT: number;
/**
 * Timeout with seconds unit. Used for high-level command timeouts.
 */
export declare function runWithTimeout<T>(promise: Promise<T>, opts: {
    timeout: number;
    label?: string;
    hint?: string;
}): Promise<T>;
/**
 * Timeout with milliseconds unit. Used for low-level internal timeouts.
 * Accepts a factory function to create the rejection error, keeping this
 * utility decoupled from specific error types.
 */
export declare function withTimeoutMs<T>(promise: Promise<T>, timeoutMs: number, makeError?: string | (() => Error)): Promise<T>;
/** Interface for browser factory (BrowserBridge or test mocks) */
export interface IBrowserFactory {
    connect(opts?: {
        timeout?: number;
        workspace?: string;
        cdpEndpoint?: string;
    }): Promise<IPage>;
    close(): Promise<void>;
}
export declare function browserSession<T>(BrowserFactory: new () => IBrowserFactory, fn: (page: IPage) => Promise<T>, opts?: {
    workspace?: string;
    cdpEndpoint?: string;
}): Promise<T>;
