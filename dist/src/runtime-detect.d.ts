/**
 * Runtime detection — identify whether opencli is running under Node.js or Bun.
 *
 * Bun injects `globalThis.Bun` at startup, making detection trivial.
 * This module centralises the check so other code can adapt behaviour
 * (e.g. logging, diagnostics) without littering runtime sniffing everywhere.
 */
export type Runtime = 'bun' | 'node';
/**
 * Detect the current JavaScript runtime.
 */
export declare function detectRuntime(): Runtime;
/**
 * Return a human-readable version string for the current runtime.
 * Examples: "v22.13.0" (Node), "1.1.42" (Bun)
 */
export declare function getRuntimeVersion(): string;
/**
 * Return a combined label like "node v22.13.0" or "bun 1.1.42".
 */
export declare function getRuntimeLabel(): string;
