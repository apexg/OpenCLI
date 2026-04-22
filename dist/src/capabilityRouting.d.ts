import type { CliCommand } from './registry.js';
/** Pipeline steps that require a live browser session. */
export declare const BROWSER_ONLY_STEPS: Set<string>;
export declare function shouldUseBrowserSession(cmd: CliCommand): boolean;
