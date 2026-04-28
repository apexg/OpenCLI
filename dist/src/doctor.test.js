import { beforeEach, describe, expect, it, vi } from 'vitest';
const { mockGetDaemonHealth, mockListSessions, mockConnect, mockClose, mockCDPConnect, mockCDPClose } = vi.hoisted(() => ({
    mockGetDaemonHealth: vi.fn(),
    mockListSessions: vi.fn(),
    mockConnect: vi.fn(),
    mockClose: vi.fn(),
    mockCDPConnect: vi.fn(),
    mockCDPClose: vi.fn(),
}));
vi.mock('./browser/daemon-client.js', () => ({
    getDaemonHealth: mockGetDaemonHealth,
    listSessions: mockListSessions,
}));
vi.mock('./browser/index.js', () => ({
    BrowserBridge: class {
        connect = mockConnect;
        close = mockClose;
    },
    CDPBridge: class {
        connect = mockCDPConnect;
        close = mockCDPClose;
    },
}));
import { renderBrowserDoctorReport, runBrowserDoctor } from './doctor.js';
describe('doctor report rendering', () => {
    const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });
    it('renders OK-style report when daemon and extension connected', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: true,
            extensionVersion: '1.6.8',
            issues: [],
        }));
        expect(text).toContain('[OK] Daemon: running on port 19825');
        expect(text).toContain('[OK] Extension: connected (v1.6.8)');
        expect(text).toContain('Everything looks good!');
    });
    it('renders MISSING when daemon not running', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: false,
            extensionConnected: false,
            issues: ['Daemon is not running.'],
        }));
        expect(text).toContain('[MISSING] Daemon: not running');
        expect(text).toContain('[MISSING] Extension: not connected');
        expect(text).toContain('Daemon is not running.');
    });
    it('renders extension not connected when daemon is running', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: false,
            issues: ['Daemon is running but the Chrome extension is not connected.'],
        }));
        expect(text).toContain('[OK] Daemon: running on port 19825');
        expect(text).toContain('[MISSING] Extension: not connected');
    });
    it('renders a warning when the extension version is unknown', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: true,
            issues: ['Extension is connected but did not report a version.'],
        }));
        expect(text).toContain('[WARN] Extension: connected (version unknown)');
        expect(text).toContain('Extension is connected but did not report a version.');
        expect(text).not.toContain('Everything looks good!');
    });
    it('renders connectivity OK when live test succeeds', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: true,
            connectivity: { ok: true, durationMs: 1234 },
            issues: [],
        }));
        expect(text).toContain('[OK] Connectivity: connected in 1.2s');
    });
    it('renders connectivity SKIP when not tested', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: true,
            issues: [],
        }));
        expect(text).toContain('[SKIP] Connectivity: skipped (--no-live)');
    });
    it('renders unstable extension state when live connectivity and status disagree', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: true,
            extensionConnected: true,
            extensionFlaky: true,
            connectivity: { ok: true, durationMs: 1234 },
            issues: ['Extension connection is unstable.'],
        }));
        expect(text).toContain('[WARN] Extension: unstable');
        expect(text).toContain('Extension connection is unstable.');
    });
    it('renders unstable daemon state when live connectivity and status disagree', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: false,
            daemonRunning: false,
            daemonFlaky: true,
            extensionConnected: false,
            connectivity: { ok: true, durationMs: 1234 },
            issues: ['Daemon connectivity is unstable.'],
        }));
        expect(text).toContain('[WARN] Daemon: unstable');
        expect(text).toContain('Daemon connectivity is unstable.');
    });
    // ── CDP mode tests ─────────────────────────────────────────────────────
    it('renders CDP mode report when cdpEndpoint is set', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: true,
            cdpEndpoint: 'http://localhost:9222',
            daemonRunning: false,
            extensionConnected: false,
            connectivity: { ok: true, durationMs: 500, mode: 'cdp' },
            issues: [],
        }));
        expect(text).toContain('[CDP] Mode: direct Chrome DevTools Protocol connection');
        expect(text).toContain('Endpoint: http://localhost:9222');
        expect(text).toContain('[OK] Connectivity: connected in 0.5s');
        expect(text).toContain('CDP connection healthy');
    });
    it('renders CDP mode failure when connectivity fails', () => {
        const text = strip(renderBrowserDoctorReport({
            cdpMode: true,
            cdpEndpoint: 'http://localhost:9222',
            daemonRunning: false,
            extensionConnected: false,
            connectivity: { ok: false, durationMs: 1000, error: 'CDP connect timeout', mode: 'cdp' },
            issues: ['CDP connectivity test failed: CDP connect timeout'],
        }));
        expect(text).toContain('[CDP] Mode: direct Chrome DevTools Protocol connection');
        expect(text).toContain('[FAIL] Connectivity: failed (CDP connect timeout)');
        expect(text).toContain('CDP connectivity test failed');
    });
    it('runs CDP connectivity check when OPENCLI_CDP_ENDPOINT is set', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://localhost:9222');
        mockCDPConnect.mockResolvedValueOnce({
            evaluate: vi.fn().mockResolvedValue(2),
        });
        mockCDPClose.mockResolvedValueOnce(undefined);
        const report = await runBrowserDoctor({ live: true });
        expect(report.cdpMode).toBe(true);
        expect(report.cdpEndpoint).toBe('http://localhost:9222');
        expect(report.connectivity?.ok).toBe(true);
        expect(report.connectivity?.mode).toBe('cdp');
        expect(report.issues).toHaveLength(0);
    });
    it('reports CDP failure when endpoint unreachable', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://localhost:9222');
        mockCDPConnect.mockRejectedValueOnce(new Error('CDP connect timeout'));
        const report = await runBrowserDoctor({ live: true });
        expect(report.cdpMode).toBe(true);
        expect(report.connectivity?.ok).toBe(false);
        expect(report.connectivity?.error).toContain('CDP connect timeout');
        expect(report.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('CDP connectivity test failed'),
        ]));
    });
    it('skips daemon checks in CDP mode', async () => {
        vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://localhost:9222');
        mockCDPConnect.mockResolvedValueOnce({
            evaluate: vi.fn().mockResolvedValue(2),
        });
        mockCDPClose.mockResolvedValueOnce(undefined);
        const report = await runBrowserDoctor({ live: true, sessions: true });
        // daemon health should not be called in CDP mode
        expect(mockGetDaemonHealth).not.toHaveBeenCalled();
        expect(report.daemonRunning).toBe(false);
        expect(report.extensionConnected).toBe(false);
        expect(report.sessions).toBeUndefined();
    });
    // ── Extension mode tests ─────────────────────────────────────────────────
    it('reports daemon not running when no-live and auto-start fails', async () => {
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'stopped', status: null });
        mockConnect.mockRejectedValueOnce(new Error('Could not start daemon'));
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'stopped', status: null });
        const report = await runBrowserDoctor({ live: false });
        expect(report.cdpMode).toBe(false);
        expect(report.daemonRunning).toBe(false);
        expect(report.extensionConnected).toBe(false);
        expect(mockGetDaemonHealth).toHaveBeenCalledTimes(2);
        expect(report.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('Daemon is not running'),
        ]));
    });
    it('reports flapping when live check succeeds but final status shows extension disconnected', async () => {
        mockConnect.mockResolvedValueOnce({
            evaluate: vi.fn().mockResolvedValue(2),
        });
        mockClose.mockResolvedValueOnce(undefined);
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'no-extension', status: { extensionConnected: false } });
        const report = await runBrowserDoctor({ live: true });
        expect(report.cdpMode).toBe(false);
        expect(report.daemonRunning).toBe(true);
        expect(report.extensionConnected).toBe(false);
        expect(report.extensionFlaky).toBe(true);
        expect(report.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('Extension connection is unstable'),
        ]));
    });
    it('reports daemon flapping when live check succeeds but daemon disappears afterward', async () => {
        mockConnect.mockResolvedValueOnce({
            evaluate: vi.fn().mockResolvedValue(2),
        });
        mockClose.mockResolvedValueOnce(undefined);
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'stopped', status: null });
        const report = await runBrowserDoctor({ live: true });
        expect(report.cdpMode).toBe(false);
        expect(report.daemonRunning).toBe(false);
        expect(report.daemonFlaky).toBe(true);
        expect(report.extensionConnected).toBe(false);
        expect(report.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('Daemon connectivity is unstable'),
        ]));
    });
    it('uses the fast default timeout for live connectivity checks', async () => {
        let timeoutSeen;
        mockConnect.mockImplementationOnce(async (opts) => {
            timeoutSeen = opts?.timeout;
            return {
                evaluate: vi.fn().mockResolvedValue(2),
            };
        });
        mockClose.mockResolvedValueOnce(undefined);
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'ready', status: { extensionConnected: true } });
        await runBrowserDoctor({ live: true });
        expect(timeoutSeen).toBe(8);
    });
    it('skips auto-start in no-live mode when daemon is already running', async () => {
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'no-extension', status: { extensionConnected: false } });
        mockGetDaemonHealth.mockResolvedValueOnce({ state: 'no-extension', status: { extensionConnected: false } });
        const report = await runBrowserDoctor({ live: false });
        expect(mockConnect).not.toHaveBeenCalled();
        expect(report.daemonRunning).toBe(true);
        expect(report.extensionConnected).toBe(false);
    });
    it('reports an issue when the extension is connected but does not report a version', async () => {
        const status = {
            state: 'ready',
            status: {
                extensionConnected: true,
                extensionVersion: undefined,
            },
        };
        mockGetDaemonHealth
            .mockResolvedValueOnce(status)
            .mockResolvedValueOnce(status);
        const report = await runBrowserDoctor({ live: false });
        expect(report.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('did not report a version'),
        ]));
    });
});
