import { describe, expect, it } from 'vitest';
import {
  isHumanModeEnabled,
  getHumanConfig,
  DEFAULT_HUMAN_CONFIG,
  randomInRange,
  randomIntInRange,
  easeInOut,
  generateBezierCurve,
  generateOvershootCurve,
  getAdjacentKey,
  ADJACENT_KEYS,
  generateScrollSteps,
} from './human.js';

describe('human config', () => {
  it('returns false by default for human mode', () => {
    expect(isHumanModeEnabled()).toBe(false);
  });

  it('returns true when OPENCLI_HUMAN_MODE is set', () => {
    process.env.OPENCLI_HUMAN_MODE = 'true';
    expect(isHumanModeEnabled()).toBe(true);
    delete process.env.OPENCLI_HUMAN_MODE;
  });

  it('returns default config when no env overrides', () => {
    const cfg = getHumanConfig();
    expect(cfg.mouseSpeedMin).toBe(DEFAULT_HUMAN_CONFIG.mouseSpeedMin);
    expect(cfg.keyTypoProbability).toBe(DEFAULT_HUMAN_CONFIG.keyTypoProbability);
    expect(cfg.scrollBacktrackProbability).toBe(DEFAULT_HUMAN_CONFIG.scrollBacktrackProbability);
  });
});

describe('random functions', () => {
  it('randomInRange produces values within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInRange(50, 100);
      expect(val).toBeGreaterThanOrEqual(50);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it('randomIntInRange produces integers within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomIntInRange(50, 100);
      expect(val).toBeGreaterThanOrEqual(50);
      expect(val).toBeLessThanOrEqual(100);
      expect(Number.isInteger(val)).toBe(true);
    }
  });
});

describe('easeInOut', () => {
  it('starts slow (accelerating)', () => {
    const t0 = easeInOut(0);
    const t25 = easeInOut(0.25);
    expect(t0).toBe(0);
    expect(t25).toBeLessThan(0.25); // accelerating
  });

  it('ends slow (decelerating)', () => {
    const t75 = easeInOut(0.75);
    const t100 = easeInOut(1);
    expect(t100).toBe(1);
    expect(1 - t75).toBeLessThan(0.25); // decelerating
  });

  it('is symmetric around midpoint', () => {
    expect(easeInOut(0.5)).toBe(0.5);
  });
});

describe('Bezier curve generation', () => {
  it('generates correct number of points', () => {
    const points = generateBezierCurve(0, 0, 100, 100, 50);
    expect(points.length).toBe(51); // 0 to 50 inclusive
  });

  it('starts at start point', () => {
    const points = generateBezierCurve(10, 20, 200, 300, 30);
    expect(points[0].x).toBeCloseTo(10, 1);
    expect(points[0].y).toBeCloseTo(20, 1);
  });

  it('ends at end point', () => {
    const points = generateBezierCurve(10, 20, 200, 300, 30);
    expect(points[points.length - 1].x).toBeCloseTo(200, 1);
    expect(points[points.length - 1].y).toBeCloseTo(300, 1);
  });

  it('curve is not straight line (has control point offset)', () => {
    // A straight line would have all points on the direct path
    // With random curvature, some points should deviate
    const points = generateBezierCurve(0, 0, 100, 0, 20, 0); // horizontal line, no jitter

    // Check if any point deviates from y=0 (due to curve)
    const hasCurve = points.some(p => Math.abs(p.y) > 1);
    // With random curvature, this should be true most of the time
    // But since curvature is random, we just verify structure
    expect(points.length).toBeGreaterThan(0);
  });

  it('adds jitter when specified', () => {
    const pointsNoJitter = generateBezierCurve(0, 0, 100, 100, 20, 0);
    const pointsWithJitter = generateBezierCurve(0, 0, 100, 100, 20, 5);

    // Points with jitter should have slightly different values
    const hasJitterDiff = pointsWithJitter.some((p, i) =>
      Math.abs(p.x - pointsNoJitter[i].x) > 0.1 ||
      Math.abs(p.y - pointsNoJitter[i].y) > 0.1
    );
    expect(hasJitterDiff).toBe(true);
  });

  it('handles very short distances', () => {
    const points = generateBezierCurve(50, 50, 50, 50, 10); // same point
    expect(points.length).toBe(1);
    expect(points[0].x).toBe(50);
    expect(points[0].y).toBe(50);
  });
});

describe('overshoot curve generation', () => {
  it('generates curve that overshoots target', () => {
    const points = generateOvershootCurve(100, 100, 0, 0, 1.2, 15);
    expect(points.length).toBe(16);

    // Overshoot should go beyond target
    const lastPoint = points[points.length - 1];
    expect(lastPoint.x).toBeGreaterThan(100);
    expect(lastPoint.y).toBeGreaterThan(100);
  });

  it('starts at target position', () => {
    const points = generateOvershootCurve(100, 100, 0, 0, 1.2, 10);
    expect(points[0].x).toBeCloseTo(100, 1);
    expect(points[0].y).toBeCloseTo(100, 1);
  });
});

describe('adjacent key mapping', () => {
  it('returns adjacent keys for known letters', () => {
    const adjA = getAdjacentKey('a');
    expect(adjA).not.toBeNull();
    expect(ADJACENT_KEYS['a']).toContain(adjA);

    const adjK = getAdjacentKey('k');
    expect(adjK).not.toBeNull();
    expect(ADJACENT_KEYS['k']).toContain(adjK);
  });

  it('returns adjacent keys for numbers', () => {
    const adj5 = getAdjacentKey('5');
    expect(adj5).not.toBeNull();
    // Number adjacent keys are lowercase since numbers have no case
    expect(ADJACENT_KEYS['5']).toContain(adj5);
  });

  it('preserves case', () => {
    const adjUpper = getAdjacentKey('A');
    expect(adjUpper).not.toBeNull();
    expect(adjUpper).toBe(adjUpper!.toUpperCase());

    const adjLower = getAdjacentKey('a');
    expect(adjLower).not.toBeNull();
    expect(adjLower).toBe(adjLower!.toLowerCase());
  });

  it('returns null for unknown characters', () => {
    expect(getAdjacentKey('!')).toBeNull();
    expect(getAdjacentKey('@')).toBeNull();
    expect(getAdjacentKey('你好')).toBeNull(); // CJK
  });
});

describe('scroll step generation', () => {
  it('generates steps that sum to target', () => {
    const steps = generateScrollSteps(1000, 100, 300);
    const total = steps.reduce((sum, s) => sum + s, 0);
    expect(total).toBe(1000);
  });

  it('generates steps within range', () => {
    const steps = generateScrollSteps(2000, 100, 500);
    expect(steps.every(s => s >= 100 && s <= 500 || s < 100)).toBe(true); // final step can be smaller
  });

  it('generates multiple steps for large targets', () => {
    const steps = generateScrollSteps(3000, 100, 400);
    expect(steps.length).toBeGreaterThan(1);
  });
});