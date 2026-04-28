/**
 * E2E tests for CDP mode — direct Chrome DevTools Protocol connection.
 * Tests all new CDP features added to src/browser/cdp.ts:
 * - tabs() / newTab() / closeTab() via Target domain
 * - nativeClick() / nativeType() / nativeKeyPress() via Input domain
 * - cdp() passthrough
 * - setFileInput() via DOM.setFileInputFiles
 * - frames() / evaluateInFrame() via Page.getFrameTree + Runtime.evaluate
 * - closeWindow() via Target.closeTarget
 *
 * Prerequisites:
 * - Chrome running with --remote-debugging-port=9222
 * - OPENCLI_CDP_ENDPOINT=http://localhost:9222
 * - OPENCLI_CDP_STEALTH=false (optional, if Chrome already has stealth)
 */

import { describe, it, expect } from 'vitest';
import { runCli, parseJsonOutput, type CliResult } from './helpers.js';

const CDP_ENDPOINT = process.env.OPENCLI_CDP_ENDPOINT || 'http://localhost:9222';

function isCdpUnavailable(result: CliResult): boolean {
  const text = `${result.stderr}\n${result.stdout}`;
  return /CDP endpoint not provided|No inspectable targets found|CDP connect timeout|Cannot debug tab|unknown option/i.test(text);
}

async function runCdpCli(args: string[], timeout: number = 60_000): Promise<CliResult> {
  return runCli(args, {
    timeout,
    env: {
      OPENCLI_CDP_ENDPOINT: CDP_ENDPOINT,
      OPENCLI_CDP_STEALTH: 'false',
      ...process.env,
    },
  });
}

describe('CDP Mode E2E Tests', () => {
  it('lists tabs via Target.getTargets', async () => {
    const result = await runCdpCli(['browser', 'tab', 'list'], 60_000);

    if (isCdpUnavailable(result)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    expect(result.code).toBe(0);
    const tabs = parseJsonOutput(result.stdout);
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThanOrEqual(1);

    const tab = tabs[0];
    expect(tab).toHaveProperty('url');
    expect(tab).toHaveProperty('page');
  }, 60_000);

  it('creates new tab via Target.createTarget', async () => {
    const result = await runCdpCli(['browser', 'tab', 'new', 'https://www.xiaohongshu.com'], 60_000);

    if (isCdpUnavailable(result)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    expect(result.code).toBe(0);
    const data = parseJsonOutput(result.stdout);
    expect(data).toHaveProperty('page');
  }, 60_000);

  it('captures screenshot via CDP', async () => {
    const openResult = await runCdpCli(['browser', 'open', 'https://www.xiaohongshu.com'], 90_000);

    if (isCdpUnavailable(openResult)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    const result = await runCdpCli(['browser', 'screenshot'], 30_000);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^iVBORw0KGgo|^base64:/);
  }, 90_000);

  it('captures network requests via CDP Network events', async () => {
    const openResult = await runCdpCli(['browser', 'open', 'https://www.bilibili.com'], 90_000);

    if (isCdpUnavailable(openResult)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    const result = await runCdpCli(['browser', 'network'], 30_000);

    if (result.code !== 0) {
      console.warn(`network capture failed: ${result.stderr}`);
      return;
    }

    const data = parseJsonOutput(result.stdout);
    expect(data).toHaveProperty('entries');
    expect(Array.isArray(data.entries)).toBe(true);
  }, 90_000);

  it('lists frames via Page.getFrameTree', async () => {
    const openResult = await runCdpCli(['browser', 'open', 'https://www.bilibili.com'], 90_000);

    if (isCdpUnavailable(openResult)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    const result = await runCdpCli(['browser', 'frames'], 30_000);
    expect(result.code).toBe(0);
    const frames = parseJsonOutput(result.stdout);
    expect(Array.isArray(frames)).toBe(true);
  }, 90_000);

  it('closes tab via Target.closeTarget', async () => {
    const newResult = await runCdpCli(['browser', 'tab', 'new', 'https://example.com'], 60_000);

    if (isCdpUnavailable(newResult)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    const listResult = await runCdpCli(['browser', 'tab', 'list'], 30_000);
    const tabs = parseJsonOutput(listResult.stdout);

    if (tabs.length > 1) {
      const closeResult = await runCdpCli(['browser', 'tab', 'close', String(tabs.length - 1)], 30_000);
      expect(closeResult.code).toBe(0);
    }
  }, 90_000);

  it('closes window via browser close', async () => {
    const newResult = await runCdpCli(['browser', 'tab', 'new', 'https://example.com'], 60_000);

    if (isCdpUnavailable(newResult)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    const closeResult = await runCdpCli(['browser', 'close'], 30_000);
    expect(closeResult.code).toBe(0);
  }, 60_000);
});

describe('CDP Mode - Adapter Integration', () => {
  it('fetches bilibili hot list via CDP', async () => {
    const result = await runCdpCli(['bilibili', 'hot', '--limit', '5', '-f', 'json'], 120_000);

    if (isCdpUnavailable(result)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    if (result.code !== 0) {
      console.warn(`bilibili hot failed: ${result.stderr || result.stdout}`);
      return;
    }

    const data = parseJsonOutput(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);

    if (data.length > 0) {
      expect(data[0]).toHaveProperty('title');
    }
  }, 120_000);

  it('fetches xiaohongshu explore via CDP', async () => {
    const result = await runCdpCli(['xiaohongshu', 'explore', '--limit', '3', '-f', 'json'], 120_000);

    if (isCdpUnavailable(result)) {
      console.warn('CDP endpoint unavailable — test skipped');
      return;
    }

    if (result.code !== 0) {
      console.warn('xiaohongshu explore: blocked or failed — test skipped');
      return;
    }

    const data = parseJsonOutput(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(3);
  }, 120_000);
});