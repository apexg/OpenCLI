/**
 * Shared utility functions used across the codebase.
 */
import TurndownService from 'turndown';
/** Type guard: checks if a value is a non-null, non-array object. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Simple async concurrency limiter. */
export declare function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
/** Pause for the given number of milliseconds. */
export declare function sleep(ms: number): Promise<void>;
/** Save a base64-encoded string to a file, creating parent directories as needed. */
export declare function saveBase64ToFile(base64: string, filePath: string): Promise<void>;
export declare function createMarkdownConverter(configure?: (td: TurndownService) => void): TurndownService;
export declare function htmlToMarkdown(value: string, configure?: (td: TurndownService) => void): string;
