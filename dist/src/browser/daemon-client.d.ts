/**
 * HTTP client for communicating with the opencli daemon.
 *
 * Provides a typed send() function that posts a Command and returns a Result.
 */
import type { BrowserSessionInfo } from '../types.js';
export interface DaemonCommand {
    id: string;
    action: 'exec' | 'navigate' | 'tabs' | 'cookies' | 'screenshot' | 'close-window' | 'sessions' | 'set-file-input' | 'insert-text' | 'bind-current' | 'network-capture-start' | 'network-capture-read' | 'cdp' | 'frames';
    /** Target page identity (targetId). Cross-layer contract with the extension. */
    page?: string;
    code?: string;
    workspace?: string;
    url?: string;
    op?: string;
    index?: number;
    domain?: string;
    matchDomain?: string;
    matchPathPrefix?: string;
    format?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
    /** Local file paths for set-file-input action */
    files?: string[];
    /** CSS selector for file input element (set-file-input action) */
    selector?: string;
    /** Raw text payload for insert-text action */
    text?: string;
    /** URL substring filter pattern for network capture */
    pattern?: string;
    cdpMethod?: string;
    cdpParams?: Record<string, unknown>;
    /** When true, automation windows are created in the foreground */
    windowFocused?: boolean;
    /** Custom idle timeout in seconds for this workspace session. Overrides the default. */
    idleTimeout?: number;
    /** Frame index for cross-frame operations (0-based, from 'frames' action) */
    frameIndex?: number;
}
export interface DaemonResult {
    id: string;
    ok: boolean;
    data?: unknown;
    error?: string;
    /** Page identity (targetId) — present on page-scoped command responses */
    page?: string;
}
export interface DaemonStatus {
    ok: boolean;
    pid: number;
    uptime: number;
    daemonVersion?: string;
    extensionConnected: boolean;
    extensionVersion?: string;
    extensionCompatRange?: string;
    pending: number;
    memoryMB: number;
    port: number;
}
export declare function fetchDaemonStatus(opts?: {
    timeout?: number;
}): Promise<DaemonStatus | null>;
export type DaemonHealth = {
    state: 'stopped';
    status: null;
} | {
    state: 'no-extension';
    status: DaemonStatus;
} | {
    state: 'ready';
    status: DaemonStatus;
};
/**
 * Unified daemon health check — single entry point for all status queries.
 * Replaces isDaemonRunning(), isExtensionConnected(), and checkDaemonStatus().
 */
export declare function getDaemonHealth(opts?: {
    timeout?: number;
}): Promise<DaemonHealth>;
export declare function requestDaemonShutdown(opts?: {
    timeout?: number;
}): Promise<boolean>;
/**
 * Send a command to the daemon and return the result data.
 */
export declare function sendCommand(action: DaemonCommand['action'], params?: Omit<DaemonCommand, 'id' | 'action'>): Promise<unknown>;
/**
 * Like sendCommand, but returns both data and page identity (targetId).
 * Use this for page-scoped commands where the caller needs the page identity.
 */
export declare function sendCommandFull(action: DaemonCommand['action'], params?: Omit<DaemonCommand, 'id' | 'action'>): Promise<{
    data: unknown;
    page?: string;
}>;
export declare function listSessions(): Promise<BrowserSessionInfo[]>;
export declare function bindCurrentTab(workspace: string, opts?: {
    matchDomain?: string;
    matchPathPrefix?: string;
}): Promise<unknown>;
