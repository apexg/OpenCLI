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
import { generateSnapshotJs, getFormStateJs } from './dom-snapshot.js';
import { pressKeyJs, waitForTextJs, waitForCaptureJs, waitForSelectorJs, scrollJs, autoScrollJs, networkRequestsJs, waitForDomStableJs, } from './dom-helpers.js';
import { resolveTargetJs, clickResolvedJs, typeResolvedJs, scrollResolvedJs, } from './target-resolver.js';
import { TargetError } from './target-errors.js';
import { isHumanModeEnabled, getHumanConfig, randomIntInRange, randomInRange } from './human.js';
/**
 * Execute `resolveTargetJs` once, throw structured `TargetError` on failure.
 * Single helper so click/typeText/scrollTo share one resolution pathway,
 * which is what the selector-first contract promises agents.
 */
async function runResolve(page, ref, opts = {}) {
    const resolution = (await page.evaluate(resolveTargetJs(ref, opts)));
    if (!resolution.ok) {
        throw new TargetError({
            code: resolution.code,
            message: resolution.message,
            hint: resolution.hint,
            candidates: resolution.candidates,
            matches_n: resolution.matches_n,
        });
    }
    return { matches_n: resolution.matches_n, match_level: resolution.match_level };
}
import { formatSnapshot } from '../snapshotFormatter.js';
export class BasePage {
    _lastUrl = null;
    /** Cached previous snapshot hashes for incremental diff marking */
    _prevSnapshotHashes = null;
    /**
     * Safely evaluate JS with pre-serialized arguments.
     * Each key in `args` becomes a `const` declaration with JSON-serialized value,
     * prepended to the JS code. Prevents injection by design.
     *
     * Usage:
     *   page.evaluateWithArgs(`(async () => { return sym; })()`, { sym: userInput })
     */
    async evaluateWithArgs(js, args) {
        const declarations = Object.entries(args)
            .map(([key, value]) => {
            if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
                throw new Error(`evaluateWithArgs: invalid key "${key}"`);
            }
            return `const ${key} = ${JSON.stringify(value)};`;
        })
            .join('\n');
        return this.evaluate(`${declarations}\n${js}`);
    }
    // ── Shared DOM helper implementations ──
    async click(ref, opts = {}) {
        // Phase 1: Resolve target with fingerprint verification
        const resolved = await runResolve(this, ref, opts);
        // Phase 2: Check human mode for native click
        if (isHumanModeEnabled() && typeof this.smartClick === 'function') {
            // Get element coordinates for human-like click
            const coords = await this.evaluate(`
        (() => {
          const el = window.__resolved;
          if (!el) return null;
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        })()
      `);
            if (coords && coords.x != null && coords.y != null) {
                await this.smartClick(coords.x, coords.y);
                return resolved;
            }
        }
        // Phase 3: Execute DOM click on resolved element (fallback or non-human mode)
        const result = await this.evaluate(clickResolvedJs());
        if (typeof result === 'string' || result == null)
            return resolved;
        if (result.status === 'clicked')
            return resolved;
        // JS click failed — try CDP native click if coordinates available
        if (result.x != null && result.y != null) {
            const success = await this.tryNativeClick(result.x, result.y);
            if (success)
                return resolved;
        }
        throw new Error(`Click failed: ${result.error ?? 'JS click and CDP fallback both failed'}`);
    }
    /** Override in subclasses with CDP native click support */
    async tryNativeClick(_x, _y) {
        return false;
    }
    async typeText(ref, text, opts = {}) {
        const resolved = await runResolve(this, ref, opts);
        // Human mode: focus element then type with smartType
        if (isHumanModeEnabled() && typeof this.smartType === 'function') {
            // Focus the element first
            await this.evaluate(`
        (() => {
          const el = window.__resolved;
          if (!el) return false;
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();
          // Clear existing content if it's an input/textarea/contenteditable
          if (el.isContentEditable) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('delete', false);
          } else if (el.value !== undefined) {
            const proto = el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) nativeSetter.call(el, '');
            else el.value = '';
          }
          return true;
        })()
      `);
            // Type with human-like behavior
            await this.smartType(text);
            return resolved;
        }
        // Standard DOM type
        await this.evaluate(typeResolvedJs(text));
        return resolved;
    }
    async pressKey(key) {
        await this.evaluate(pressKeyJs(key));
    }
    async scrollTo(ref, opts = {}) {
        const resolved = await runResolve(this, ref, opts);
        const result = (await this.evaluate(scrollResolvedJs()));
        // Fold match_level into the scroll payload so the user-facing envelope
        // carries it the same way click / type do.
        if (result && typeof result === 'object') {
            return { ...result, matches_n: resolved.matches_n, match_level: resolved.match_level };
        }
        return { matches_n: resolved.matches_n, match_level: resolved.match_level };
    }
    async getFormState() {
        return (await this.evaluate(getFormStateJs()));
    }
    async scroll(direction = 'down', amount = 500) {
        // In human mode, use human-like scrolling behavior
        if (isHumanModeEnabled() && direction === 'down') {
            const cfg = getHumanConfig();
            const scrollAmount = amount ?? randomIntInRange(cfg.scrollStepMinPx, cfg.scrollStepMaxPx);
            // Delegate to subclass for CDP wheel event
            await this._humanScrollWheel(scrollAmount);
            // Reading pause
            await new Promise(resolve => setTimeout(resolve, randomInRange(cfg.scrollPauseMinMs, cfg.scrollPauseMaxMs)));
            return;
        }
        // Standard scroll via JS evaluate
        await this.evaluate(scrollJs(direction, amount));
    }
    /**
     * Human-like scroll wheel event. Subclasses with CDP access override this.
     * Base implementation falls back to JS scroll.
     */
    async _humanScrollWheel(deltaY) {
        await this.evaluate(`window.scrollBy(0, ${deltaY})`);
    }
    async autoScroll(options) {
        const times = options?.times ?? 3;
        const delayMs = options?.delayMs ?? 2000;
        await this.evaluate(autoScrollJs(times, delayMs));
    }
    async networkRequests(includeStatic = false) {
        const result = await this.evaluate(networkRequestsJs(includeStatic));
        return Array.isArray(result) ? result : [];
    }
    async consoleMessages(_level = 'info') {
        return [];
    }
    async wait(options) {
        if (typeof options === 'number') {
            if (options >= 1) {
                try {
                    const maxMs = options * 1000;
                    await this.evaluate(waitForDomStableJs(maxMs, Math.min(500, maxMs)));
                    return;
                }
                catch {
                    // Fallback: fixed sleep
                }
            }
            await new Promise(resolve => setTimeout(resolve, options * 1000));
            return;
        }
        if (typeof options.time === 'number') {
            await new Promise(resolve => setTimeout(resolve, options.time * 1000));
            return;
        }
        if (options.selector) {
            const timeout = (options.timeout ?? 10) * 1000;
            await this.evaluate(waitForSelectorJs(options.selector, timeout));
            return;
        }
        if (options.text) {
            const timeout = (options.timeout ?? 30) * 1000;
            await this.evaluate(waitForTextJs(options.text, timeout));
        }
    }
    async snapshot(opts = {}) {
        const snapshotJs = generateSnapshotJs({
            viewportExpand: opts.viewportExpand ?? 2000,
            maxDepth: Math.max(1, Math.min(Number(opts.maxDepth) || 50, 200)),
            interactiveOnly: opts.interactive ?? false,
            maxTextLength: opts.maxTextLength ?? 120,
            includeScrollInfo: true,
            bboxDedup: true,
            previousHashes: this._prevSnapshotHashes,
        });
        try {
            const result = await this.evaluate(snapshotJs);
            // Read back the hashes stored by the snapshot for next diff
            try {
                const hashes = await this.evaluate('window.__opencli_prev_hashes');
                this._prevSnapshotHashes = typeof hashes === 'string' ? hashes : null;
            }
            catch {
                // Non-fatal: diff is best-effort
            }
            return result;
        }
        catch (err) {
            // Log snapshot failure for debugging, then fallback to basic accessibility tree
            if (process.env.DEBUG_SNAPSHOT) {
                process.stderr.write(`[snapshot] DOM snapshot failed, falling back to accessibility tree: ${err?.message?.slice(0, 200)}\n`);
            }
            return this._basicSnapshot(opts);
        }
    }
    async getCurrentUrl() {
        if (this._lastUrl)
            return this._lastUrl;
        try {
            const current = await this.evaluate('window.location.href');
            if (typeof current === 'string' && current) {
                this._lastUrl = current;
                return current;
            }
        }
        catch {
            // Best-effort
        }
        return null;
    }
    async installInterceptor(pattern) {
        const { generateInterceptorJs } = await import('../interceptor.js');
        await this.evaluate(generateInterceptorJs(JSON.stringify(pattern), {
            arrayName: '__opencli_xhr',
            patchGuard: '__opencli_interceptor_patched',
        }));
    }
    async getInterceptedRequests() {
        const { generateReadInterceptedJs } = await import('../interceptor.js');
        const result = await this.evaluate(generateReadInterceptedJs('__opencli_xhr'));
        return Array.isArray(result) ? result : [];
    }
    async waitForCapture(timeout = 10) {
        const maxMs = timeout * 1000;
        await this.evaluate(waitForCaptureJs(maxMs));
    }
    /** Fallback basic snapshot */
    async _basicSnapshot(opts = {}) {
        const maxDepth = Math.max(1, Math.min(Number(opts.maxDepth) || 50, 200));
        const code = `
      (async () => {
        function buildTree(node, depth) {
          if (depth > ${maxDepth}) return '';
          const role = node.getAttribute?.('role') || node.tagName?.toLowerCase() || 'generic';
          const name = node.getAttribute?.('aria-label') || node.getAttribute?.('alt') || node.textContent?.trim().slice(0, 80) || '';
          const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(node.tagName?.toLowerCase()) || node.getAttribute?.('tabindex') != null;

          ${opts.interactive ? 'if (!isInteractive && !node.children?.length) return "";' : ''}

          let indent = '  '.repeat(depth);
          let line = indent + role;
          if (name) line += ' "' + name.replace(/"/g, '\\\\\\"') + '"';
          if (node.tagName?.toLowerCase() === 'a' && node.href) line += ' [' + node.href + ']';
          if (node.tagName?.toLowerCase() === 'input') line += ' [' + (node.type || 'text') + ']';

          let result = line + '\\n';
          if (node.children) {
            for (const child of node.children) {
              result += buildTree(child, depth + 1);
            }
          }
          return result;
        }
        return buildTree(document.body, 0);
      })()
    `;
        const raw = await this.evaluate(code);
        if (opts.raw)
            return raw;
        if (typeof raw === 'string')
            return formatSnapshot(raw, opts);
        return raw;
    }
}
