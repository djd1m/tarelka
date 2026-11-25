import { createServer, type IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPhotoS3Client, type StorageConfig } from '@n4/shared';
import { createPhotoStorage } from '../../apps/api/src/photo/store-original.js';
import { createRecognizerStorage } from '../../apps/recognizer/src/photo/storage.js';
import { createMinioPhotoStore } from '../../apps/recognizer/src/storage/photo-store-minio.js';
import { createPhotoObjectLister } from '../../apps/api/src/photo/storage-object-lister.js';
import { purgeOrphanObjects } from '../../apps/api/src/photo/purge-orphans.js';
import type { DbPool } from '@n4/db';

interface RecordedRequest {
  method: string;
  url: URL;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const firstKey = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
const secondKey = '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.jpg';
const objects = new Map<string, { body: Buffer; contentType: string }>();
const requests: RecordedRequest[] = [];
let versioning: string | undefined;
let versioningForbidden: boolean;
let deleteForbidden: boolean;
let listing: 'normal' | 'missing-token' | 'repeated-token' | 'cyclic-token' | 'malformed' | 'denied-page';
let bucketStatus: number;
let config: StorageConfig;

const server = createServer(async (request, response) => {
  const url = new URL(request.url!, 'http://localhost');
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  requests.push({ method: request.method!, url, headers: request.headers, body });
  const fail = (status: number, code: string) => {
    response.writeHead(status, { 'Content-Type': 'application/xml' });
    response.end(`<Error><Code>${code}</Code><Message>fixture failure</Message></Error>`);
  };
  if (url.searchParams.has('versioning')) {
    if (versioningForbidden) return fail(403, 'AccessDenied');
    response.setHeader('Content-Type', 'application/xml');
    return response.end(`<VersioningConfiguration>${versioning === undefined ? '' : `<Status>${versioning}</Status>`}</VersioningConfiguration>`);
  }
  if (url.searchParams.get('list-type') === '2') {
    const token = url.searchParams.get('continuation-token');
    if (token && listing === 'denied-page') return fail(403, 'AccessDenied');
    const truncated = !token || listing === 'repeated-token' || listing === 'cyclic-token';
    const nextToken = listing === 'cyclic-token' && token === 'page-two' ? 'page-three' : 'page-two';
    const next = listing === 'missing-token' ? '' : `<NextContinuationToken>${nextToken}</NextContinuationToken>`;
    const key = token ? secondKey : firstKey;
    const date = listing === 'malformed' ? '' : '<LastModified>2020-01-01T00:00:00Z</LastModified>';
    response.setHeader('Content-Type', 'application/xml');
    return response.end(`<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${truncated ? next : ''}<Contents><Key>${key}</Key>${date}<Size>3</Size></Contents></ListBucketResult>`);
  }
  const key = decodeURIComponent(url.pathname.replace(/^\/photos\/?/, ''));
  if (request.method === 'HEAD' && !key) {
    response.writeHead(bucketStatus);
    return response.end();
  }
  if (key === 'forbidden') return fail(403, 'AccessDenied');
  if (key === 'offline') return request.socket.destroy();
  if (request.method === 'PUT') {
    objects.set(key, { body, contentType: request.headers['content-type']! });
    response.setHeader('ETag', '"opaque-tag"');
    return response.end();
  }
  if (request.method === 'DELETE') {
    if (deleteForbidden) return fail(403, 'AccessDenied');
    objects.delete(key);
    response.writeHead(204);
    return response.end();
  }
  const object = objects.get(key);
  if (!object) return fail(404, 'NoSuchKey');
  response.writeHead(200, { 'Content-Type': object.contentType, 'Content-Length': object.body.length });
  response.end(request.method === 'HEAD' ? undefined : object.body);
});

beforeEach(async () => {
  objects.clear();
  requests.length = 0;
  versioning = undefined;
  versioningForbidden = false;
  deleteForbidden = false;
  listing = 'normal';
  bucketStatus = 200;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  config = {
    endpoint: `http://127.0.0.1:${address.port}`, region: 'ru-central-1', forcePathStyle: true,
    bucket: 'photos', accessKey: 'tenant:key', secretKey: 'fixture-secret',
  };
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('S3 photo adapters over the real SDK transport', () => {
  it('preserves bytes, MIME, signing region and caller TTL across API and recognizer', async () => {
    const api = createPhotoStorage(config);
    const recognizer = createRecognizerStorage(config);
    const original = Buffer.from([0, 255, 3, 10, 13]);
    await api.ensureBucket();
    await api.putOriginal('session/фото.png', original, 'image/png');
    expect(await recognizer.getObject('session/фото.png')).toEqual(original);
    expect(await api.exists('session/фото.png')).toBe(true);
    await recognizer.putNormalized('session/photo.normalized.jpg', Buffer.from('jpeg-data'));
    expect(objects.get('session/photo.normalized.jpg')?.contentType).toBe('image/jpeg');
    expect(await recognizer.getObject('session/photo.normalized.jpg')).toEqual(Buffer.from('jpeg-data'));
    const signed = new URL(await api.presignedGetUrl('session/фото.png', 900));
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(signed.searchParams.get('X-Amz-Credential')).toContain('/ru-central-1/s3/aws4_request');
    const response = await fetch(signed);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
    expect(response.headers.get('content-type')).toBe('image/png');
    const put = requests.find((request) => request.method === 'PUT')!;
    expect(put.headers.authorization).toContain('Credential=tenant:key/');
    expect(put.headers.authorization).toContain('/ru-central-1/s3/aws4_request');
    expect(put.headers['x-amz-sdk-checksum-algorithm']).toBeUndefined();
    expect(put.headers['content-encoding']).not.toBe('aws-chunked');
  });

  it('uses Cloud.ru virtual-host addressing and explicit checksum and retry configuration', async () => {
    const cloudConfig = { ...config, endpoint: 'https://s3.cloud.ru', forcePathStyle: false };
    const url = new URL(await createPhotoStorage(cloudConfig).presignedGetUrl('session/photo.jpg', 60));
    expect(url.hostname).toBe('photos.s3.cloud.ru');
    expect(url.pathname).toBe('/session/photo.jpg');
    const client = createPhotoS3Client(cloudConfig);
    expect(await client.config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    expect(await client.config.responseChecksumValidation()).toBe('WHEN_REQUIRED');
    expect(await client.config.maxAttempts()).toBe(3);
    client.destroy();
  });

  it('distinguishes missing objects, access failures and transport failures', async () => {
    const api = createPhotoStorage(config);
    expect(await api.exists('missing')).toBe(false);
    await expect(api.exists('forbidden')).rejects.toThrow();
    await expect(api.exists('offline')).rejects.toThrow();
    for (const status of [404, 403]) {
      bucketStatus = status;
      await expect(api.ensureBucket()).rejects.toThrow();
    }
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(0);
  });

  it('checks versioning before every delete and refuses unsafe or unreadable status', async () => {
    const api = createPhotoStorage(config);
    const erasure = createMinioPhotoStore({ storage: config });
    const orphan = createPhotoObjectLister(config);
    const removers = [api.removeObject, erasure.purgeObject, orphan.removeObject];
    for (const remove of removers) {
      versioning = undefined;
      objects.set('already-missing', { body: Buffer.from('private-photo'), contentType: 'image/jpeg' });
      await remove('already-missing');
      expect(await api.exists('already-missing')).toBe(false);
      await remove('already-missing');
      const deleteCount = requests.filter((request) => request.method === 'DELETE').length;
      for (const status of ['Enabled', 'Suspended']) {
        versioning = status;
        await expect(remove('already-missing')).rejects.toThrow('версионированием');
      }
      versioningForbidden = true;
      await expect(remove('already-missing')).rejects.toThrow();
      versioningForbidden = false;
      expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(deleteCount);
    }
    expect(requests.filter((request) => request.url.searchParams.has('versioning'))).toHaveLength(15);
  });

  it('propagates failed DELETE so expiry, erasure and orphan cleanup can retry', async () => {
    deleteForbidden = true;
    const erasure = createMinioPhotoStore({ storage: config });
    await expect(erasure.purgeObject('photo.jpg')).rejects.toThrow();
    await expect(createPhotoStorage(config).removeObject('photo.jpg')).rejects.toThrow();
    await expect(createPhotoObjectLister(config).removeObject('photo.jpg')).rejects.toThrow();
  });

  it('feeds nonempty page two to the existing orphan policy and preserves prefix and continuation', async () => {
    const checked: unknown[] = [];
    const pool = { query: async (_sql: string, values: unknown[]) => {
      checked.push(values[0]);
      return { rowCount: values[0] === firstKey ? 1 : 0 };
    } } as unknown as DbPool;
    const result = await purgeOrphanObjects(pool, createPhotoObjectLister(config), '11111111-');
    expect(checked).toEqual([firstKey, secondKey]);
    expect(result.removed).toBe(1);
    const pages = requests.filter((request) => request.url.searchParams.has('list-type'));
    expect(pages.map((request) => request.url.searchParams.get('prefix'))).toEqual(['11111111-', '11111111-']);
    expect(pages[1]!.url.searchParams.get('continuation-token')).toBe('page-two');
    expect(requests.find((request) => request.method === 'DELETE')!.url.pathname).toBe(`/photos/${secondKey}`);
  });

  it.each(['missing-token', 'repeated-token', 'cyclic-token', 'malformed', 'denied-page'] as const)('rejects incomplete listing %s', async (mode) => {
    listing = mode;
    const collect = async () => {
      for await (const object of createPhotoObjectLister(config).listObjects('')) void object;
    };
    await expect(collect()).rejects.toThrow();
  });
});
