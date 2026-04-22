/**
 * Serialization and formatting helpers for CLI commands and args.
 *
 * Used by the `list` command, Commander --help, and build-manifest.
 * Separated from registry.ts to keep the registry focused on types + registration.
 */
import type { Arg, CliCommand } from './registry.js';
export type SerializedArg = {
    name: string;
    type: string;
    required: boolean;
    valueRequired: boolean;
    positional: boolean;
    choices: string[];
    default: unknown;
    help: string;
};
/** Stable arg schema — every field is always present (no sparse objects). */
export declare function serializeArg(a: Arg): SerializedArg;
/** Full command metadata for structured output (json/yaml). */
export declare function serializeCommand(cmd: CliCommand): {
    command: string;
    site: string;
    name: string;
    aliases: string[];
    description: string;
    strategy: string;
    browser: boolean;
    args: SerializedArg[];
    columns: string[];
    domain: string | null;
    deprecated: string | boolean | null;
    replacedBy: string | null;
};
/** Human-readable arg summary: `<required> [optional]` style. */
export declare function formatArgSummary(args: Arg[]): string;
/** Generate the --help appendix showing registry metadata not exposed by Commander. */
export declare function formatRegistryHelpText(cmd: CliCommand): string;
