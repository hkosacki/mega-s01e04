import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightCounts, NightDigest, ReadNight, RunStatus } from './types.js';

export type { DigestRow, NightCounts, NightDigest, ReadNight, RunStatus } from './types.js';

type LogEntry = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function parseLine(line: string): LogEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.at !== 'string' || typeof rec.job !== 'string') {
    return null;
  }
  if (!isRunStatus(rec.status)) {
    return null;
  }
  if (typeof rec.owner !== 'string' && rec.owner !== null) {
    return null;
  }
  if (rec.error !== undefined && typeof rec.error !== 'string') {
    return null;
  }
  return {
    at: rec.at,
    job: rec.job,
    status: rec.status,
    owner: rec.owner,
    ...(typeof rec.error === 'string' ? { error: rec.error } : {}),
  };
}

export const readNight: ReadNight = (runsDir: string, night: string): NightDigest | null => {
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) {
      badLines += 1;
      continue;
    }

    counts[entry.status] += 1;

    const existing = byJob.get(entry.job);
    if (!existing) {
      byJob.set(entry.job, {
        job: entry.job,
        owner: entry.owner,
        runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status,
        lastError: entry.error ?? null,
        first: entry.at,
        last: entry.at,
      });
    } else {
      existing.owner = entry.owner;
      existing.runs += 1;
      if (entry.status === 'retry') {
        existing.retries += 1;
      }
      existing.lastStatus = entry.status;
      if (entry.error !== undefined) {
        existing.lastError = entry.error;
      }
      existing.last = entry.at;
    }
  }

  const rows = Array.from(byJob.values()).sort((a, b) => a.job.localeCompare(b.job));

  return {
    night,
    rows,
    badLines,
    counts,
  };
};
