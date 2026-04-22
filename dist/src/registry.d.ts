/**
 * Core registry: Strategy enum, Arg/CliCommand interfaces, cli() registration.
 */
import type { IPage } from './types.js';
export declare enum Strategy {
    PUBLIC = "public",
    LOCAL = "local",
    COOKIE = "cookie",
    HEADER = "header",
    INTERCEPT = "intercept",
    UI = "ui"
}
export interface Arg {
    name: string;
    type?: string;
    default?: unknown;
    required?: boolean;
    valueRequired?: boolean;
    positional?: boolean;
    help?: string;
    choices?: string[];
}
export interface RequiredEnv {
    name: string;
    help?: string;
}
export type CommandArgs = Record<string, any>;
export interface CliCommand {
    site: string;
    name: string;
    aliases?: string[];
    description: string;
    domain?: string;
    strategy?: Strategy;
    browser?: boolean;
    args: Arg[];
    columns?: string[];
    func?: (page: IPage, kwargs: CommandArgs, debug?: boolean) => Promise<unknown>;
    pipeline?: Record<string, unknown>[];
    timeoutSeconds?: number;
    /** Origin of this command: 'yaml', 'ts', or plugin name. */
    source?: string;
    footerExtra?: (kwargs: CommandArgs) => string | undefined;
    requiredEnv?: RequiredEnv[];
    validateArgs?: (kwargs: CommandArgs) => void;
    /** Deprecation note shown in help / execution warnings. */
    deprecated?: boolean | string;
    /** Preferred replacement command, if any. */
    replacedBy?: string;
    /**
     * Control pre-navigation and browser-session requirement.
     *
     * After normalizeCommand() expands strategy, this field carries the
     * resolved runtime intent:
     *
     * - `undefined`: no pre-navigation, browser session decided by pipeline steps
     * - `false`: explicitly skip pre-navigation (adapter handles its own navigation)
     * - `true`: needs authenticated browser context but no specific pre-nav URL
     *   (e.g. INTERCEPT/UI adapters, or COOKIE without domain)
     * - `string`: pre-navigate to this URL before running the adapter
     *   (e.g. `'https://x.com'` for COOKIE strategy with domain)
     *
     * Adapter authors can set this explicitly to override the strategy-based default.
     */
    navigateBefore?: boolean | string;
    /** Override the default CLI output format when the user does not pass -f/--format. */
    defaultFormat?: 'table' | 'plain' | 'json' | 'yaml' | 'yml' | 'md' | 'markdown' | 'csv';
}
/** Internal extension for lazy-loaded TS modules (not exposed in public API) */
export interface InternalCliCommand extends CliCommand {
    _lazy?: boolean;
    _modulePath?: string;
}
export interface CliOptions extends Partial<Omit<CliCommand, 'args' | 'description'>> {
    site: string;
    name: string;
    description?: string;
    args?: Arg[];
}
declare global {
    var __opencli_registry__: Map<string, CliCommand> | undefined;
}
export declare function cli(opts: CliOptions): CliCommand;
export declare function getRegistry(): Map<string, CliCommand>;
export declare function fullName(cmd: CliCommand): string;
export declare function strategyLabel(cmd: CliCommand): string;
export declare function registerCommand(cmd: CliCommand): void;
