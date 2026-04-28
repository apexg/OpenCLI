import { beforeEach, describe, expect, it, vi } from 'vitest';
const { MockWebSocket } = vi.hoisted(() => {
    class MockWebSocket {
        static OPEN = 1;
        readyState = 1;
        handlers = new Map();
        _sendHandler = null;
        constructor(_url) {
            queueMicrotask(() => this.emit('open'));
        }
        on(event, handler) {
            const handlers = this.handlers.get(event) ?? [];
            handlers.push(handler);
            this.handlers.set(event, handlers);
        }
        send(message) {
            const msg = JSON.parse(message);
            // Simulate CDP response for each command
            queueMicrotask(() => {
                if (this._sendHandler) {
                    this._sendHandler(msg);
                }
                else {
                    // Default: return success response
                    this.emit('message', JSON.stringify({ id: msg.id, result: {} }));
                }
            });
        }
        // Allow tests to customize send behavior
        setSendHandler(handler) {
            this._sendHandler = handler;
        }
        // Emit a CDP event
        emitEvent(method, params) {
            this.emit('message', JSON.stringify({ method, params }));
        }
        close() {
            this.readyState = 3;
        }
        emit(event, ...args) {
            for (const handler of this.handlers.get(event) ?? []) {
                handler(...args);
            }
        }
    }
    return { MockWebSocket };
});
vi.mock('ws', () => ({
    WebSocket: MockWebSocket,
}));
import { CDPBridge } from './cdp.js';
describe('CDPBridge cookies', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('filters cookies by actual domain match instead of substring match', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({
            cookies: [
                { name: 'good', value: '1', domain: '.example.com' },
                { name: 'exact', value: '2', domain: 'example.com' },
                { name: 'bad', value: '3', domain: 'notexample.com' },
            ],
        });
        const page = await bridge.connect();
        const cookies = await page.getCookies({ domain: 'example.com' });
        expect(cookies).toEqual([
            { name: 'good', value: '1', domain: '.example.com' },
            { name: 'exact', value: '2', domain: 'example.com' },
        ]);
    });
});
describe('CDPPage tabs', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('lists page targets via Target.getTargets', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({
            targetInfos: [
                { type: 'page', url: 'https://example.com', title: 'Example', targetId: 'abc123' },
                { type: 'page', url: 'https://google.com', title: 'Google', targetId: 'def456' },
                { type: 'service_worker', url: 'chrome-extension://...', title: 'SW' }, // Should be filtered
            ],
        });
        const page = await bridge.connect();
        const tabs = await page.tabs();
        expect(tabs).toEqual([
            { index: 0, page: 'abc123', url: 'https://example.com', title: 'Example', active: false },
            { index: 1, page: 'def456', url: 'https://google.com', title: 'Google', active: false },
        ]);
    });
    it('creates a new tab via Target.createTarget', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({ targetId: 'new-page-123' });
        const page = await bridge.connect();
        const targetId = await page.newTab?.('https://newsite.com');
        expect(targetId).toBe('new-page-123');
        expect(bridge.send).toHaveBeenCalledWith('Target.createTarget', { url: 'https://newsite.com' });
    });
    it('creates a blank tab when no URL provided', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({ targetId: 'blank-page' });
        const page = await bridge.connect();
        const targetId = await page.newTab?.();
        expect(targetId).toBe('blank-page');
        expect(bridge.send).toHaveBeenCalledWith('Target.createTarget', { url: 'about:blank' });
    });
});
describe('CDPPage closeTab', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('closes tab by targetId string', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        // Mock connect flow + closeTab
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable
            .mockResolvedValueOnce({}) // Page.addScriptToEvaluateOnNewDocument (stealth)
            .mockResolvedValueOnce({}); // Target.closeTarget
        const page = await bridge.connect();
        await page.closeTab?.('target-123');
        expect(bridge.send).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'target-123' });
    });
    it('closes tab by numeric index', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({
            targetInfos: [
                { type: 'page', targetId: 'page-0' },
                { type: 'page', targetId: 'page-1' },
            ],
        }) // Target.getTargets (tabs)
            .mockResolvedValueOnce({}); // Target.closeTarget
        const page = await bridge.connect();
        await page.closeTab?.(1);
        expect(bridge.send).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'page-1' });
    });
    it('throws when no target to close', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable
            .mockResolvedValueOnce({}); // stealth
        const page = await bridge.connect();
        await expect(page.closeTab?.()).rejects.toThrow('No target to close');
    });
});
describe('CDPPage closeWindow', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('closes the current connected target', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({});
        const page = await bridge.connect();
        page.setActivePage?.('current-page');
        await page.closeWindow?.();
        expect(bridge.send).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'current-page' });
    });
});
describe('CDPPage active page identity', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('tracks active page identity', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const page = await bridge.connect();
        expect(page.getActivePage?.()).toBeUndefined();
        page.setActivePage?.('page-abc');
        expect(page.getActivePage?.()).toBe('page-abc');
        page.setActivePage?.();
        expect(page.getActivePage?.()).toBeUndefined();
    });
});
describe('CDPPage native input', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('nativeClick sends mouse events', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({});
        const page = await bridge.connect();
        await page.nativeClick?.(100, 200);
        expect(sendSpy).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: 100, y: 200, button: 'left', clickCount: 1,
        });
        expect(sendSpy).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: 100, y: 200, button: 'left', clickCount: 1,
        });
    });
    it('nativeType sends insertText', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({});
        const page = await bridge.connect();
        await page.nativeType?.('你好世界');
        expect(sendSpy).toHaveBeenCalledWith('Input.insertText', { text: '你好世界' });
    });
    it('insertText alias works', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({});
        const page = await bridge.connect();
        await page.insertText?.('test text');
        expect(sendSpy).toHaveBeenCalledWith('Input.insertText', { text: 'test text' });
    });
    it('nativeKeyPress sends key events with modifiers', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({});
        const page = await bridge.connect();
        await page.nativeKeyPress?.('a', ['Ctrl', 'Shift']);
        // Ctrl = 2, Shift = 8, total = 10
        expect(sendSpy).toHaveBeenCalledWith('Input.dispatchKeyEvent', {
            type: 'keyDown', key: 'a', modifiers: 10,
        });
        expect(sendSpy).toHaveBeenCalledWith('Input.dispatchKeyEvent', {
            type: 'keyUp', key: 'a', modifiers: 10,
        });
    });
});
describe('CDPPage cdp passthrough', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('passes through CDP commands directly', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send').mockResolvedValue({ nodeId: 123 });
        const page = await bridge.connect();
        const result = await page.cdp?.('DOM.querySelector', { selector: 'input' });
        expect(result).toEqual({ nodeId: 123 });
        expect(bridge.send).toHaveBeenCalledWith('DOM.querySelector', { selector: 'input' });
    });
});
describe('CDPPage setFileInput', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('sets files via DOM.setFileInputFiles', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({}) // DOM.enable
            .mockResolvedValueOnce({ root: { nodeId: 1 } }) // DOM.getDocument
            .mockResolvedValueOnce({ nodeId: 42 }) // DOM.querySelector
            .mockResolvedValueOnce({}); // DOM.setFileInputFiles
        const page = await bridge.connect();
        await page.setFileInput?.(['/tmp/file1.pdf', '/tmp/file2.pdf']);
        expect(bridge.send).toHaveBeenCalledWith('DOM.enable');
        expect(bridge.send).toHaveBeenCalledWith('DOM.getDocument');
        expect(bridge.send).toHaveBeenCalledWith('DOM.querySelector', { nodeId: 1, selector: 'input[type="file"]' });
        expect(bridge.send).toHaveBeenCalledWith('DOM.setFileInputFiles', { files: ['/tmp/file1.pdf', '/tmp/file2.pdf'], nodeId: 42 });
    });
    it('uses custom selector', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({}) // DOM.enable
            .mockResolvedValueOnce({ root: { nodeId: 1 } }) // DOM.getDocument
            .mockResolvedValueOnce({ nodeId: 99 }) // DOM.querySelector
            .mockResolvedValueOnce({}); // DOM.setFileInputFiles
        const page = await bridge.connect();
        await page.setFileInput?.(['/tmp/file.pdf'], '#custom-upload');
        expect(bridge.send).toHaveBeenCalledWith('DOM.querySelector', { nodeId: 1, selector: '#custom-upload' });
    });
    it('throws when element not found', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({}) // DOM.enable
            .mockResolvedValueOnce({ root: { nodeId: 1 } }) // DOM.getDocument
            .mockResolvedValueOnce({}); // DOM.querySelector returns no nodeId
        const page = await bridge.connect();
        await expect(page.setFileInput?.(['/tmp/file.pdf'])).rejects.toThrow('No element found matching selector');
    });
});
describe('CDPPage frames', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('lists cross-origin frames from Page.getFrameTree', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({
            frameTree: {
                frame: { id: 'main', url: 'https://main.com', name: '' },
                childFrames: [
                    {
                        frame: { id: 'same-origin', url: 'https://main.com/embed', name: 'embed' },
                        childFrames: [],
                    },
                    {
                        frame: { id: 'cross-origin', url: 'https://other.com/widget', name: 'widget' },
                        childFrames: [],
                    },
                ],
            },
        });
        const page = await bridge.connect();
        const frames = await page.frames?.();
        // Same-origin frames should be filtered, only cross-origin listed
        expect(frames).toEqual([
            { index: 0, frameId: 'cross-origin', url: 'https://other.com/widget', name: 'widget' },
        ]);
    });
    it('returns empty array when no frames', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}) // stealth (connect)
            .mockResolvedValueOnce({ frameTree: { frame: { id: 'main', url: 'https://main.com' } } }); // Page.getFrameTree
        const page = await bridge.connect();
        const frames = await page.frames?.();
        expect(frames).toEqual([]);
    });
});
describe('CDPPage evaluateInFrame', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });
    it('evaluates JS in a specific frame', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        const sendSpy = vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect - sets _pageEnabled=true)
            .mockResolvedValueOnce({}) // stealth (connect)
            // evaluateInFrame won't call Page.enable again since _pageEnabled is true
            // But enableFrameTracking is called, which calls Runtime.enable
            .mockResolvedValueOnce({}) // Runtime.enable (enableFrameTracking)
            .mockResolvedValueOnce({
            frameTree: { frame: { id: 'main', url: 'https://main.com' } },
        })
            .mockResolvedValueOnce({ result: { value: 'frame-result' } }); // Runtime.evaluate
        const page = await bridge.connect();
        // Manually set up frame context before calling evaluateInFrame
        // Cast to access private _frameContexts for testing
        page._frameContexts.set('frame-1', 42);
        // Mock frames to return our test frame (override the earlier mock)
        vi.spyOn(page, 'frames').mockResolvedValueOnce([
            { index: 0, frameId: 'frame-1', url: 'https://frame.com', name: 'test' },
        ]);
        const result = await page.evaluateInFrame?.('document.title', 0);
        expect(result).toBe('frame-result');
        expect(sendSpy).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
            contextId: 42,
            expression: expect.stringContaining('document.title'),
        }));
    });
    it('throws when frame index out of range', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}); // stealth (connect)
        const page = await bridge.connect();
        vi.spyOn(page, 'frames').mockResolvedValueOnce([]);
        await expect(page.evaluateInFrame?.('1+1', 0)).rejects.toThrow('Frame index 0 out of range');
    });
    it('throws when no execution context for frame', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
        const bridge = new CDPBridge();
        vi.spyOn(bridge, 'send')
            .mockResolvedValueOnce({}) // Page.enable (connect)
            .mockResolvedValueOnce({}); // stealth (connect)
        const page = await bridge.connect();
        vi.spyOn(page, 'frames').mockResolvedValueOnce([
            { index: 0, frameId: 'frame-no-context', url: 'https://frame.com', name: 'test' },
        ]);
        await expect(page.evaluateInFrame?.('1+1', 0)).rejects.toThrow('No execution context found for frame');
    });
});
