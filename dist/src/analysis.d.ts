/**
 * Shared API analysis helpers used by both explore.ts and record.ts.
 *
 * Extracts common logic for:
 *   - URL pattern normalization
 *   - Array path discovery in JSON responses
 *   - Field role detection
 *   - Auth indicator inference
 *   - Capability name inference
 *   - Strategy inference
 */
/** Normalize a full URL into a pattern (replace IDs, strip volatile params). */
export declare function urlToPattern(url: string): string;
export interface ArrayDiscovery {
    path: string;
    items: unknown[];
}
/** Find the best (largest) array of objects in a JSON response body. */
export declare function findArrayPath(obj: unknown, depth?: number): ArrayDiscovery | null;
/** Flatten nested object keys up to maxDepth. */
export declare function flattenFields(obj: unknown, prefix: string, maxDepth: number): string[];
/** Detect semantic field roles (title, url, author, etc.) from sample fields. */
export declare function detectFieldRoles(sampleFields: string[]): Record<string, string>;
/** Infer a CLI capability name from a URL. */
export declare function inferCapabilityName(url: string, goal?: string): string;
/** Infer auth strategy from detected indicators. */
export declare function inferStrategy(authIndicators: string[]): string;
/** Detect auth indicators from HTTP headers. */
export declare function detectAuthFromHeaders(headers?: Record<string, string>): string[];
/** Detect auth indicators from URL and response body (heuristic). */
export declare function detectAuthFromContent(url: string, body: unknown): string[];
/** Check whether a URL looks like tracking/telemetry noise rather than a business API. */
export declare function isNoiseUrl(url: string): boolean;
/** Extract non-volatile query params and classify them. */
export declare function classifyQueryParams(url: string): {
    params: string[];
    hasSearch: boolean;
    hasPagination: boolean;
    hasLimit: boolean;
};
