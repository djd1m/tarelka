import { paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { createPhotoS3Client, deletePhotoS3Object, type StorageConfig } from '@n4/shared';
import type { StorageObjectLister } from './purge-orphans.js';

export function createPhotoObjectLister(config: StorageConfig): StorageObjectLister {
  const client = createPhotoS3Client(config);
  return {
    async *listObjects(prefix) {
      const pages = paginateListObjectsV2({ client }, { Bucket: config.bucket, Prefix: prefix });
      const seenTokens = new Set<string>();
      for await (const page of pages) {
        if (page.IsTruncated && (!page.NextContinuationToken || seenTokens.has(page.NextContinuationToken))) {
          throw new Error('S3 вернул некорректный токен продолжения списка объектов');
        }
        if (page.NextContinuationToken) seenTokens.add(page.NextContinuationToken);
        for (const item of page.Contents ?? []) {
          if (item.Key === undefined || item.LastModified === undefined || !Number.isFinite(item.LastModified.getTime())) {
            throw new Error('S3 вернул объект без ключа или даты изменения');
          }
          yield { key: item.Key, lastModified: item.LastModified };
        }
      }
    },
    async removeObject(key) {
      await deletePhotoS3Object(client, config.bucket, key);
    },
  };
}
