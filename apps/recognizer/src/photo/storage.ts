// Клиент приватного бакета со стороны `recognizer`: чтение оригинала, запись нормализованной
// копии (FR-scan-pipeline-5). Соединение с базой на время этих операций НЕ удерживается —
// аренда закрывает транзакцию ДО первого обращения к хранилищу (`lease.ts`).

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPhotoS3Client, type StorageConfig } from '@n4/shared';

export interface RecognizerStorage {
  getObject(objectKey: string): Promise<Buffer>;
  putNormalized(objectKey: string, buffer: Buffer): Promise<void>;
}

export function createRecognizerStorage(config: StorageConfig): RecognizerStorage {
  const client = createPhotoS3Client(config);
  const bucket = config.bucket;

  return {
    async getObject(objectKey) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      if (response.Body === undefined) throw new Error('S3 не вернул тело фотографии');
      return Buffer.from(await response.Body.transformToByteArray());
    },
    async putNormalized(objectKey, buffer) {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: objectKey, Body: buffer, ContentType: 'image/jpeg',
      }));
    },
  };
}

export function normalizedObjectKeyFor(objectKey: string): string {
  const dot = objectKey.lastIndexOf('.');
  const base = dot === -1 ? objectKey : objectKey.slice(0, dot);
  return `${base}.normalized.jpg`;
}
