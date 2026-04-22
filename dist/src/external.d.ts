export interface ExternalCliInstall {
    mac?: string;
    linux?: string;
    windows?: string;
    default?: string;
}
export interface ExternalCliConfig {
    name: string;
    binary: string;
    description?: string;
    homepage?: string;
    tags?: string[];
    install?: ExternalCliInstall;
}
export declare function loadExternalClis(): ExternalCliConfig[];
export declare function isBinaryInstalled(binary: string): boolean;
export declare function getInstallCmd(installConfig?: ExternalCliInstall): string | null;
/**
 * Safely parses a command string into a binary and argument list.
 * Rejects commands containing shell operators (&&, ||, |, ;, >, <, `) that
 * cannot be safely expressed as execFileSync arguments.
 *
 * Args:
 *   cmd: Raw command string from YAML config (e.g. "brew install gh")
 *
 * Returns:
 *   Object with `binary` and `args` fields, or throws on unsafe input.
 */
export declare function parseCommand(cmd: string): {
    binary: string;
    args: string[];
};
export declare function installExternalCli(cli: ExternalCliConfig): boolean;
export declare function executeExternalCli(name: string, args: string[], preloaded?: ExternalCliConfig[]): void;
export interface RegisterOptions {
    binary?: string;
    install?: string;
    description?: string;
}
export declare function registerExternalCli(name: string, opts?: RegisterOptions): void;
