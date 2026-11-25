import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const compose = parse(readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8'));

describe('Cloud.ru and isolated local S3 Compose wiring', () => {
  it('passes all external S3 settings only to API and recognizer', () => {
    for (const name of ['api', 'recognizer']) {
      const service = compose.services[name];
      for (const variable of ['S3_ENDPOINT', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
        expect(service.environment[variable]).toBe(`\${${variable}:-}`);
      }
      expect(Object.keys(service.depends_on)).toEqual(['db']);
      expect(service.networks).toContain('egress');
    }
    expect(compose.services.web.environment.S3_ACCESS_KEY).toBeUndefined();
    expect(compose.services.web.environment.S3_SECRET_KEY).toBeUndefined();
  });

  it('keeps test endpoint and credentials independent from production S3 settings', () => {
    const test = compose.services.test;
    expect(test.environment.S3_ENDPOINT).toBe('http://storage:9000');
    expect(test.environment.S3_REGION).toBe('us-east-1');
    expect(test.environment.S3_FORCE_PATH_STYLE).toBe('true');
    expect(test.environment.S3_BUCKET).toBe('${N4_S3_BUCKET:-n4-photos}');
    expect(test.environment.S3_ACCESS_KEY).toBe('${N4_S3_ACCESS_KEY:-}');
    expect(test.environment.S3_SECRET_KEY).toBe('${N4_S3_SECRET_KEY:-}');
    expect(test.depends_on['storage-init'].condition).toBe('service_completed_successfully');
    expect(test.networks).toEqual(['private']);
  });

  it('starts local storage only in explicit profiles with runtime secret checks', () => {
    for (const name of ['storage', 'storage-init']) {
      expect(compose.services[name].profiles).toEqual(['test', 'local-storage']);
      expect(compose.services[name].command.join('\n')).toContain(':?');
      expect(compose.services[name].ports).toBeUndefined();
    }
    expect(compose.services.storage.environment.MINIO_ROOT_USER).toBe('${N4_STORAGE_ROOT_USER:-}');
    expect(compose.services.storage.environment.MINIO_ROOT_PASSWORD).toBe('${N4_STORAGE_ROOT_PASSWORD:-}');
  });
});
