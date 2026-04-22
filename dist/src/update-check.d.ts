/**
 * Non-blocking update checker.
 *
 * Pattern: register exit-hook + kick-off-background-fetch
 * - On startup: kick off background fetch (non-blocking)
 * - On process exit: read cache, print notice if newer version exists
 * - Check interval: 24 hours
 * - Notice appears AFTER command output, not before (same as npm/gh/yarn)
 * - Never delays or blocks the CLI command
 */
interface GitHubReleaseAsset {
    name: string;
}
interface GitHubRelease {
    tag_name: string;
    assets?: GitHubReleaseAsset[];
}
/**
 * Register a process exit hook that prints an update notice if a newer
 * version was found on the last background check.
 * Notice appears after command output — same pattern as npm/gh/yarn.
 * Skipped during --get-completions to avoid polluting shell completion output.
 */
export declare function registerUpdateNoticeOnExit(): void;
declare function extractLatestExtensionVersionFromReleases(releases: GitHubRelease[]): string | undefined;
/**
 * Kick off a background fetch to npm registry. Writes to cache for next run.
 * Fully non-blocking — never awaited.
 */
export declare function checkForUpdateBackground(): void;
/**
 * Get the cached latest extension version (if available).
 * Used by `opencli doctor` to report extension updates.
 */
export declare function getCachedLatestExtensionVersion(): string | undefined;
export { extractLatestExtensionVersionFromReleases as _extractLatestExtensionVersionFromReleases, };
