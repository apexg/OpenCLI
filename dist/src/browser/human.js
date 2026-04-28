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
export function isHumanModeEnabled() {
    return process.env.OPENCLI_HUMAN_MODE === 'true' || process.env.OPENCLI_HUMAN_MODE === '1';
}
export const DEFAULT_HUMAN_CONFIG = {
    // Mouse: bezier curve with 30-80 steps based on distance
    mouseBezierStepsMin: 30,
    mouseBezierStepsMax: 80,
    mouseJitterRange: 1.5, // ±1.5px jitter on each point
    mouseOvershootProbability: 0.2, // 20% chance to overshoot
    mouseOvershootFactorMin: 1.15,
    mouseOvershootFactorMax: 1.35,
    mouseSpeedMin: 400, // 400-800 px/s
    mouseSpeedMax: 800,
    mouseClickDelayMinMs: 50, // 50-150ms between down/up
    mouseClickDelayMaxMs: 150,
    mouseClickJitterPx: 3, // ±3px on click target
    // Keyboard: 3% typo rate, pause every 5 chars
    keyTypoProbability: 0.03,
    keyTypoPauseWordCount: 5,
    keyTypoPauseProbability: 0.35,
    keyDelayMinMs: 30,
    keyDelayMaxMs: 100,
    keyTypoDelayMinMs: 80,
    keyTypoDelayMaxMs: 200,
    keyThinkingPauseMinMs: 500,
    keyThinkingPauseMaxMs: 1500,
    // Scroll: 300-800px per step, 0.5-2.5s pause, 10% backtrack
    scrollStepMinPx: 300,
    scrollStepMaxPx: 800,
    scrollPauseMinMs: 500,
    scrollPauseMaxMs: 2500,
    scrollBacktrackProbability: 0.1,
    scrollBacktrackMinPx: 50,
    scrollBacktrackMaxPx: 150,
};
/**
 * Get config from environment overrides or use defaults.
 */
export function getHumanConfig() {
    const cfg = { ...DEFAULT_HUMAN_CONFIG };
    // Mouse overrides
    if (process.env.OPENCLI_HUMAN_MOUSE_SPEED_MIN)
        cfg.mouseSpeedMin = parseInt(process.env.OPENCLI_HUMAN_MOUSE_SPEED_MIN, 10);
    if (process.env.OPENCLI_HUMAN_MOUSE_SPEED_MAX)
        cfg.mouseSpeedMax = parseInt(process.env.OPENCLI_HUMAN_MOUSE_SPEED_MAX, 10);
    if (process.env.OPENCLI_HUMAN_MOUSE_JITTER)
        cfg.mouseJitterRange = parseFloat(process.env.OPENCLI_HUMAN_MOUSE_JITTER);
    if (process.env.OPENCLI_HUMAN_MOUSE_OVERSHOOT_PROB)
        cfg.mouseOvershootProbability = parseFloat(process.env.OPENCLI_HUMAN_MOUSE_OVERSHOOT_PROB);
    // Keyboard overrides
    if (process.env.OPENCLI_HUMAN_TYPO_PROB)
        cfg.keyTypoProbability = parseFloat(process.env.OPENCLI_HUMAN_TYPO_PROB);
    if (process.env.OPENCLI_HUMAN_KEY_DELAY_MIN)
        cfg.keyDelayMinMs = parseInt(process.env.OPENCLI_HUMAN_KEY_DELAY_MIN, 10);
    if (process.env.OPENCLI_HUMAN_KEY_DELAY_MAX)
        cfg.keyDelayMaxMs = parseInt(process.env.OPENCLI_HUMAN_KEY_DELAY_MAX, 10);
    // Scroll overrides
    if (process.env.OPENCLI_HUMAN_SCROLL_STEP_MIN)
        cfg.scrollStepMinPx = parseInt(process.env.OPENCLI_HUMAN_SCROLL_STEP_MIN, 10);
    if (process.env.OPENCLI_HUMAN_SCROLL_STEP_MAX)
        cfg.scrollStepMaxPx = parseInt(process.env.OPENCLI_HUMAN_SCROLL_STEP_MAX, 10);
    if (process.env.OPENCLI_HUMAN_SCROLL_PAUSE_MIN)
        cfg.scrollPauseMinMs = parseInt(process.env.OPENCLI_HUMAN_SCROLL_PAUSE_MIN, 10);
    if (process.env.OPENCLI_HUMAN_SCROLL_PAUSE_MAX)
        cfg.scrollPauseMaxMs = parseInt(process.env.OPENCLI_HUMAN_SCROLL_PAUSE_MAX, 10);
    return cfg;
}
// ── Utility Functions ──────────────────────────────────────────────────────
/**
 * Generate random number in range [min, max]
 */
export function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}
/**
 * Generate random integer in range [min, max]
 */
export function randomIntInRange(min, max) {
    return Math.floor(randomInRange(min, max + 1));
}
/**
 * Ease-in-out function: slow -> fast -> slow
 * Mimics human acceleration/deceleration patterns.
 */
export function easeInOut(t) {
    if (t < 0.5) {
        return 2 * t * t;
    }
    return 1 - Math.pow(-2 * t + 2, 2) / 2;
}
// ── Mouse: Bezier Curve Trajectory ──────────────────────────────────────────
/**
 * Generate quadratic Bezier curve points from start to end.
 *
 * Human mouse movement is not straight-line; it curves naturally.
 * We add a random control point perpendicular to the direct path
 * with random curvature to simulate this behavior.
 */
export function generateBezierCurve(startX, startY, endX, endY, steps, jitterRange = 0) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // Prevent division by zero for very short distances
    if (distance < 1) {
        return [{ x: endX, y: endY }];
    }
    // Perpendicular direction for control point offset
    const perpX = -dy / distance;
    const perpY = dx / distance;
    // Random curvature (some paths curve more, some are nearly straight)
    const curvature = randomInRange(-0.3, 0.3) * distance;
    // Control point at midpoint, offset perpendicular + random noise
    const cx = (startX + endX) / 2 + perpX * curvature + randomInRange(-50, 50);
    const cy = (startY + endY) / 2 + perpY * curvature + randomInRange(-50, 50);
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic Bezier formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
        const t1 = 1 - t;
        const x = t1 * t1 * startX + 2 * t1 * t * cx + t * t * endX;
        const y = t1 * t1 * startY + 2 * t1 * t * cy + t * t * endY;
        // Add jitter to simulate micro-tremors
        const jitterX = jitterRange > 0 ? x + randomInRange(-jitterRange, jitterRange) : x;
        const jitterY = jitterRange > 0 ? y + randomInRange(-jitterRange, jitterRange) : y;
        points.push({ x: jitterX, y: jitterY });
    }
    return points;
}
/**
 * Generate overshoot trajectory (human sometimes overshoots and corrects back).
 * Returns additional points to append after the main trajectory.
 */
export function generateOvershootCurve(targetX, targetY, startX, startY, overshootFactor, steps = 15, jitterRange = 0) {
    const overshootX = targetX + (targetX - startX) * (overshootFactor - 1);
    const overshootY = targetY + (targetY - startY) * (overshootFactor - 1);
    return generateBezierCurve(targetX, targetY, overshootX, overshootY, steps, jitterRange);
}
// ── Keyboard: Adjacent Key Map for Typo Simulation ───────────────────────────
/**
 * Adjacent key mapping for simulating typing errors.
 * When a typo occurs, we press an adjacent key instead.
 */
export const ADJACENT_KEYS = {
    'a': ['q', 'w', 's', 'z'],
    'b': ['v', 'g', 'h', 'n'],
    'c': ['x', 'd', 'f', 'v'],
    'd': ['s', 'e', 'r', 'f', 'c', 'x'],
    'e': ['w', 's', 'd', 'r'],
    'f': ['d', 'r', 't', 'g', 'v', 'c'],
    'g': ['f', 't', 'y', 'h', 'b', 'v'],
    'h': ['g', 'y', 'u', 'j', 'n', 'b'],
    'i': ['u', 'j', 'k', 'o'],
    'j': ['h', 'u', 'i', 'k', 'm', 'n'],
    'k': ['j', 'i', 'o', 'l', 'm'],
    'l': ['k', 'o', 'p'],
    'm': ['n', 'j', 'k'],
    'n': ['b', 'h', 'j', 'm'],
    'o': ['i', 'k', 'l', 'p'],
    'p': ['o', 'l'],
    'q': ['w', 'a'],
    'r': ['e', 'd', 'f', 't'],
    's': ['a', 'w', 'e', 'd', 'x', 'z'],
    't': ['r', 'f', 'g', 'y'],
    'u': ['y', 'h', 'j', 'i'],
    'v': ['c', 'f', 'g', 'b'],
    'w': ['q', 'a', 's', 'e'],
    'x': ['z', 'a', 's', 'd', 'c'],
    'y': ['t', 'g', 'h', 'u'],
    'z': ['a', 's', 'x'],
    '0': ['9', 'o', 'p'],
    '1': ['2', 'q', 'w'],
    '2': ['1', '3', 'w', 'e', 'q'],
    '3': ['2', '4', 'e', 'r', 'w'],
    '4': ['3', '5', 'r', 't', 'e'],
    '5': ['4', '6', 't', 'y', 'r'],
    '6': ['5', '7', 'y', 'u', 't'],
    '7': ['6', '8', 'u', 'i', 'y'],
    '8': ['7', '9', 'i', 'o', 'u'],
    '9': ['8', '0', 'o', 'p', 'i'],
};
/**
 * Get a random adjacent key for typo simulation.
 * Returns null if the character has no adjacent mapping.
 * Preserves case for letters; numbers don't have case.
 */
export function getAdjacentKey(char) {
    const lower = char.toLowerCase();
    const adjacent = ADJACENT_KEYS[lower];
    if (!adjacent || adjacent.length === 0)
        return null;
    const chosen = adjacent[randomIntInRange(0, adjacent.length - 1)];
    // Preserve case for letters; numbers and special chars have no case
    const isLetter = /[a-zA-Z]/.test(char);
    if (isLetter && char === char.toUpperCase()) {
        return chosen.toUpperCase();
    }
    return chosen;
}
// ── Scroll: Non-linear Behavior ─────────────────────────────────────────────
/**
 * Calculate scroll steps for human-like scrolling.
 * Returns array of scroll amounts with varying sizes.
 */
export function generateScrollSteps(targetDistance, minStep, maxStep) {
    const steps = [];
    let remaining = targetDistance;
    while (remaining > minStep) {
        const step = Math.min(randomIntInRange(minStep, maxStep), remaining);
        steps.push(step);
        remaining -= step;
    }
    // Add final small step if there's remaining distance
    if (remaining > 0) {
        steps.push(remaining);
    }
    return steps;
}
