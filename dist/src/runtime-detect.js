/**
 * Runtime detection — identify whether opencli is running under Node.js or Bun.
 *
 * Bun injects `globalThis.Bun` at startup, making detection trivial.
 * This module centralises the check so other code can adapt behaviour
 * (e.g. logging, diagnostics) without littering runtime sniffing everywhere.
 */
/**
 * Detect the current JavaScript runtime.
 */
export function detectRuntime() {
    // Bun always exposes globalThis.Bun (including Bun.version)
    return globalThis.Bun !== undefined ? 'bun' : 'node';
}
/**
 * Return a human-readable version string for the current runtime.
 * Examples: "v22.13.0" (Node), "1.1.42" (Bun)
 */
export function getRuntimeVersion() {
    const bun = globalThis.Bun;
    return bun ? bun.version : process.version;
}
/**
 * Return a combined label like "node v22.13.0" or "bun 1.1.42".
 */
export function getRuntimeLabel() {
    return `${detectRuntime()} ${getRuntimeVersion()}`;
}
