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
import { sendCommand, sendCommandFull } from './daemon-client.js';
import { wrapForEval } from './utils.js';
import { saveBase64ToFile } from '../utils.js';
import { generateStealthJs } from './stealth.js';
import { waitForDomStableJs } from './dom-helpers.js';
import { BasePage } from './base-page.js';
import { classifyBrowserError } from './errors.js';
import { log } from '../logger.js';
import { isHumanModeEnabled, getHumanConfig, randomIntInRange, randomInRange } from './human.js';
function isUnsupportedNetworkCaptureError(err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.toLowerCase();
    return (normalized.includes('unknown action') && normalized.includes('network-capture'))
        || (normalized.includes('network capture') && normalized.includes('not supported'));
}
/**
 * Page — implements IPage by talking to the daemon via HTTP.
 */
export class Page extends BasePage {
    workspace;
    _idleTimeout;
    constructor(workspace = 'default', idleTimeout) {
        super();
        this.workspace = workspace;
        this._idleTimeout = idleTimeout;
    }
    /** Active page identity (targetId), set after navigate and used in all subsequent commands */
    _page;
    _networkCaptureUnsupported = false;
    _networkCaptureWarned = false;
    /** Helper: spread workspace into command params */
    _wsOpt() {
        return { workspace: this.workspace, ...(this._idleTimeout != null && { idleTimeout: this._idleTimeout }) };
    }
    /** Helper: spread workspace + page identity into command params */
    _cmdOpts() {
        return {
            workspace: this.workspace,
            ...(this._page !== undefined && { page: this._page }),
            ...(this._idleTimeout != null && { idleTimeout: this._idleTimeout }),
        };
    }
    async goto(url, options) {
        const result = await sendCommandFull('navigate', {
            url,
            ...this._cmdOpts(),
        });
        // Remember the page identity (targetId) for subsequent calls
        if (result.page) {
            this._page = result.page;
        }
        this._lastUrl = url;
        // Inject stealth + settle in a single round-trip instead of two sequential exec calls.
        // The stealth guard flag prevents double-injection; settle uses DOM stability detection.
        if (options?.waitUntil !== 'none') {
            const maxMs = options?.settleMs ?? 1000;
            const combinedCode = `${generateStealthJs()};\n${waitForDomStableJs(maxMs, Math.min(500, maxMs))}`;
            const combinedOpts = {
                code: combinedCode,
                ...this._cmdOpts(),
            };
            try {
                await sendCommand('exec', combinedOpts);
            }
            catch (err) {
                const advice = classifyBrowserError(err);
                // Only settle-retry on target navigation (SPA client-side redirects).
                // Extension/daemon errors are already retried by sendCommandRaw —
                // retrying them here would silently swallow real failures.
                if (advice.kind !== 'target-navigation')
                    throw err;
                try {
                    await new Promise((r) => setTimeout(r, advice.delayMs));
                    await sendCommand('exec', combinedOpts);
                }
                catch (retryErr) {
                    if (classifyBrowserError(retryErr).kind !== 'target-navigation')
                        throw retryErr;
                }
            }
        }
        else {
            // Even with waitUntil='none', still inject stealth (best-effort)
            try {
                await sendCommand('exec', {
                    code: generateStealthJs(),
                    ...this._cmdOpts(),
                });
            }
            catch {
                // Non-fatal: stealth is best-effort
            }
        }
    }
    /** Get the active page identity (targetId) */
    getActivePage() {
        return this._page;
    }
    /** Bind this Page instance to a specific page identity (targetId). */
    setActivePage(page) {
        this._page = page;
        this._lastUrl = null;
    }
    _markUnsupportedNetworkCapture() {
        this._networkCaptureUnsupported = true;
        if (this._networkCaptureWarned)
            return;
        this._networkCaptureWarned = true;
        log.warn('Browser Bridge extension does not support network capture; continuing without it. ' +
            'Explore output may miss API endpoints until you reload or reinstall the extension.');
    }
    async evaluate(js) {
        const code = wrapForEval(js);
        try {
            return await sendCommand('exec', { code, ...this._cmdOpts() });
        }
        catch (err) {
            const advice = classifyBrowserError(err);
            if (advice.kind !== 'target-navigation')
                throw err;
            await new Promise((resolve) => setTimeout(resolve, advice.delayMs));
            return sendCommand('exec', { code, ...this._cmdOpts() });
        }
    }
    async getCookies(opts = {}) {
        const result = await sendCommand('cookies', { ...this._wsOpt(), ...opts });
        return Array.isArray(result) ? result : [];
    }
    /** Close the automation window in the extension */
    async closeWindow() {
        try {
            await sendCommand('close-window', { ...this._wsOpt() });
        }
        catch {
            // Window may already be closed or daemon may be down
        }
        finally {
            this._page = undefined;
            this._lastUrl = null;
            this._networkCaptureUnsupported = false;
            this._networkCaptureWarned = false;
        }
    }
    async tabs() {
        const result = await sendCommand('tabs', { op: 'list', ...this._wsOpt() });
        return Array.isArray(result) ? result : [];
    }
    async newTab(url) {
        const result = await sendCommandFull('tabs', {
            op: 'new',
            ...(url !== undefined && { url }),
            ...this._wsOpt(),
        });
        this._lastUrl = null;
        return result.page;
    }
    async closeTab(target) {
        const params = { op: 'close', ...this._wsOpt() };
        if (typeof target === 'number')
            params.index = target;
        else if (typeof target === 'string')
            params.page = target;
        else if (this._page !== undefined)
            params.page = this._page;
        const result = await sendCommand('tabs', params);
        const closedPage = typeof result?.closed === 'string' ? result.closed : undefined;
        if ((closedPage && closedPage === this._page) || (!closedPage && (target === undefined || target === this._page))) {
            this._page = undefined;
            this._lastUrl = null;
        }
    }
    async selectTab(target) {
        const result = await sendCommandFull('tabs', {
            op: 'select',
            ...(typeof target === 'number' ? { index: target } : { page: target }),
            ...this._wsOpt(),
        });
        if (result.page)
            this._page = result.page;
        this._lastUrl = null;
    }
    /**
     * Capture a screenshot via CDP Page.captureScreenshot.
     */
    async screenshot(options = {}) {
        const base64 = await sendCommand('screenshot', {
            ...this._cmdOpts(),
            format: options.format,
            quality: options.quality,
            fullPage: options.fullPage,
        });
        if (options.path) {
            await saveBase64ToFile(base64, options.path);
        }
        return base64;
    }
    async startNetworkCapture(pattern = '') {
        if (this._networkCaptureUnsupported)
            return false;
        try {
            await sendCommand('network-capture-start', {
                pattern,
                ...this._cmdOpts(),
            });
            return true;
        }
        catch (err) {
            if (!isUnsupportedNetworkCaptureError(err))
                throw err;
            this._markUnsupportedNetworkCapture();
            return false;
        }
    }
    async readNetworkCapture() {
        if (this._networkCaptureUnsupported)
            return [];
        try {
            const result = await sendCommand('network-capture-read', {
                ...this._cmdOpts(),
            });
            return Array.isArray(result) ? result : [];
        }
        catch (err) {
            if (!isUnsupportedNetworkCaptureError(err))
                throw err;
            this._markUnsupportedNetworkCapture();
            return [];
        }
    }
    /**
     * Set local file paths on a file input element via CDP DOM.setFileInputFiles.
     * Chrome reads the files directly from the local filesystem, avoiding the
     * payload size limits of base64-in-evaluate.
     */
    async setFileInput(files, selector) {
        const result = await sendCommand('set-file-input', {
            files,
            selector,
            ...this._cmdOpts(),
        });
        if (!result?.count) {
            throw new Error('setFileInput returned no count — command may not be supported by the extension');
        }
    }
    async insertText(text) {
        const result = await sendCommand('insert-text', {
            text,
            ...this._cmdOpts(),
        });
        if (!result?.inserted) {
            throw new Error('insertText returned no inserted flag — command may not be supported by the extension');
        }
    }
    async frames() {
        const result = await sendCommand('frames', { ...this._cmdOpts() });
        return Array.isArray(result) ? result : [];
    }
    async evaluateInFrame(js, frameIndex) {
        const code = wrapForEval(js);
        return sendCommand('exec', { code, frameIndex, ...this._cmdOpts() });
    }
    async cdp(method, params = {}) {
        return sendCommand('cdp', {
            cdpMethod: method,
            cdpParams: params,
            ...this._cmdOpts(),
        });
    }
    /** CDP native click fallback — called when JS el.click() fails */
    async tryNativeClick(x, y) {
        try {
            await this.nativeClick(x, y);
            return true;
        }
        catch {
            return false;
        }
    }
    /** Precise click using DOM.getContentQuads/getBoxModel for inline elements */
    async clickWithQuads(ref) {
        const safeRef = JSON.stringify(ref);
        const cssSelector = `[data-opencli-ref="${ref.replace(/"/g, '\\"')}"]`;
        // Scroll element into view first
        await this.evaluate(`
      (() => {
        const el = document.querySelector('[data-opencli-ref="' + ${safeRef} + '"]');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        return !!el;
      })()
    `);
        try {
            // Find DOM node via CDP
            const doc = await this.cdp('DOM.getDocument', {});
            const result = await this.cdp('DOM.querySelectorAll', {
                nodeId: doc.root.nodeId,
                selector: cssSelector,
            });
            if (!result.nodeIds?.length)
                throw new Error('DOM node not found');
            const nodeId = result.nodeIds[0];
            // Try getContentQuads first (precise for inline elements)
            try {
                const quads = await this.cdp('DOM.getContentQuads', { nodeId });
                if (quads.quads?.length) {
                    const q = quads.quads[0];
                    const cx = (q[0] + q[2] + q[4] + q[6]) / 4;
                    const cy = (q[1] + q[3] + q[5] + q[7]) / 4;
                    await this.nativeClick(Math.round(cx), Math.round(cy));
                    return;
                }
            }
            catch { /* fallthrough */ }
            // Try getBoxModel
            try {
                const box = await this.cdp('DOM.getBoxModel', { nodeId });
                if (box.model?.content) {
                    const c = box.model.content;
                    const cx = (c[0] + c[2] + c[4] + c[6]) / 4;
                    const cy = (c[1] + c[3] + c[5] + c[7]) / 4;
                    await this.nativeClick(Math.round(cx), Math.round(cy));
                    return;
                }
            }
            catch { /* fallthrough */ }
        }
        catch { /* fallthrough */ }
        // Final fallback: regular click
        await this.evaluate(`
      (() => {
        const el = document.querySelector('[data-opencli-ref="' + ${safeRef} + '"]');
        if (!el) throw new Error('Element not found: ' + ${safeRef});
        el.click();
        return 'clicked';
      })()
    `);
    }
    async nativeClick(x, y) {
        await this.cdp('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x, y,
            button: 'left',
            clickCount: 1,
        });
        await this.cdp('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x, y,
            button: 'left',
            clickCount: 1,
        });
    }
    async nativeType(text) {
        // Use Input.insertText for reliable Unicode/CJK text insertion
        await this.cdp('Input.insertText', { text });
    }
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
        await this.cdp('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key,
            modifiers: modifierFlags,
        });
        await this.cdp('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key,
            modifiers: modifierFlags,
        });
    }
    // ─── Human-like input methods (passthrough via CDP) ────────────────────────
    /**
     * Human-like mouse movement with Bezier curve trajectory.
     */
    async humanMove(x, y) {
        const cfg = getHumanConfig();
        // Get current mouse position (tracked via JS)
        const currentPos = await this.evaluate(`
      (() => ({ x: window.__opencli_mouseX || 0, y: window.__opencli_mouseY || 0 }))()
    `);
        const startX = currentPos?.x ?? 0;
        const startY = currentPos?.y ?? 0;
        const distance = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        // For short distances, just move
        if (distance < 5) {
            await this.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
            await this.evaluate(`window.__opencli_mouseX = ${x}; window.__opencli_mouseY = ${y}`);
            return;
        }
        // Generate Bezier trajectory in JS and move point-by-point
        const steps = Math.max(cfg.mouseBezierStepsMin, Math.min(cfg.mouseBezierStepsMax, Math.floor(distance / 5)));
        // We need to generate the trajectory and send mouse events
        // For daemon-backed Page, we generate points locally and send CDP commands
        const { generateBezierCurve, generateOvershootCurve, easeInOut } = await import('./human.js');
        let points = generateBezierCurve(startX, startY, x, y, steps, cfg.mouseJitterRange);
        // Overshoot
        if (Math.random() < cfg.mouseOvershootProbability) {
            const overshootFactor = randomInRange(cfg.mouseOvershootFactorMin, cfg.mouseOvershootFactorMax);
            const overshootPoints = generateOvershootCurve(x, y, startX, startY, overshootFactor, 15, cfg.mouseJitterRange);
            points = points.concat(overshootPoints);
        }
        const duration = distance / randomInRange(cfg.mouseSpeedMin, cfg.mouseSpeedMax);
        const totalPoints = points.length;
        for (let i = 0; i < totalPoints; i++) {
            const point = points[i];
            const t = i / totalPoints;
            const speedFactor = easeInOut(t);
            const baseDelay = duration / totalPoints;
            const delay = baseDelay / (speedFactor + 0.3) + randomInRange(-0.002, 0.005);
            await this.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
            await this.evaluate(`window.__opencli_mouseX = ${point.x}; window.__opencli_mouseY = ${point.y}`);
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }
        // Final position
        await this.evaluate(`window.__opencli_mouseX = ${x}; window.__opencli_mouseY = ${y}`);
    }
    /**
     * Human-like click with trajectory and natural press duration.
     */
    async humanClick(x, y) {
        const cfg = getHumanConfig();
        const actualX = x + randomInRange(-cfg.mouseClickJitterPx, cfg.mouseClickJitterPx);
        const actualY = y + randomInRange(-cfg.mouseClickJitterPx, cfg.mouseClickJitterPx);
        await this.humanMove(actualX, actualY);
        await new Promise(resolve => setTimeout(resolve, randomInRange(50, 150)));
        const pressDuration = randomInRange(cfg.mouseClickDelayMinMs, cfg.mouseClickDelayMaxMs);
        await this.cdp('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: actualX, y: actualY, button: 'left', clickCount: 1,
        });
        await new Promise(resolve => setTimeout(resolve, pressDuration));
        await this.cdp('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: actualX, y: actualY, button: 'left', clickCount: 1,
        });
        await new Promise(resolve => setTimeout(resolve, randomInRange(50, 150)));
    }
    /**
     * Human-like typing with variable speed and typo simulation.
     */
    async humanType(text) {
        const cfg = getHumanConfig();
        const { getAdjacentKey } = await import('./human.js');
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Typo simulation
            if (Math.random() < cfg.keyTypoProbability) {
                const wrongChar = getAdjacentKey(char);
                if (wrongChar) {
                    await this.nativeType(wrongChar);
                    await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.keyTypoDelayMinMs, cfg.keyTypoDelayMaxMs)));
                    await this.nativeKeyPress('Backspace');
                    await new Promise(resolve => setTimeout(resolve, randomInRange(100, 250)));
                }
            }
            // Correct character
            if (char === ' ') {
                await this.nativeKeyPress('Space');
            }
            else if (char === '\n') {
                await this.nativeKeyPress('Enter');
            }
            else if (char === '\t') {
                await this.nativeKeyPress('Tab');
            }
            else {
                await this.nativeType(char);
            }
            // Thinking pause
            const shouldPause = i > 0 && i % cfg.keyTypoPauseWordCount === 0 && Math.random() < cfg.keyTypoPauseProbability;
            if (shouldPause) {
                await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.keyThinkingPauseMinMs, cfg.keyThinkingPauseMaxMs)));
            }
            else {
                await new Promise(resolve => setTimeout(resolve, randomIntInRange(cfg.keyDelayMinMs, cfg.keyDelayMaxMs)));
            }
        }
    }
    /**
     * Human-like scroll wheel event.
     */
    async _humanScrollWheel(deltaY) {
        await this.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', deltaX: 0, deltaY });
    }
    /**
     * Smart click: uses human mode if enabled.
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
     * Smart type: uses human mode if enabled.
     */
    async smartType(text) {
        if (isHumanModeEnabled()) {
            await this.humanType(text);
        }
        else {
            await this.nativeType(text);
        }
    }
    /**
     * Set human config overrides.
     */
    setHumanConfig(cfg) {
        // Page doesn't have internal config state like CDPPage
        // Config is read from environment each call
        log.warn('setHumanConfig on Page is not supported; use environment variables');
    }
}
