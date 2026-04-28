/**
 * Unified logging for opencli.
 *
 * All framework output (warnings, debug info, errors) should go through
 * this module so that verbosity levels are respected consistently.
 */
import { styleText } from 'node:util';
function isVerbose() {
    return !!process.env.OPENCLI_VERBOSE;
}
export const log = {
    /** Informational message (always shown) */
    info(msg) {
        process.stderr.write(`${styleText('blue', 'ℹ')}  ${msg}\n`);
    },
    /** Lightweight status line for adapter progress updates */
    status(msg) {
        process.stderr.write(`${styleText('dim', msg)}\n`);
    },
    /** Positive completion/status line without the heavier info prefix */
    success(msg) {
        process.stderr.write(`${styleText('green', msg)}\n`);
    },
    /** Warning (always shown) */
    warn(msg) {
        process.stderr.write(`${styleText('yellow', '⚠')}  ${msg}\n`);
    },
    /** Error (always shown) */
    error(msg) {
        process.stderr.write(`${styleText('red', '✖')}  ${msg}\n`);
    },
    /** Verbose output (shown when -v flag or OPENCLI_VERBOSE is set) */
    verbose(msg) {
        if (isVerbose()) {
            process.stderr.write(`${styleText('dim', '[verbose]')} ${msg}\n`);
        }
    },
    /** Alias for verbose output. */
    debug(msg) {
        this.verbose(msg);
    },
    /** Step-style debug (for pipeline steps, etc.) */
    step(stepNum, total, op, preview = '') {
        process.stderr.write(`  ${styleText('dim', `[${stepNum}/${total}]`)} ${styleText(['bold', 'cyan'], op)}${preview}\n`);
    },
    /** Step result summary */
    stepResult(summary) {
        process.stderr.write(`       ${styleText('dim', `→ ${summary}`)}\n`);
    },
};
