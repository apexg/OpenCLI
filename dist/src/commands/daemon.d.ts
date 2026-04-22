/**
 * CLI commands for daemon lifecycle:
 *   opencli daemon status — show daemon state
 *   opencli daemon stop   — graceful shutdown
 */
export declare function daemonStatus(): Promise<void>;
export declare function daemonStop(): Promise<void>;
