/**
 * CDP client — implements IPage by connecting directly to a Chrome/Electron CDP WebSocket.
 *
 * Fixes applied:
 * - send() now has a 30s timeout guard (P0 #4)
 * - goto() waits for Page.loadEventFired instead of hardcoded 1s sleep (P1 #3)
 * - Implemented scroll, autoScroll, screenshot, networkRequests (P1 #2)
 * - Shared DOM helper methods extracted to reduce duplication with Page (P1 #5)
 */
import { WebSocket } from 'ws';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { wrapForEval } from './utils.js';
import { generateStealthJs } from './stealth.js';
import { waitForDomStableJs } from './dom-helpers.js';
import { isRecord, saveBase64ToFile } from '../utils.js';
import { getAllElectronApps } from '../electron-apps.js';
import { BasePage } from './base-page.js';
import { isHumanModeEnabled, getHumanConfig, randomInRange, randomIntInRange, easeInOut, generateBezierCurve, generateOvershootCurve, getAdjacentKey, } from './human.js';
const CDP_SEND_TIMEOUT = 30_000;
// Memory guard for in-process capture. The 4k cap we used to apply everywhere
// silently truncated JSON so `JSON.parse` failed or gave partial objects — the
// primary agent-facing bug. Now we keep the full body up to a large cap and
// surface `responseBodyFullSize` + `responseBodyTruncated` so downstream layers
// can tell the agent what happened instead of lying about the payload.
export const CDP_RESPONSE_BODY_CAPTURE_LIMIT = 8 * 1024 * 1024;
export class CDPBridge {
    _ws = null;
    _idCounter = 0;
    _pending = new Map();
    _eventListeners = new Map();
    async connect(opts) {
        if (this._ws)
            throw new Error('CDPBridge is already connected. Call close() before reconnecting.');
        const endpoint = opts?.cdpEndpoint ?? process.env.OPENCLI_CDP_ENDPOINT;
        if (!endpoint)
            throw new Error('CDP endpoint not provided (pass cdpEndpoint or set OPENCLI_CDP_ENDPOINT)');
        let wsUrl = endpoint;
        if (endpoint.startsWith('http')) {
            const targets = await fetchJsonDirect(`${endpoint.replace(/\/$/, '')}/json`);
            const target = selectCDPTarget(targets);
            if (!target || !target.webSocketDebuggerUrl) {
                throw new Error('No inspectable targets found at CDP endpoint');
            }
            wsUrl = target.webSocketDebuggerUrl;
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            const timeoutMs = (opts?.timeout ?? 10) * 1000;
            const timeout = setTimeout(() => {
                this._ws = null;
                ws.close();
                reject(new Error('CDP connect timeout'));
            }, timeoutMs);
            ws.on('open', async () => {
                clearTimeout(timeout);
                this._ws = ws;
                try {
                    await this.send('Page.enable');
                    // Inject stealth scripts only when OPENCLI_CDP_STEALTH is not explicitly disabled.
                    // Default: enabled (stealth injected). Set OPENCLI_CDP_STEALTH=false to skip.
                    const stealthDisabled = process.env.OPENCLI_CDP_STEALTH === 'false' || process.env.OPENCLI_CDP_STEALTH === '0';
                    if (!stealthDisabled) {
                        await this.send('Page.addScriptToEvaluateOnNewDocument', { source: generateStealthJs() });
                    }
                }
                catch (err) {
                    ws.close();
                    reject(err instanceof Error ? err : new Error(String(err)));
                    return;
                }
                resolve(new CDPPage(this));
            });
            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id && this._pending.has(msg.id)) {
                        const entry = this._pending.get(msg.id);
                        clearTimeout(entry.timer);
                        this._pending.delete(msg.id);
                        if (msg.error) {
                            entry.reject(new Error(msg.error.message));
                        }
                        else {
                            entry.resolve(msg.result);
                        }
                    }
                    if (msg.method) {
                        const listeners = this._eventListeners.get(msg.method);
                        if (listeners) {
                            for (const fn of listeners)
                                fn(msg.params);
                        }
                    }
                }
                catch { }
            });
        });
    }
    async close() {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        for (const p of this._pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error('CDP connection closed'));
        }
        this._pending.clear();
        this._eventListeners.clear();
    }
    async send(method, params = {}, timeoutMs = CDP_SEND_TIMEOUT) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            throw new Error('CDP connection is not open');
        }
        const id = ++this._idCounter;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`CDP command '${method}' timed out after ${timeoutMs / 1000}s`));
            }, timeoutMs);
            this._pending.set(id, { resolve, reject, timer });
            this._ws.send(JSON.stringify({ id, method, params }));
        });
    }
    on(event, handler) {
        let set = this._eventListeners.get(event);
        if (!set) {
            set = new Set();
            this._eventListeners.set(event, set);
        }
        set.add(handler);
    }
    off(event, handler) {
        this._eventListeners.get(event)?.delete(handler);
    }
    waitForEvent(event, timeoutMs = 15_000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Timed out waiting for CDP event '${event}'`));
            }, timeoutMs);
            const handler = (params) => {
                clearTimeout(timer);
                this.off(event, handler);
                resolve(params);
            };
            this.on(event, handler);
        });
    }
}
class CDPPage extends BasePage {
    bridge;
    _pageEnabled = false;
    _currentTargetId; // Current page identity for setActivePage/getActivePage
    _frameContexts = new Map(); // frameId → executionContextId
    // Human-like behavior state
    _mouseX = 0;
    _mouseY = 0;
    _humanConfig = null;
    // Network capture state (mirrors extension/src/cdp.ts NetworkCaptureEntry shape)
    _networkCapturing = false;
    _networkCapturePattern = '';
    _networkEntries = [];
    _pendingRequests = new Map(); // requestId → index in _networkEntries
    _pendingBodyFetches = new Set(); // track in-flight getResponseBody calls
    _consoleMessages = [];
    _consoleCapturing = false;
    constructor(bridge) {
        super();
        this.bridge = bridge;
    }
    async goto(url, options) {
        if (!this._pageEnabled) {
            await this.bridge.send('Page.enable');
            this._pageEnabled = true;
        }
        const loadPromise = this.bridge.waitForEvent('Page.loadEventFired', 30_000).catch(() => { });
        await this.bridge.send('Page.navigate', { url });
        await loadPromise;
        this._lastUrl = url;
        if (options?.waitUntil !== 'none') {
            const maxMs = options?.settleMs ?? 1000;
            await this.evaluate(waitForDomStableJs(maxMs, Math.min(500, maxMs)));
        }
    }
    async evaluate(js) {
        const expression = wrapForEval(js);
        const result = await this.bridge.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            throw new Error('Evaluate error: ' + (result.exceptionDetails.exception?.description || 'Unknown exception'));
        }
        return result.result?.value;
    }
    async getCookies(opts = {}) {
        const result = await this.bridge.send('Network.getCookies', opts.url ? { urls: [opts.url] } : {});
        const cookies = isRecord(result) && Array.isArray(result.cookies) ? result.cookies : [];
        const domain = opts.domain;
        return domain
            ? cookies.filter((cookie) => isCookie(cookie) && matchesCookieDomain(cookie.domain, domain))
            : cookies;
    }
    async screenshot(options = {}) {
        const result = await this.bridge.send('Page.captureScreenshot', {
            format: options.format ?? 'png',
            quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
            captureBeyondViewport: options.fullPage ?? false,
        });
        const base64 = isRecord(result) && typeof result.data === 'string' ? result.data : '';
        if (options.path) {
            await saveBase64ToFile(base64, options.path);
        }
        return base64;
    }
    async startNetworkCapture(pattern = '') {
        // Always update the filter pattern
        this._networkCapturePattern = pattern;
        // Reset state only on first start; avoid wiping entries if already capturing
        if (!this._networkCapturing) {
            this._networkEntries = [];
            this._pendingRequests.clear();
            this._pendingBodyFetches.clear();
            await this.bridge.send('Network.enable');
            // Step 1: Record request method/url on requestWillBeSent
            this.bridge.on('Network.requestWillBeSent', (params) => {
                const p = params;
                if (!this._networkCapturePattern || p.request.url.includes(this._networkCapturePattern)) {
                    const idx = this._networkEntries.push({
                        url: p.request.url,
                        method: p.request.method,
                        timestamp: p.timestamp,
                    }) - 1;
                    this._pendingRequests.set(p.requestId, idx);
                }
            });
            // Step 2: Fill in response metadata on responseReceived
            this.bridge.on('Network.responseReceived', (params) => {
                const p = params;
                const idx = this._pendingRequests.get(p.requestId);
                if (idx !== undefined) {
                    this._networkEntries[idx].responseStatus = p.response.status;
                    this._networkEntries[idx].responseContentType = p.response.mimeType || '';
                }
            });
            // Step 3: Fetch body on loadingFinished (body is only reliably available after this)
            this.bridge.on('Network.loadingFinished', (params) => {
                const p = params;
                const idx = this._pendingRequests.get(p.requestId);
                if (idx !== undefined) {
                    const bodyFetch = this.bridge.send('Network.getResponseBody', { requestId: p.requestId }).then((result) => {
                        const r = result;
                        if (typeof r?.body === 'string') {
                            const fullSize = r.body.length;
                            const truncated = fullSize > CDP_RESPONSE_BODY_CAPTURE_LIMIT;
                            const body = truncated ? r.body.slice(0, CDP_RESPONSE_BODY_CAPTURE_LIMIT) : r.body;
                            this._networkEntries[idx].responsePreview = r.base64Encoded ? `base64:${body}` : body;
                            this._networkEntries[idx].responseBodyFullSize = fullSize;
                            this._networkEntries[idx].responseBodyTruncated = truncated;
                        }
                    }).catch(() => {
                        // Body unavailable for some requests (e.g. uploads) — non-fatal
                    }).finally(() => {
                        this._pendingBodyFetches.delete(bodyFetch);
                    });
                    this._pendingBodyFetches.add(bodyFetch);
                    this._pendingRequests.delete(p.requestId);
                }
            });
            this._networkCapturing = true;
        }
        return true;
    }
    async readNetworkCapture() {
        // Await all in-flight body fetches so entries have responsePreview populated
        if (this._pendingBodyFetches.size > 0) {
            await Promise.all([...this._pendingBodyFetches]);
        }
        const entries = [...this._networkEntries];
        this._networkEntries = [];
        return entries;
    }
    async consoleMessages(level = 'all') {
        if (!this._consoleCapturing) {
            await this.bridge.send('Runtime.enable');
            this.bridge.on('Runtime.consoleAPICalled', (params) => {
                const p = params;
                const text = (p.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
                this._consoleMessages.push({ type: p.type, text, timestamp: p.timestamp });
                if (this._consoleMessages.length > 500)
                    this._consoleMessages.shift();
            });
            // Capture uncaught exceptions as error-level messages
            this.bridge.on('Runtime.exceptionThrown', (params) => {
                const p = params;
                const desc = p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'Unknown exception';
                this._consoleMessages.push({ type: 'error', text: desc, timestamp: p.timestamp });
                if (this._consoleMessages.length > 500)
                    this._consoleMessages.shift();
            });
            this._consoleCapturing = true;
        }
        if (level === 'all')
            return [...this._consoleMessages];
        // 'error' level includes both console.error() and uncaught exceptions
        if (level === 'error')
            return this._consoleMessages.filter(m => m.type === 'error' || m.type === 'warning');
        return this._consoleMessages.filter(m => m.type === level);
    }
    async tabs() {
        // Use CDP Target domain to list all targets (pages/tabs)
        const result = await this.bridge.send('Target.getTargets');
        // Target.getTargets returns { targetInfos: TargetInfo[] }
        // Each TargetInfo has: targetId, type, url, title, etc.
        const targets = isRecord(result) && Array.isArray(result.targetInfos) ? result.targetInfos : [];
        // Filter to 'page' type targets only (not background_page, service_worker, iframe, etc.)
        return targets
            .filter((t) => {
            const target = t;
            return target.type === 'page';
        })
            .map((t, i) => {
            const target = t;
            const pageId = target.targetId || target.id;
            return {
                index: i,
                page: pageId,
                url: target.url,
                title: target.title,
                active: false,
            };
        });
    }
    async selectTab(target) {
        // CDP Target domain doesn't have a "select" concept like chrome.tabs.update.
        // In direct CDP mode, you operate on whichever target you connect to.
        // This is a no-op placeholder to satisfy the IPage interface.
        // For real tab switching, you would need to:
        // 1. Close current CDP connection
        // 2. Connect to a different target's WebSocket URL
        // This is a design limitation of direct CDP mode vs extension mode.
    }
    // ─── Tab creation/closing via CDP Target domain ───────────────────────────
    /**
     * Create a new tab/page target via CDP Target.createTarget.
     * Returns the targetId of the newly created page.
     * Note: The new tab is NOT automatically connected - caller must establish
     * a new CDP WebSocket connection to the new target's webSocketDebuggerUrl.
     */
    async newTab(url) {
        const result = await this.bridge.send('Target.createTarget', {
            url: url ?? 'about:blank',
        });
        return result.targetId;
    }
    /**
     * Close a tab/page target via CDP Target.closeTarget.
     * If no target specified, closes the current connected target (if tracked).
     */
    async closeTab(target) {
        let targetId;
        if (typeof target === 'string') {
            targetId = target;
        }
        else if (typeof target === 'number') {
            // Index-based: resolve via tabs()
            const tabs = await this.tabs();
            const tab = tabs.find(t => t.index === target);
            targetId = tab?.page;
        }
        else {
            targetId = this._currentTargetId;
        }
        if (!targetId) {
            throw new Error('No target to close - specify a targetId or index');
        }
        await this.bridge.send('Target.closeTarget', { targetId });
        if (targetId === this._currentTargetId) {
            this._currentTargetId = undefined;
            this._lastUrl = null;
        }
    }
    // ─── Window/Page identity management ──────────────────────────────────────
    /** Get the active page identity (targetId) */
    getActivePage() {
        return this._currentTargetId;
    }
    /** Bind this Page instance to a specific page identity (targetId) */
    setActivePage(page) {
        this._currentTargetId = page;
        this._lastUrl = null;
    }
    /**
     * Close the current browser window/target.
     * In direct CDP mode, this closes the connected target via Target.closeTarget.
     */
    async closeWindow() {
        if (this._currentTargetId) {
            await this.bridge.send('Target.closeTarget', { targetId: this._currentTargetId });
        }
        this._currentTargetId = undefined;
        this._lastUrl = null;
    }
    /**
     * Insert text via native CDP Input.insertText into the currently focused element.
     * Alias for nativeType - useful for rich editors.
     */
    async insertText(text) {
        await this.bridge.send('Input.insertText', { text });
    }
    // ─── Native input methods (CDP Input domain) ───────────────────────────
    /** Precise click using CDP Input.dispatchMouseEvent */
    async nativeClick(x, y) {
        await this.bridge.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x, y,
            button: 'left',
            clickCount: 1,
        });
        await this.bridge.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x, y,
            button: 'left',
            clickCount: 1,
        });
    }
    // ─── Human-like input methods ─────────────────────────────────────────────
    /**
     * Human-like mouse movement with Bezier curve trajectory.
     * Simulates natural mouse movement: curves, variable speed, overshoot, jitter.
     */
    async humanMove(x, y) {
        const cfg = this._humanConfig ?? getHumanConfig();
        const distance = Math.sqrt(Math.pow(x - this._mouseX, 2) + Math.pow(y - this._mouseY, 2));
        // For very short distances, just move directly
        if (distance < 5) {
            await this.bridge.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x, y,
            });
            this._mouseX = x;
            this._mouseY = y;
            return;
        }
        // Calculate steps based on distance
        const steps = Math.max(cfg.mouseBezierStepsMin, Math.min(cfg.mouseBezierStepsMax, Math.floor(distance / 5)));
        // Generate Bezier curve trajectory
        let points = generateBezierCurve(this._mouseX, this._mouseY, x, y, steps, cfg.mouseJitterRange);
        // Overshoot logic: sometimes overshoot and correct back
        if (Math.random() < cfg.mouseOvershootProbability) {
            const overshootFactor = randomInRange(cfg.mouseOvershootFactorMin, cfg.mouseOvershootFactorMax);
            const overshootPoints = generateOvershootCurve(x, y, this._mouseX, this._mouseY, overshootFactor, 15, cfg.mouseJitterRange);
            points = points.concat(overshootPoints);
        }
        // Calculate duration based on speed
        const duration = distance / randomInRange(cfg.mouseSpeedMin, cfg.mouseSpeedMax);
        const totalPoints = points.length;
        // Move along trajectory with ease-in-out speed
        for (let i = 0; i < totalPoints; i++) {
            const point = points[i];
            const t = i / totalPoints;
            const speedFactor = easeInOut(t);
            const baseDelay = duration / totalPoints;
            const delay = baseDelay / (speedFactor + 0.3) + randomInRange(-0.002, 0.005);
            await this.bridge.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: point.x,
                y: point.y,
            });
            this._mouseX = point.x;
            this._mouseY = point.y;
            // Small delay between points (convert seconds to ms)
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }
        // Ensure we end at exact target
        this._mouseX = x;
        this._mouseY = y;
    }
    /**
     * Human-like click with trajectory movement, jitter, and natural press duration.
     */
    async humanClick(x, y) {
        const cfg = this._humanConfig ?? getHumanConfig();
        // Add jitter to click position (don't always click exact center)
        const actualX = x + randomInRange(-cfg.mouseClickJitterPx, cfg.mouseClickJitterPx);
        const actualY = y + randomInRange(-cfg.mouseClickJitterPx, cfg.mouseClickJitterPx);
        // Move to target with human trajectory
        await this.humanMove(actualX, actualY);
        // Small hover delay before clicking
        await new Promise(resolve => setTimeout(resolve, randomInRange(50, 150)));
        // Press with natural duration (human takes 50-150ms between down/up)
        const pressDuration = randomInRange(cfg.mouseClickDelayMinMs, cfg.mouseClickDelayMaxMs);
        await this.bridge.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: actualX,
            y: actualY,
            button: 'left',
            clickCount: 1,
        });
        await new Promise(resolve => setTimeout(resolve, pressDuration));
        await this.bridge.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: actualX,
            y: actualY,
            button: 'left',
            clickCount: 1,
        });
        // Small delay after click
        await new Promise(resolve => setTimeout(resolve, randomInRange(50, 150)));
    }
    /**
     * Human-like typing with variable speed, typo simulation, and thinking pauses.
     * Uses Input.dispatchKeyEvent for individual characters (not Input.insertText).
     */
    async humanType(text) {
        const cfg = this._humanConfig ?? getHumanConfig();
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Typo simulation: press adjacent key and correct
            if (Math.random() < cfg.keyTypoProbability) {
                const wrongChar = getAdjacentKey(char);
                if (wrongChar) {
                    // Press wrong key
                    await this._dispatchKeyChar(wrongChar);
                    await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.keyTypoDelayMinMs, cfg.keyTypoDelayMaxMs)));
                    // Press Backspace to correct
                    await this.bridge.send('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: 'Backspace',
                        code: 'Backspace',
                    });
                    await new Promise(resolve => setTimeout(resolve, randomInRange(80, 150)));
                    await this.bridge.send('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: 'Backspace',
                        code: 'Backspace',
                    });
                    await new Promise(resolve => setTimeout(resolve, randomInRange(100, 250)));
                }
            }
            // Press correct character
            await this._dispatchKeyChar(char);
            // Thinking pause simulation (every N chars, may pause longer)
            const shouldPause = i > 0 && i % cfg.keyTypoPauseWordCount === 0 && Math.random() < cfg.keyTypoPauseProbability;
            if (shouldPause) {
                await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.keyThinkingPauseMinMs, cfg.keyThinkingPauseMaxMs)));
            }
            else {
                // Normal key delay
                await new Promise(resolve => setTimeout(resolve, randomIntInRange(cfg.keyDelayMinMs, cfg.keyDelayMaxMs)));
            }
        }
    }
    /**
     * Dispatch a single character key event.
     */
    async _dispatchKeyChar(char) {
        // Handle special characters
        if (char === ' ') {
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: ' ',
                code: 'Space',
            });
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: ' ',
                code: 'Space',
            });
            return;
        }
        if (char === '\n' || char === '\r') {
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Enter',
                code: 'Enter',
            });
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Enter',
                code: 'Enter',
            });
            return;
        }
        if (char === '\t') {
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Tab',
                code: 'Tab',
            });
            await this.bridge.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Tab',
                code: 'Tab',
            });
            return;
        }
        // Regular character - use insertText for reliability (handles Unicode/CJK)
        // For human-like typing, we still want individual character insertion
        await this.bridge.send('Input.insertText', { text: char });
    }
    /**
     * Human-like scroll with non-linear steps, reading pauses, and backtrack behavior.
     */
    async humanScrollDown(pixels) {
        const cfg = this._humanConfig ?? getHumanConfig();
        const targetPixels = pixels ?? randomIntInRange(cfg.scrollStepMinPx, cfg.scrollStepMaxPx);
        // Backtrack simulation: 10% chance to scroll back a bit first (looking back)
        if (Math.random() < cfg.scrollBacktrackProbability) {
            const backtrack = randomIntInRange(cfg.scrollBacktrackMinPx, cfg.scrollBacktrackMaxPx);
            await this.bridge.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                deltaX: 0,
                deltaY: -backtrack, // Negative = scroll up/back
            });
            await new Promise(resolve => setTimeout(resolve, randomInRange(100, 300)));
        }
        // Scroll down
        await this.bridge.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            deltaX: 0,
            deltaY: targetPixels,
        });
        // Reading pause
        await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.scrollPauseMinMs, cfg.scrollPauseMaxMs)));
    }
    /**
     * Human-like scroll to bottom of page with iterative scrolling and pauses.
     */
    async humanScrollToBottom(maxIterations = 100) {
        const cfg = this._humanConfig ?? getHumanConfig();
        let iterations = 0;
        // Get initial scroll position
        const initialScroll = await this.evaluate(`
      (() => ({
        scrollHeight: document.body.scrollHeight,
        scrollTop: document.documentElement.scrollTop || document.body.scrollTop,
        clientHeight: document.documentElement.clientHeight || document.body.clientHeight
      }))()
    `);
        if (!initialScroll)
            return 0;
        let { scrollHeight, scrollTop, clientHeight } = initialScroll;
        while (scrollTop + clientHeight < scrollHeight - 50 && iterations < maxIterations) {
            iterations++;
            const scrollStep = randomIntInRange(cfg.scrollStepMinPx, cfg.scrollStepMaxPx);
            // Backtrack chance
            if (Math.random() < cfg.scrollBacktrackProbability) {
                const backtrack = randomIntInRange(cfg.scrollBacktrackMinPx, cfg.scrollBacktrackMaxPx);
                await this.bridge.send('Input.dispatchMouseEvent', {
                    type: 'mouseWheel',
                    deltaX: 0,
                    deltaY: -backtrack,
                });
                await new Promise(resolve => setTimeout(resolve, randomInRange(100, 300)));
            }
            // Scroll down
            await this.bridge.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                deltaX: 0,
                deltaY: scrollStep,
            });
            // Reading pause
            await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.scrollPauseMinMs, cfg.scrollPauseMaxMs)));
            // Update scroll state
            const state = await this.evaluate(`
        (() => ({
          scrollHeight: document.body.scrollHeight,
          scrollTop: document.documentElement.scrollTop || document.body.scrollTop,
          clientHeight: document.documentElement.clientHeight || document.body.clientHeight
        }))()
      `);
            if (state) {
                scrollHeight = state.scrollHeight;
                scrollTop = state.scrollTop;
                clientHeight = state.clientHeight;
            }
        }
        return iterations;
    }
    /**
     * Set human behavior configuration (overrides environment defaults).
     */
    setHumanConfig(cfg) {
        this._humanConfig = { ...getHumanConfig(), ...cfg };
    }
    /**
     * Smart click: uses human mode if enabled, otherwise native click.
     */
    async smartClick(x, y) {
        if (isHumanModeEnabled()) {
            await this.humanClick(x, y);
        }
        else {
            await this.nativeClick(x, y);
        }
    }
    /**
     * Smart type: uses human mode if enabled, otherwise instant insert.
     */
    async smartType(text) {
        if (isHumanModeEnabled()) {
            await this.humanType(text);
        }
        else {
            await this.nativeType(text);
        }
    }
    /** Precise text insertion using CDP Input.insertText (handles Unicode/CJK) */
    async nativeType(text) {
        await this.bridge.send('Input.insertText', { text });
    }
    /** Key press with modifiers using CDP Input.dispatchKeyEvent */
    async nativeKeyPress(key, modifiers = []) {
        let modifierFlags = 0;
        for (const mod of modifiers) {
            if (mod === 'Alt')
                modifierFlags |= 1;
            if (mod === 'Ctrl')
                modifierFlags |= 2;
            if (mod === 'Meta')
                modifierFlags |= 4;
            if (mod === 'Shift')
                modifierFlags |= 8;
        }
        await this.bridge.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key,
            modifiers: modifierFlags,
        });
        await this.bridge.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key,
            modifiers: modifierFlags,
        });
    }
    // ─── CDP passthrough for advanced DOM/Input operations ──────────────────
    /** Direct CDP command passthrough (mirrors extension's handleCdp) */
    async cdp(method, params = {}) {
        return this.bridge.send(method, params);
    }
    // ─── File upload via CDP DOM.setFileInputFiles ──────────────────────────
    /**
     * Set local file paths on a file input element via CDP.
     * Chrome reads files directly from local filesystem, bypassing base64 limits.
     * Ported from extension/src/cdp.ts setFileInputFiles()
     */
    async setFileInput(files, selector) {
        await this.bridge.send('DOM.enable');
        const doc = await this.bridge.send('DOM.getDocument');
        const rootNodeId = doc.root?.nodeId;
        if (!rootNodeId) {
            throw new Error('Failed to get document root nodeId');
        }
        const query = selector || 'input[type="file"]';
        const result = await this.bridge.send('DOM.querySelector', {
            nodeId: rootNodeId,
            selector: query,
        });
        if (!result?.nodeId) {
            throw new Error(`No element found matching selector: ${query}`);
        }
        await this.bridge.send('DOM.setFileInputFiles', {
            files,
            nodeId: result.nodeId,
        });
    }
    // ─── Frame tracking for cross-origin frame execution ────────────────────
    /** Enable frame context tracking (call after Page.enable) */
    async enableFrameTracking() {
        this.bridge.on('Runtime.executionContextCreated', (params) => {
            const p = params;
            if (p.context?.auxData?.frameId && p.context.auxData.isDefault === true) {
                this._frameContexts.set(p.context.auxData.frameId, p.context.id);
            }
        });
        this.bridge.on('Runtime.executionContextDestroyed', (params) => {
            const p = params;
            if (p.executionContextId) {
                for (const [fid, cid] of this._frameContexts) {
                    if (cid === p.executionContextId) {
                        this._frameContexts.delete(fid);
                        break;
                    }
                }
            }
        });
        this.bridge.on('Runtime.executionContextsCleared', () => {
            this._frameContexts.clear();
        });
        await this.bridge.send('Runtime.enable');
    }
    /** Get frame tree (cross-origin frames) */
    async frames() {
        const tree = await this.bridge.send('Page.getFrameTree');
        const rootFrame = tree.frameTree?.frame;
        if (!rootFrame)
            return [];
        const frames = [];
        const rootOrigin = getUrlOrigin(rootFrame.url);
        // Collect cross-origin frames (same-origin frames expand inline in DOM)
        const collect = (node, accessibleOrigin) => {
            const n = node;
            for (const child of (n.childFrames || [])) {
                const c = child;
                const frame = c.frame;
                const frameUrl = frame?.url || frame?.unreachableUrl || '';
                const frameOrigin = getUrlOrigin(frameUrl);
                // Same-origin frames expand inline, don't get an [F#] slot
                if (accessibleOrigin && frameOrigin && frameOrigin === accessibleOrigin) {
                    collect(child, frameOrigin);
                    continue;
                }
                frames.push({
                    index: frames.length,
                    frameId: frame?.id || '',
                    url: frameUrl,
                    name: frame?.name || '',
                });
            }
        };
        collect(tree.frameTree, rootOrigin);
        return frames;
    }
    /** Execute JS in a specific frame by index */
    async evaluateInFrame(js, frameIndex) {
        if (!this._pageEnabled) {
            await this.bridge.send('Page.enable');
            this._pageEnabled = true;
            await this.enableFrameTracking();
        }
        const frames = await this.frames();
        if (frameIndex < 0 || frameIndex >= frames.length) {
            throw new Error(`Frame index ${frameIndex} out of range (${frames.length} cross-origin frames available)`);
        }
        const frame = frames[frameIndex];
        const contextId = this._frameContexts.get(frame.frameId);
        if (contextId === undefined) {
            throw new Error(`No execution context found for frame ${frame.frameId}. The frame may not be loaded yet.`);
        }
        const expression = wrapForEval(js);
        const result = await this.bridge.send('Runtime.evaluate', {
            expression,
            contextId,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            throw new Error('Evaluate error: ' + (result.exceptionDetails.exception?.description || 'Unknown exception'));
        }
        return result.result?.value;
    }
}
function isCookie(value) {
    return isRecord(value)
        && typeof value.name === 'string'
        && typeof value.value === 'string'
        && typeof value.domain === 'string';
}
function matchesCookieDomain(cookieDomain, targetDomain) {
    const normalizedCookieDomain = cookieDomain.replace(/^\./, '').toLowerCase();
    const normalizedTargetDomain = targetDomain.replace(/^\./, '').toLowerCase();
    return normalizedTargetDomain === normalizedCookieDomain
        || normalizedTargetDomain.endsWith(`.${normalizedCookieDomain}`);
}
function selectCDPTarget(targets) {
    const preferredPattern = compilePreferredPattern(process.env.OPENCLI_CDP_TARGET);
    const ranked = targets
        .map((target, index) => ({ target, index, score: scoreCDPTarget(target, preferredPattern) }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return a.index - b.index;
    });
    return ranked[0]?.target;
}
function scoreCDPTarget(target, preferredPattern) {
    if (!target.webSocketDebuggerUrl)
        return Number.NEGATIVE_INFINITY;
    const type = (target.type ?? '').toLowerCase();
    const url = (target.url ?? '').toLowerCase();
    const title = (target.title ?? '').toLowerCase();
    const haystack = `${title} ${url}`;
    if (!haystack.trim() && !type)
        return Number.NEGATIVE_INFINITY;
    if (haystack.includes('devtools'))
        return Number.NEGATIVE_INFINITY;
    if (type === 'background_page' || type === 'service_worker')
        return Number.NEGATIVE_INFINITY;
    let score = 0;
    if (preferredPattern && preferredPattern.test(haystack))
        score += 1000;
    if (type === 'app')
        score += 120;
    else if (type === 'webview')
        score += 100;
    else if (type === 'page')
        score += 80;
    else if (type === 'iframe')
        score += 20;
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost'))
        score += 90;
    if (url.startsWith('file://'))
        score += 60;
    if (url.startsWith('http://127.0.0.1') || url.startsWith('https://127.0.0.1'))
        score += 50;
    if (url.startsWith('about:blank'))
        score -= 120;
    if (url === '' || url === 'about:blank')
        score -= 40;
    if (title && title !== 'devtools')
        score += 25;
    // Boost score for known Electron app names from the registry (builtin + user-defined)
    const appNames = Object.values(getAllElectronApps()).map(a => (a.displayName ?? a.processName).toLowerCase());
    for (const name of appNames) {
        if (title.includes(name)) {
            score += 120;
            break;
        }
    }
    for (const name of appNames) {
        if (url.includes(name)) {
            score += 100;
            break;
        }
    }
    return score;
}
function compilePreferredPattern(raw) {
    const value = raw?.trim();
    if (!value)
        return undefined;
    return new RegExp(escapeRegExp(value.toLowerCase()));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getUrlOrigin(url) {
    if (!url)
        return null;
    try {
        return new URL(url).origin;
    }
    catch {
        return null;
    }
}
export const __test__ = {
    selectCDPTarget,
    scoreCDPTarget,
};
function fetchJsonDirect(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const request = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(parsed, (res) => {
            const statusCode = res.statusCode ?? 0;
            if (statusCode < 200 || statusCode >= 300) {
                res.resume();
                reject(new Error(`Failed to fetch CDP targets: HTTP ${statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                }
                catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(10_000, () => request.destroy(new Error('Timed out fetching CDP targets')));
        request.end();
    });
}
