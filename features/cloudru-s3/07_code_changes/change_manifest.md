# Изменения Cloud.ru S3

## Runtime

packages/shared содержит фабрику AWS S3, проверку versioning перед DELETE,
поля StorageConfig и валидаторы endpoint/boolean.
API и recognizer читают шесть S3_* параметров и используют общую фабрику.
Листинг API вынесен в проверяемый адаптер с пагинацией.
POST /scans сохраняет ответы при сбое cleanup и журналирует отказ.

## Конфигурация

В манифестах закреплены AWS SDK 3.1137.0. MinIO SDK перемещён в devDependencies
для существующих integration fixtures. yaml используется для проверки Compose.
Основной Compose подключает внешний S3, MinIO включается test/local-storage.
.env.example содержит Cloud.ru параметры и обязательные настройки подписки.

## Проверки и документация

Добавлены s3-storage, scans-cleanup и s3-compose unit-тесты.
Обновлены конфигурационные тесты, env-wiring и shared test fixtures.
Инструкция cloudru-s3.md описывает настройку, перенос с проверкой байтов и откат.
README и REPRODUCE ссылаются на актуальную настройку.
OpenSpec хранит изменение cloudru-s3.
