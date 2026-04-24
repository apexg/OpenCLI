/**
 * Page abstraction — implements IPage by sending commands to the daemon.
 *
 * All browser operations are ultimately 'exec' (JS evaluation via CDP)
 * plus a few native Chrome Extension APIs (tabs, cookies, navigate).
 *
 * IMPORTANT: After goto(), we remember the page identity (targetId) returned
 * by the navigate action and pass it to all subsequent commands. This ensures
 * page-scoped operations target the correct page without guessing.
 *
 * Human-like behavior is supported via OPENCLI_HUMAN_MODE=true.
 */
import type { BrowserCookie, ScreenshotOptions } from '../types.js';
import { BasePage } from './base-page.js';
import { type HumanConfig } from './human.js';
/**
 * Page — implements IPage by talking to the daemon via HTTP.
 */
export declare class Page extends BasePage {
    private readonly workspace;
    private readonly _idleTimeout;
    constructor(workspace?: string, idleTimeout?: number);
    /** Active page identity (targetId), set after navigate and used in all subsequent commands */
    private _page;
    private _networkCaptureUnsupported;
    private _networkCaptureWarned;
    /** Helper: spread workspace into command params */
    private _wsOpt;
    /** Helper: spread workspace + page identity into command params */
    private _cmdOpts;
    goto(url: string, options?: {
        waitUntil?: 'load' | 'none';
        settleMs?: number;
    }): Promise<void>;
    /** Get the active page identity (targetId) */
    getActivePage(): string | undefined;
    /** Bind this Page instance to a specific page identity (targetId). */
    setActivePage(page?: string): void;
    private _markUnsupportedNetworkCapture;
    evaluate(js: string): Promise<unknown>;
    getCookies(opts?: {
        domain?: string;
        url?: string;
    }): Promise<BrowserCookie[]>;
    /** Close the automation window in the extension */
    closeWindow(): Promise<void>;
    tabs(): Promise<unknown[]>;
    newTab(url?: string): Promise<string | undefined>;
    closeTab(target?: number | string): Promise<void>;
    selectTab(target: number | string): Promise<void>;
    /**
     * Capture a screenshot via CDP Page.captureScreenshot.
     */
    screenshot(options?: ScreenshotOptions): Promise<string>;
    startNetworkCapture(pattern?: string): Promise<boolean>;
    readNetworkCapture(): Promise<unknown[]>;
    /**
     * Set local file paths on a file input element via CDP DOM.setFileInputFiles.
     * Chrome reads the files directly from the local filesystem, avoiding the
     * payload size limits of base64-in-evaluate.
     */
    setFileInput(files: string[], selector?: string): Promise<void>;
    insertText(text: string): Promise<void>;
    frames(): Promise<Array<{
        index: number;
        frameId: string;
        url: string;
        name: string;
    }>>;
    evaluateInFrame(js: string, frameIndex: number): Promise<unknown>;
    cdp(method: string, params?: Record<string, unknown>): Promise<unknown>;
    /** CDP native click fallback — called when JS el.click() fails */
    protected tryNativeClick(x: number, y: number): Promise<boolean>;
    /** Precise click using DOM.getContentQuads/getBoxModel for inline elements */
    clickWithQuads(ref: string): Promise<void>;
    nativeClick(x: number, y: number): Promise<void>;
    nativeType(text: string): Promise<void>;
    nativeKeyPress(key: string, modifiers?: string[]): Promise<void>;
    /**
     * Human-like mouse movement with Bezier curve trajectory.
     */
    humanMove(x: number, y: number): Promise<void>;
    /**
     * Human-like click with trajectory and natural press duration.
     */
    humanClick(x: number, y: number): Promise<void>;
    /**
     * Human-like typing with variable speed and typo simulation.
     */
    humanType(text: string): Promise<void>;
    /**
     * Human-like scroll wheel event.
     */
    protected _humanScrollWheel(deltaY: number): Promise<void>;
    /**
     * Smart click: uses human mode if enabled.
     */
    smartClick(x: number, y: number): Promise<void>;
    /**
     * Smart type: uses human mode if enabled.
     */
    smartType(text: string): Promise<void>;
    /**
     * Set human config overrides.
     */
    setHumanConfig(cfg: Partial<HumanConfig>): void;
}
