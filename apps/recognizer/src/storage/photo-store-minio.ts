// Имя фабрики сохраняет совместимость с существующими вызовами PhotoStorePort.
import { createPhotoS3Client, deletePhotoS3Object, type StorageConfig } from '@n4/shared';
import type { PhotoStorePort } from '../consent/erasure-job.js';

export interface MinioPhotoStoreOptions {
  readonly storage: StorageConfig;
}

export function createMinioPhotoStore(options: MinioPhotoStoreOptions): PhotoStorePort {
  const client = createPhotoS3Client(options.storage);
  return {
    async purgeObject(objectKey: string): Promise<void> {
      await deletePhotoS3Object(client, options.storage.bucket, objectKey);
    },
  };
}
