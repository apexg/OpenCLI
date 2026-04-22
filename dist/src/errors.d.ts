/**
 * Unified error types for opencli.
 *
 * All errors thrown by the framework should extend CliError so that
 * the top-level handler in commanderAdapter.ts can render consistent,
 * helpful output with emoji-coded severity and actionable hints.
 *
 * ## Exit codes
 *
 * opencli follows Unix conventions (sysexits.h) for process exit codes:
 *
 *   0   Success
 *   1   Generic / unexpected error
 *   2   Argument / usage error          (ArgumentError)
 *  66   No input / empty result         (EmptyResultError)
 *  69   Service unavailable             (BrowserConnectError, AdapterLoadError)
 *  75   Temporary failure, retry later  (TimeoutError)   EX_TEMPFAIL
 *  77   Permission denied / auth needed (AuthRequiredError)
 *  78   Configuration error             (ConfigError)
 * 130   Interrupted by Ctrl-C           (set by tui.ts SIGINT handler)
 */
export declare const EXIT_CODES: {
    readonly SUCCESS: 0;
    readonly GENERIC_ERROR: 1;
    readonly USAGE_ERROR: 2;
    readonly EMPTY_RESULT: 66;
    readonly SERVICE_UNAVAIL: 69;
    readonly TEMPFAIL: 75;
    readonly NOPERM: 77;
    readonly CONFIG_ERROR: 78;
    readonly INTERRUPTED: 130;
};
export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];
export declare class CliError extends Error {
    /** Machine-readable error code (e.g. 'BROWSER_CONNECT', 'AUTH_REQUIRED') */
    readonly code: string;
    /** Human-readable hint on how to fix the problem */
    readonly hint?: string;
    /** Unix process exit code — defaults to 1 (generic error) */
    readonly exitCode: ExitCode;
    constructor(code: string, message: string, hint?: string, exitCode?: ExitCode);
}
export type BrowserConnectKind = 'daemon-not-running' | 'extension-not-connected' | 'command-failed' | 'unknown';
export declare class BrowserConnectError extends CliError {
    readonly kind: BrowserConnectKind;
    constructor(message: string, hint?: string, kind?: BrowserConnectKind);
}
export declare class AdapterLoadError extends CliError {
    constructor(message: string, hint?: string);
}
export declare class CommandExecutionError extends CliError {
    constructor(message: string, hint?: string);
}
export declare class ConfigError extends CliError {
    constructor(message: string, hint?: string);
}
export declare class AuthRequiredError extends CliError {
    readonly domain: string;
    constructor(domain: string, message?: string);
}
export declare class TimeoutError extends CliError {
    constructor(label: string, seconds: number, hint?: string);
}
export declare class ArgumentError extends CliError {
    constructor(message: string, hint?: string);
}
export declare class EmptyResultError extends CliError {
    constructor(command: string, hint?: string);
}
export declare class SelectorError extends CliError {
    constructor(selector: string, hint?: string);
}
export declare class PluginError extends CliError {
    constructor(message: string, hint?: string);
}
/** Structured error output — unified contract for all consumers (AI agents, scripts, humans). */
export interface ErrorEnvelope {
    ok: false;
    error: {
        code: string;
        message: string;
        help?: string;
        exitCode: number;
        stack?: string;
        cause?: string;
    };
}
/** Extract a human-readable message from an unknown caught value. */
export declare function getErrorMessage(error: unknown): string;
/** Build an ErrorEnvelope from any caught value. */
export declare function toEnvelope(err: unknown): ErrorEnvelope;
