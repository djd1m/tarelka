import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { expect, it, vi } from 'vitest';
import { createLogger } from '@n4/shared';
import type { DbPool } from '@n4/db';
import { registerScansRoutes } from '../../apps/api/src/routes/scans.js';
import type { PhotoStorage } from '../../apps/api/src/photo/store-original.js';
import { testApiConfig } from '../helpers/config.js';
import { buildMultipartBody } from '../helpers/multipart.js';
import { makeJpegFixture } from '../helpers/image-fixtures.js';

it('preserves replay, quota and database responses when rollback cleanup fails', async () => {
  const file = await makeJpegFixture();
  for (const mode of ['replay', 'quota', 'database'] as const) {
    const sessionId = randomUUID();
    const existingScanId = randomUUID();
    const events: string[] = [];
    const logs: string[] = [];
    const client = {
      query: async (sql: string) => {
        events.push(sql.trim());
        if (sql.includes('INSERT INTO photo')) {
          if (mode === 'database') throw new Error('database fixture failure');
          return { rows: [{ id: randomUUID() }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO recognition')) {
          return mode === 'replay' ? { rows: [], rowCount: 0 } : { rows: [{ id: randomUUID() }], rowCount: 1 };
        }
        if (sql.includes('SELECT id, status FROM recognition')) {
          return { rows: [{ id: existingScanId, status: 'queued' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => events.push('RELEASE'),
    };
    const pool = {
      query: async () => ({ rows: [{ id: sessionId, account_id: null, account_status: null }], rowCount: 1 }),
      connect: async () => client,
    } as unknown as DbPool;
    const put = vi.fn<PhotoStorage['putOriginal']>(async () => {});
    const remove = vi.fn<PhotoStorage['removeObject']>(async () => {
      expect(events).toContain('ROLLBACK');
      expect(events).toContain('RELEASE');
      throw new Error('S3 deletion unavailable');
    });
    const storage: PhotoStorage = {
      ensureBucket: async () => {}, putOriginal: put, removeObject: remove,
      exists: async () => false, presignedGetUrl: async () => '',
    };
    const app = Fastify();
    await app.register(cookie);
    await app.register(multipart);
    registerScansRoutes(app, {
      pool, config: testApiConfig(), storage,
      logger: createLogger({ service: 'cleanup-test', sink: (line) => logs.push(line) }),
    });
    try {
      const { body, contentType } = buildMultipartBody([
        { fieldName: 'file', filename: 'plate.jpg', contentType: 'image/jpeg', data: file },
      ]);
      const response = await app.inject({
        method: 'POST', url: '/api/v1/scans', payload: body,
        headers: { cookie: 'n4_session=test-token', 'content-type': contentType, 'idempotency-key': randomUUID() },
      });
      expect(response.statusCode).toBe({ replay: 202, quota: 429, database: 503 }[mode]);
      if (mode === 'replay') expect(response.json().data).toEqual({ scan_id: existingScanId, status: 'queued' });
      else expect(response.json().error.code).toBe(mode === 'quota' ? 'quota_exhausted' : 'dependency_unavailable');
      expect(put).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledExactlyOnceWith(put.mock.calls[0]![0]);
      expect(put.mock.calls[0]![0]).toMatch(new RegExp(`^${sessionId}/`));
      expect(put.mock.calls[0]![0]).not.toContain(existingScanId);
      expect(logs.some((line) => line.includes('scan_cleanup_failed'))).toBe(true);
      expect(events).not.toContain('COMMIT');
    } finally {
      await app.close();
    }
  }
});
