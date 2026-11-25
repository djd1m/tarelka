import { DeleteObjectCommand, GetBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../config/types.js';

/** Настройки совместимости Cloud.ru взяты из clipmkr/packages/s3/src/client.ts. */
export function createPhotoS3Client(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 15_000, throwOnRequestTimeout: true },
  });
}

/** Delete markers сохраняют старые версии. Проверяем состояние перед каждым удалением. */
export async function deletePhotoS3Object(client: S3Client, bucket: string, key: string): Promise<void> {
  const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (versioning.Status !== undefined) {
    throw new Error('Для удаления фотографий требуется бакет с никогда не включавшимся версионированием');
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
