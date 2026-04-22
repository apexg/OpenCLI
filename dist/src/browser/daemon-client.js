/**
 * HTTP client for communicating with the opencli daemon.
 *
 * Provides a typed send() function that posts a Command and returns a Result.
 */
import { DEFAULT_DAEMON_PORT } from '../constants.js';
import { sleep } from '../utils.js';
import { classifyBrowserError } from './errors.js';
const DAEMON_PORT = parseInt(process.env.OPENCLI_DAEMON_PORT ?? String(DEFAULT_DAEMON_PORT), 10);
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;
const OPENCLI_HEADERS = { 'X-OpenCLI': '1' };
let _idCounter = 0;
function generateId() {
    return `cmd_${process.pid}_${Date.now()}_${++_idCounter}`;
}
async function requestDaemon(pathname, init) {
    const { timeout = 2000, headers, ...rest } = init ?? {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(`${DAEMON_URL}${pathname}`, {
            ...rest,
            headers: { ...OPENCLI_HEADERS, ...headers },
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timer);
    }
}
export async function fetchDaemonStatus(opts) {
    try {
        const res = await requestDaemon('/status', { timeout: opts?.timeout ?? 2000 });
        if (!res.ok)
            return null;
        return await res.json();
    }
    catch {
        return null;
    }
}
/**
 * Unified daemon health check — single entry point for all status queries.
 * Replaces isDaemonRunning(), isExtensionConnected(), and checkDaemonStatus().
 */
export async function getDaemonHealth(opts) {
    const status = await fetchDaemonStatus(opts);
    if (!status)
        return { state: 'stopped', status: null };
    if (!status.extensionConnected)
        return { state: 'no-extension', status };
    return { state: 'ready', status };
}
export async function requestDaemonShutdown(opts) {
    try {
        const res = await requestDaemon('/shutdown', { method: 'POST', timeout: opts?.timeout ?? 5000 });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Internal: send a command to the daemon with retry logic.
 * Returns the raw DaemonResult. All retry policy lives here — callers
 * (sendCommand, sendCommandFull) only shape the return value.
 *
 * Retries up to 4 times:
 * - Network errors (TypeError, AbortError): retry at 500ms
 * - Transient browser errors: retry at the delay suggested by classifyBrowserError()
 */
async function sendCommandRaw(action, params) {
    const maxRetries = 4;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const id = generateId();
        const wf = process.env.OPENCLI_WINDOW_FOCUSED;
        const windowFocused = (wf === '1' || wf === 'true') ? true : undefined;
        const command = { id, action, ...params, ...(windowFocused && { windowFocused }) };
        try {
            const res = await requestDaemon('/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(command),
                timeout: 30000,
            });
            const result = (await res.json());
            if (!result.ok) {
                const isDuplicateCommandId = res.status === 409
                    || (result.error ?? '').includes('Duplicate command id');
                if (isDuplicateCommandId && attempt < maxRetries) {
                    continue;
                }
                const advice = classifyBrowserError(new Error(result.error ?? ''));
                if (advice.retryable && attempt < maxRetries) {
                    await sleep(advice.delayMs);
                    continue;
                }
                throw new Error(result.error ?? 'Daemon command failed');
            }
            return result;
        }
        catch (err) {
            const isNetworkError = err instanceof TypeError
                || (err instanceof Error && err.name === 'AbortError');
            if (isNetworkError && attempt < maxRetries) {
                await sleep(500);
                continue;
            }
            throw err;
        }
    }
    throw new Error('sendCommand: max retries exhausted');
}
/**
 * Send a command to the daemon and return the result data.
 */
export async function sendCommand(action, params = {}) {
    const result = await sendCommandRaw(action, params);
    return result.data;
}
/**
 * Like sendCommand, but returns both data and page identity (targetId).
 * Use this for page-scoped commands where the caller needs the page identity.
 */
export async function sendCommandFull(action, params = {}) {
    const result = await sendCommandRaw(action, params);
    return { data: result.data, page: result.page };
}
export async function listSessions() {
    const result = await sendCommand('sessions');
    return Array.isArray(result) ? result : [];
}
export async function bindCurrentTab(workspace, opts = {}) {
    return sendCommand('bind-current', { workspace, ...opts });
}
