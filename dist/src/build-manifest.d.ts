#!/usr/bin/env node
/**
 * Build-time CLI manifest compiler.
 *
 * Scans all JS CLI definitions in clis/ and pre-compiles them into a single
 * manifest.json for instant cold-start registration.
 *
 * Usage: npx tsx src/build-manifest.ts
 * Output: cli-manifest.json next to clis/
 */
export interface ManifestEntry {
    site: string;
    name: string;
    aliases?: string[];
    description: string;
    domain?: string;
    strategy: string;
    browser: boolean;
    args: Array<{
        name: string;
        type?: string;
        default?: unknown;
        required?: boolean;
        valueRequired?: boolean;
        positional?: boolean;
        help?: string;
        choices?: string[];
    }>;
    columns?: string[];
    pipeline?: Record<string, unknown>[];
    timeout?: number;
    deprecated?: boolean | string;
    replacedBy?: string;
    type: 'js';
    /** Relative path from clis/ dir, e.g. 'bilibili/search.js' */
    modulePath?: string;
    /** Relative path to the source file from clis/ dir (e.g. 'site/cmd.js') */
    sourceFile?: string;
    /** Pre-navigation control — see CliCommand.navigateBefore */
    navigateBefore?: boolean | string;
}
export declare function loadManifestEntries(filePath: string, site: string, importer?: (moduleHref: string) => Promise<unknown>): Promise<ManifestEntry[]>;
export declare function buildManifest(): Promise<ManifestEntry[]>;
