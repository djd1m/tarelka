# Исследование S3 Cloud.ru

## Проверенные источники

- clipmkr d35c15bdbf3f01e4188d4a7494f06bc021b38906, packages/s3/src/client.ts
  и .env.example. AWS SDK, явный регион, forcePathStyle, requestChecksumCalculation
  и responseChecksumValidation со значением WHEN_REQUIRED, maxAttempts 3.
- tarelka, apps/api/src/photo/store-original.ts, bootstrap.ts,
  apps/recognizer/src/photo/storage.ts и storage/photo-store-minio.ts.
  Четыре клиента MinIO конструируются независимо. Регион и адресация не задаются.
- tarelka, photo/purge-expired.ts и consent/erasure-job.ts.
  Успех удаления требуется до фиксации purged. Адаптер обязан передавать ошибки.
- tarelka, routes/scans-photo.ts и routes/share-card-internal.ts.
  Сервер читает подписанные ссылки. Публичный endpoint для браузерных загрузок здесь
  не является зависимостью интеграции.

## Решение для повторного использования

Переиспользовать существующие интерфейсы PhotoStorage, RecognizerStorage, PhotoStorePort
и StorageObjectLister. Создание S3Client вынести в общий пакет с настройками из clipmkr.
Команды AWS SDK выполняются адаптерами сервисов. Листинг использует paginator SDK.
Существующие ключи объектов и записи PostgreSQL продолжают адресовать те же файлы.

## Различия жизненного цикла

Cloud.ru бакет готовится оператором. Runtime-клиент проверяет доступность бакета,
создание разрешено тестовой оснастке MinIO. Тестовый Compose использует собственные
реквизиты N4_S3_* и никогда не получает production S3_ACCESS_KEY/S3_SECRET_KEY.

## Проверки

Тесты HTTP-транспорта проверят фактические запросы SDK, SigV4 region, адресацию,
байты, Content-Type, подпись URL, отказ доступа и многостраничный список.
Существующие unit и integration сохраняют проверки владения и повторов удаления.
Живой Cloud.ru smoke зависит от реквизитов владельца.
