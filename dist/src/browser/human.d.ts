/**
 * Human-like input simulation module.
 *
 * Simulates human behavior patterns for mouse, keyboard, and scroll operations
 * to bypass behavior-based anti-bot detection systems.
 *
 * Core features:
 * - Mouse: Bezier curve trajectory, ease-in-out speed, overshoot, jitter
 * - Keyboard: Variable typing speed, typo simulation, thinking pauses
 * - Scroll: Non-linear scrolling, reading pauses, backtrack behavior
 */
/**
 * Environment variable to enable human-like behavior mode.
 * Default: false (use raw CDP commands for speed)
 * Set OPENCLI_HUMAN_MODE=true to enable human simulation
 */
export declare function isHumanModeEnabled(): boolean;
/**
 * Human behavior configuration.
 * All values can be overridden via environment variables.
 */
export interface HumanConfig {
    mouseBezierStepsMin: number;
    mouseBezierStepsMax: number;
    mouseJitterRange: number;
    mouseOvershootProbability: number;
    mouseOvershootFactorMin: number;
    mouseOvershootFactorMax: number;
    mouseSpeedMin: number;
    mouseSpeedMax: number;
    mouseClickDelayMinMs: number;
    mouseClickDelayMaxMs: number;
    mouseClickJitterPx: number;
    keyTypoProbability: number;
    keyTypoPauseWordCount: number;
    keyTypoPauseProbability: number;
    keyDelayMinMs: number;
    keyDelayMaxMs: number;
    keyTypoDelayMinMs: number;
    keyTypoDelayMaxMs: number;
    keyThinkingPauseMinMs: number;
    keyThinkingPauseMaxMs: number;
    scrollStepMinPx: number;
    scrollStepMaxPx: number;
    scrollPauseMinMs: number;
    scrollPauseMaxMs: number;
    scrollBacktrackProbability: number;
    scrollBacktrackMinPx: number;
    scrollBacktrackMaxPx: number;
}
export declare const DEFAULT_HUMAN_CONFIG: HumanConfig;
/**
 * Get config from environment overrides or use defaults.
 */
export declare function getHumanConfig(): HumanConfig;
/**
 * Generate random number in range [min, max]
 */
export declare function randomInRange(min: number, max: number): number;
/**
 * Generate random integer in range [min, max]
 */
export declare function randomIntInRange(min: number, max: number): number;
/**
 * Ease-in-out function: slow -> fast -> slow
 * Mimics human acceleration/deceleration patterns.
 */
export declare function easeInOut(t: number): number;
/**
 * Generate quadratic Bezier curve points from start to end.
 *
 * Human mouse movement is not straight-line; it curves naturally.
 * We add a random control point perpendicular to the direct path
 * with random curvature to simulate this behavior.
 */
export declare function generateBezierCurve(startX: number, startY: number, endX: number, endY: number, steps: number, jitterRange?: number): Array<{
    x: number;
    y: number;
}>;
/**
 * Generate overshoot trajectory (human sometimes overshoots and corrects back).
 * Returns additional points to append after the main trajectory.
 */
export declare function generateOvershootCurve(targetX: number, targetY: number, startX: number, startY: number, overshootFactor: number, steps?: number, jitterRange?: number): Array<{
    x: number;
    y: number;
}>;
/**
 * Adjacent key mapping for simulating typing errors.
 * When a typo occurs, we press an adjacent key instead.
 */
export declare const ADJACENT_KEYS: Record<string, string[]>;
/**
 * Get a random adjacent key for typo simulation.
 * Returns null if the character has no adjacent mapping.
 * Preserves case for letters; numbers don't have case.
 */
export declare function getAdjacentKey(char: string): string | null;
/**
 * Calculate scroll steps for human-like scrolling.
 * Returns array of scroll amounts with varying sizes.
 */
export declare function generateScrollSteps(targetDistance: number, minStep: number, maxStep: number): number[];
