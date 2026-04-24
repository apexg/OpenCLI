/**
 * BasePage — shared IPage method implementations for DOM helpers.
 *
 * Both Page (daemon-backed) and CDPPage (direct CDP) execute JS the same way
 * for DOM operations. This base class deduplicates ~200 lines of identical
 * click/type/scroll/wait/snapshot/interceptor methods.
 *
 * Subclasses implement the transport-specific methods: goto, evaluate,
 * getCookies, screenshot, tabs, etc.
 *
 * Human-like behavior is supported via OPENCLI_HUMAN_MODE=true.
 */
import type { BrowserCookie, IPage, ScreenshotOptions, SnapshotOptions, WaitOptions } from '../types.js';
import { type ResolveOptions, type TargetMatchLevel } from './target-resolver.js';
export interface ResolveSuccess {
    matches_n: number;
    /**
     * Cascading stale-ref tier the resolver traversed. Callers surface this to
     * agents so `stable` / `reidentified` hits are visibly distinct from a
     * clean `exact` match — the page changed, the action still succeeded.
     */
    match_level: TargetMatchLevel;
}
export declare abstract class BasePage implements IPage {
    protected _lastUrl: string | null;
    /** Cached previous snapshot hashes for incremental diff marking */
    private _prevSnapshotHashes;
    abstract goto(url: string, options?: {
        waitUntil?: 'load' | 'none';
        settleMs?: number;
    }): Promise<void>;
    abstract evaluate(js: string): Promise<unknown>;
    /**
     * Safely evaluate JS with pre-serialized arguments.
     * Each key in `args` becomes a `const` declaration with JSON-serialized value,
     * prepended to the JS code. Prevents injection by design.
     *
     * Usage:
     *   page.evaluateWithArgs(`(async () => { return sym; })()`, { sym: userInput })
     */
    evaluateWithArgs(js: string, args: Record<string, unknown>): Promise<unknown>;
    abstract getCookies(opts?: {
        domain?: string;
        url?: string;
    }): Promise<BrowserCookie[]>;
    abstract screenshot(options?: ScreenshotOptions): Promise<string>;
    abstract tabs(): Promise<unknown[]>;
    abstract selectTab(target: number | string): Promise<void>;
    /** Human-like click: trajectory + overshoot + jitter. Override in subclasses with CDP support. */
    smartClick?(x: number, y: number): Promise<void>;
    /** Human-like typing: variable speed + typo simulation. Override in subclasses with CDP support. */
    smartType?(text: string): Promise<void>;
    /** Human-like mouse movement. Override in subclasses with CDP support. */
    humanMove?(x: number, y: number): Promise<void>;
    click(ref: string, opts?: ResolveOptions): Promise<ResolveSuccess>;
    /** Override in subclasses with CDP native click support */
    protected tryNativeClick(_x: number, _y: number): Promise<boolean>;
    typeText(ref: string, text: string, opts?: ResolveOptions): Promise<ResolveSuccess>;
    pressKey(key: string): Promise<void>;
    scrollTo(ref: string, opts?: ResolveOptions): Promise<unknown>;
    getFormState(): Promise<Record<string, unknown>>;
    scroll(direction?: string, amount?: number): Promise<void>;
    /**
     * Human-like scroll wheel event. Subclasses with CDP access override this.
     * Base implementation falls back to JS scroll.
     */
    protected _humanScrollWheel(deltaY: number): Promise<void>;
    autoScroll(options?: {
        times?: number;
        delayMs?: number;
    }): Promise<void>;
    networkRequests(includeStatic?: boolean): Promise<unknown[]>;
    consoleMessages(_level?: string): Promise<unknown[]>;
    wait(options: number | WaitOptions): Promise<void>;
    snapshot(opts?: SnapshotOptions): Promise<unknown>;
    getCurrentUrl(): Promise<string | null>;
    installInterceptor(pattern: string): Promise<void>;
    getInterceptedRequests(): Promise<unknown[]>;
    waitForCapture(timeout?: number): Promise<void>;
    /** Fallback basic snapshot */
    protected _basicSnapshot(opts?: Pick<SnapshotOptions, 'interactive' | 'compact' | 'maxDepth' | 'raw'>): Promise<unknown>;
}
