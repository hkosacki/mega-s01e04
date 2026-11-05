import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

const baseConfig: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

describe('digest routes', () => {
  let tempDir: string;
  let tempConfig: RigConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    tempConfig = { ...baseConfig, runsDir: tempDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('200 on valid night: renders HTML with lane banner, sorted jobs, em dash for null owner, and warn markings, and returns matching JSON', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER-VALID';

    const lines = [
      JSON.stringify({
        at: '2026-10-29T01:00:00+01:00',
        job: 'job-c-ok',
        status: 'ok',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-10-29T01:10:00+01:00',
        job: 'job-b-retry',
        status: 'retry',
        owner: 'bob',
        error: 'err 1',
      }),
      JSON.stringify({
        at: '2026-10-29T01:11:00+01:00',
        job: 'job-b-retry',
        status: 'retry',
        owner: 'bob',
        error: 'err 2',
      }),
      JSON.stringify({
        at: '2026-10-29T01:12:00+01:00',
        job: 'job-b-retry',
        status: 'retry',
        owner: 'bob',
        error: 'err 3',
      }),
      JSON.stringify({
        at: '2026-10-29T01:13:00+01:00',
        job: 'job-b-retry',
        status: 'ok',
        owner: 'bob',
      }),
      JSON.stringify({
        at: '2026-10-29T01:20:00+01:00',
        job: 'job-d-fail',
        status: 'fail',
        owner: 'carol',
        error: 'fatal err',
      }),
      JSON.stringify({
        at: '2026-10-29T00:50:00+01:00',
        job: 'job-a-null-owner',
        status: 'ok',
        owner: null,
      }),
    ].join('\n');

    writeFileSync(join(tempDir, '2026-10-29.jsonl'), lines);

    const app = createApp(tempConfig);

    const htmlRes = await app.request('/digest/2026-10-29');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();

    expect(html).toContain('TEST-MARKER-VALID');

    const posA = html.indexOf('job-a-null-owner');
    const posB = html.indexOf('job-b-retry');
    const posC = html.indexOf('job-c-ok');
    const posD = html.indexOf('job-d-fail');
    expect(posA).toBeGreaterThan(-1);
    expect(posB).toBeGreaterThan(posA);
    expect(posC).toBeGreaterThan(posB);
    expect(posD).toBeGreaterThan(posC);

    expect(html).toContain('—');
    expect(html).toContain('class="warn"');

    const apiRes = await app.request('/api/digest/2026-10-29');
    expect(apiRes.status).toBe(200);
    const json = (await apiRes.json()) as DigestRow[];

    expect(Array.isArray(json)).toBe(true);
    expect(json.map((r) => r.job)).toEqual([
      'job-a-null-owner',
      'job-b-retry',
      'job-c-ok',
      'job-d-fail',
    ]);

    let lastIndex = -1;
    for (const row of json) {
      const idx = html.indexOf(row.job);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    const realApp = createApp(baseConfig);
    const realHtmlRes = await realApp.request('/digest/2026-10-28');
    const realApiRes = await realApp.request('/api/digest/2026-10-28');

    expect(realHtmlRes.status).toBe(200);
    expect(realApiRes.status).toBe(200);

    const realHtml = await realHtmlRes.text();
    const realJson = (await realApiRes.json()) as DigestRow[];

    expect(realJson).toHaveLength(5);
    expect(realJson.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    let realLastIndex = -1;
    for (const row of realJson) {
      const idx = realHtml.indexOf(row.job);
      expect(idx).toBeGreaterThan(realLastIndex);
      realLastIndex = idx;
    }
  });

  it('404 for a night with no file', async () => {
    const app = createApp(tempConfig);
    const htmlRes = await app.request('/digest/2026-10-99');
    const apiRes = await app.request('/api/digest/2026-10-99');

    expect(htmlRes.status).toBe(404);
    expect(apiRes.status).toBe(404);
  });

  it('empty night renders "nothing ran" on HTML and [] on API', async () => {
    writeFileSync(join(tempDir, '2026-10-30.jsonl'), '');

    const app = createApp(tempConfig);
    const htmlRes = await app.request('/digest/2026-10-30');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('nothing ran');

    const apiRes = await app.request('/api/digest/2026-10-30');
    expect(apiRes.status).toBe(200);
    const json = await apiRes.json();
    expect(json).toEqual([]);
  });

  it('night with a bad line returns 200 without throwing and includes valid job rows', async () => {
    const lines = [
      JSON.stringify({
        at: '2026-10-31T01:00:00+01:00',
        job: 'alpha/first',
        status: 'ok',
        owner: 'alice',
      }),
      'this line is not valid json {{{',
      JSON.stringify({
        at: '2026-10-31T02:00:00+01:00',
        job: 'beta/second',
        status: 'fail',
        owner: 'bob',
        error: 'crashed',
      }),
    ].join('\n');

    writeFileSync(join(tempDir, '2026-10-31.jsonl'), lines);

    const app = createApp(tempConfig);

    const htmlRes = await app.request('/digest/2026-10-31');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('alpha/first');
    expect(html).toContain('beta/second');

    const apiRes = await app.request('/api/digest/2026-10-31');
    expect(apiRes.status).toBe(200);
    const json = (await apiRes.json()) as DigestRow[];
    expect(json.map((r) => r.job)).toEqual(['alpha/first', 'beta/second']);
  });
});
