/**
 * opencli doctor — diagnose browser connectivity.
 *
 * Supports both Browser Bridge extension mode and direct CDP mode.
 * When OPENCLI_CDP_ENDPOINT is set, checks CDP connectivity instead of extension.
 */
export type DoctorOptions = {
    yes?: boolean;
    live?: boolean;
    sessions?: boolean;
    cliVersion?: string;
};
export type ConnectivityResult = {
    ok: boolean;
    error?: string;
    durationMs: number;
    mode?: 'cdp' | 'extension';
};
export type DoctorReport = {
    cliVersion?: string;
    cdpMode: boolean;
    cdpEndpoint?: string;
    daemonRunning: boolean;
    daemonFlaky?: boolean;
    daemonVersion?: string;
    extensionConnected: boolean;
    extensionFlaky?: boolean;
    extensionVersion?: string;
    latestExtensionVersion?: string;
    connectivity?: ConnectivityResult;
    sessions?: Array<{
        workspace: string;
        windowId: number;
        tabCount: number;
        idleMsRemaining: number;
    }>;
    issues: string[];
};
/**
 * Test connectivity by attempting a real browser command.
 * In CDP mode, connects directly to Chrome via CDP endpoint.
 * In extension mode, uses BrowserBridge through daemon.
 */
export declare function checkConnectivity(opts?: {
    timeout?: number;
}): Promise<ConnectivityResult>;
export declare function runBrowserDoctor(opts?: DoctorOptions): Promise<DoctorReport>;
export declare function renderBrowserDoctorReport(report: DoctorReport): string;
