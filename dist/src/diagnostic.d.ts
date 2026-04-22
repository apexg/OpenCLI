/**
 * Structured diagnostic output for AI-driven adapter repair.
 *
 * When OPENCLI_DIAGNOSTIC=1, failed commands emit a JSON RepairContext to stderr
 * containing the error, adapter source, and browser state (DOM snapshot, network
 * requests, console errors). AI Agents consume this to diagnose and fix adapters.
 *
 * Safety boundaries:
 * - Sensitive headers/cookies are redacted before emission
 * - Individual fields are capped to prevent unbounded output
 * - Network response bodies from authenticated requests are stripped
 * - Total output is capped to MAX_DIAGNOSTIC_BYTES
 */
import type { IPage } from './types.js';
import type { InternalCliCommand } from './registry.js';
/** Maximum bytes for the entire diagnostic JSON output. */
export declare const MAX_DIAGNOSTIC_BYTES: number;
export interface RepairContext {
    error: {
        code: string;
        message: string;
        hint?: string;
        stack?: string;
    };
    adapter: {
        site: string;
        command: string;
        sourcePath?: string;
        source?: string;
    };
    page?: {
        url: string;
        snapshot: string;
        networkRequests: unknown[];
        capturedPayloads?: unknown[];
        consoleErrors: unknown[];
    };
    timestamp: string;
}
/** Truncate a string to maxLen, appending a truncation marker. */
export declare function truncate(str: string, maxLen: number): string;
/** Redact sensitive query parameters from a URL. */
export declare function redactUrl(url: string): string;
/** Redact inline secrets from free-text strings (error messages, stack traces, console output, DOM). */
export declare function redactText(text: string): string;
/**
 * Resolve the editable source file path for an adapter.
 *
 * Priority:
 * 1. cmd.source (set for FS-scanned JS and manifest lazy-loaded JS)
 * 2. cmd._modulePath (set for manifest lazy-loaded JS)
 *
 * Skip manifest: prefixed pseudo-paths (YAML commands inlined in manifest).
 */
export declare function resolveAdapterSourcePath(cmd: InternalCliCommand): string | undefined;
/** Whether diagnostic mode is enabled. */
export declare function isDiagnosticEnabled(): boolean;
/** Build a RepairContext from an error, command metadata, and optional page state. */
export declare function buildRepairContext(err: unknown, cmd: InternalCliCommand, pageState?: RepairContext['page']): RepairContext;
/** Collect full diagnostic context including page state (with timeout). */
export declare function collectDiagnostic(err: unknown, cmd: InternalCliCommand, page: IPage | null): Promise<RepairContext>;
/** Emit diagnostic JSON to stderr, enforcing total size cap. */
export declare function emitDiagnostic(ctx: RepairContext): void;
