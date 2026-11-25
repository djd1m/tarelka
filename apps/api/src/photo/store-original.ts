// Хранилище оригинала (FR-scan-pipeline-14/19). Загрузка ДО любой транзакции БД; ключ по
// `device_session_id + '/' + recognition_id + '.' + ext` (PC2-01) — НЕ по хешу содержимого:
// два разных запроса с одинаковым фото и разными `Idempotency-Key` не должны делить объект.

import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPhotoS3Client, deletePhotoS3Object, type StorageConfig } from '@n4/shared';

const EXT_BY_SIGNATURE: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic' };
const MIME_BY_SIGNATURE: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function extensionFor(signature: string): string {
  return EXT_BY_SIGNATURE[signature] ?? 'bin';
}

export function mimeFor(signature: string): string {
  return MIME_BY_SIGNATURE[signature] ?? 'application/octet-stream';
}

export function objectKeyFor(deviceSessionId: string, recognitionId: string, signature: string): string {
  return `${deviceSessionId}/${recognitionId}.${extensionFor(signature)}`;
}

export interface PhotoStorage {
  ensureBucket(): Promise<void>;
  putOriginal(objectKey: string, buffer: Uint8Array, contentType: string): Promise<void>;
  removeObject(objectKey: string): Promise<void>;
  /** Существование объекта — используется уборкой орфанов (шаг 12) и тестами. */
  exists(objectKey: string): Promise<boolean>;
  /**
   * Presigned GET-URL (ADR-010) — ДОБАВЛЕНО фичей `share-card-and-growth-events`: до неё
   * ни один маршрут не минтил presigned-ссылку (фото читал только владелец через отдельный
   * приватный путь). `RenderCardImage` (шаг 4, чтение оригинала фото владельца) и
   * `RenderPublicCardPage` (минтинг ссылки на саму карточку) — оба потребителя.
   * `ttlSeconds` — литерал ВЫЗЫВАЮЩЕГО (15 минут и там, и там, ADR-010), не настройка этого
   * модуля.
   */
  presignedGetUrl(objectKey: string, ttlSeconds: number): Promise<string>;
}

export function createPhotoStorage(config: StorageConfig): PhotoStorage {
  const client = createPhotoS3Client(config);
  const bucket = config.bucket;

  return {
    async ensureBucket() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    async putOriginal(objectKey, buffer, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: objectKey, Body: buffer, ContentType: contentType,
      }));
    },
    async removeObject(objectKey) {
      await deletePhotoS3Object(client, bucket, objectKey);
    },
    async exists(objectKey) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
        return true;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
        throw error;
      }
    },
    async presignedGetUrl(objectKey, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: ttlSeconds });
    },
  };
}
