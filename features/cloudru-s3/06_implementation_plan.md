# План подключения Cloud.ru S3

Inputs read: 00_complexity_assessment.md, 01_requirements.md, 02_research.md, 03_adr/, 03.5_ideation_report.md, 04_domain_model.md, 05_architecture.md, .fa-state/review-convergence-ideation-host.json, openspec/changes/cloudru-s3/.

## Целевое состояние

Четыре клиента MinIO создаются раздельно. PostgreSQL хранит ключи оригиналов, нормализованных изображений и карточек. Цель — единая подпись к приватному подготовленному бакету, доступ к прежним ключам, повтор удаления при сбое и побайтовая сверка перед переключением. Исходный npm test охватил 75 файлов, 548 тестов прошли, один пропущен. Процент покрытия исходного дерева не измерялся.

## Задачи

- **TASK-1. Настроить общую фабрику и контракты** (ADR-001, FR-1, FR-3, NFR-2). В packages/shared/src/config/{env,types}.ts добавить обязательные region/forcePathStyle, requireS3Endpoint (HTTP(S) origin без userinfo, пути, query или fragment) и requireBoolean (строго true/false). В packages/shared/src/storage/photo-s3-client.ts создать createPhotoS3Client с явными credentials, region, endpoint, forcePathStyle, checksum WHEN_REQUIRED в обоих направлениях, maxAttempts 3, connectionTimeout 2000 мс и действующим requestTimeout 15000 мс. deletePhotoS3Object перед каждым DeleteObject выполняет GetBucketVersioning и разрешает удаление только при успешном ответе без Status. Ошибки чтения/удаления пробрасываются. Экспортировать через packages/shared/src/index.ts. В манифестах shared/api/recognizer закрепить client-s3 3.1137.0, в api также s3-request-presigner 3.1137.0. Перенести minio 8.0.6 из runtime в корневые devDependencies, добавить туда yaml 2.8.2 и обновить package-lock.json средствами npm. Критерий — сборка shared и проверки транспорта TASK-6.
- **TASK-2. Валидировать окружение и обновить фикстуры** (ADR-001, FR-1, NFR-3). В apps/{api,recognizer}/src/env.ts читать все шесть S3_* явно, обновить required-списки, проверять формат региона SigV4 и возвращать общую ошибку до открытия сокета. Исправить типы и значения в tests/helpers/{config,scan-config,minio}.ts и tests/integration/provider-adapter.test.ts. В tests/unit/config.test.ts проверить оба загрузчика, Cloud.ru и локальный endpoint, каждую отсутствующую/пустую настройку и ошибочные endpoint/region/boolean, исключить вывод секретов. В tests/integration/check-env-wiring.test.ts подтвердить переменные обоих сервисов.
- **TASK-3. Подключить API и пагинацию уборки** (ADR-001, ADR-002, FR-2, FR-3, FR-4, NFR-1). В apps/api/src/photo/store-original.ts сохранить PhotoStorage, ключи и MIME, реализовать PutObject, HeadBucket в ensureBucket (только проверка существующего бакета), HeadObject в exists (false только при 404), подписанный GetObject с TTL вызывающего и удаление через общий guard. В apps/api/src/photo/storage-object-lister.ts реализовать createPhotoObjectLister с прежним StorageObjectLister и paginateListObjectsV2. Передавать Bucket и Prefix, выдавать key/lastModified, сигнализировать ошибку при сбое страницы, усечённой странице без следующего токена, повторном токене и некорректных Key/LastModified. Через apps/api/src/bootstrap.ts подключить фабрику в существующий уборщик с его проверками владельцев ключей. Критерий — контрольный старый ключ со второй страницы дошёл до существующего purgeOrphanObjects.
- **TASK-4. Перевести recognizer и erasure/expiry на общий клиент** (ADR-001, FR-2, FR-3, NFR-1). В apps/recognizer/src/photo/storage.ts читать GetObject до полного Buffer и писать JPEG прежним normalized key. В apps/recognizer/src/storage/photo-store-minio.ts сохранить фабрику createMinioPhotoStore и порт PhotoStorePort, использовать deletePhotoS3Object. Критерий — совпадают байты оригинала, нормализованная копия имеет image/jpeg, ошибка удаления доходит до вызывающего до purged/erased.
- **TASK-5. Сохранить ответы отката POST /scans** (ADR-001, FR-3). В apps/api/src/routes/scans.ts перехватить и записать отказ удаления собственного ключа откатанной попытки в трёх ветвях. В tests/unit/scans-cleanup.test.ts выполнить настоящий маршрут с валидной загрузкой и транзакцией через контролируемый DbPool. Для повтора, отказа квоты и ошибки БД проверить ROLLBACK, попытку удалить именно новый ключ, запись об отказе и неизменные тела/статусы 202 с прежним scan_id/status, 429 quota_exhausted и 503 dependency_unavailable.
- **TASK-6. Проверить фактические запросы SDK** (ADR-001, ADR-002, FR-2, FR-3, FR-4, NFR-1, NFR-2, NFR-4). В tests/unit/s3-storage.test.ts поднять локальный HTTP fixture, использовать production-фабрики. Проверить API PUT → recognizer GET, JPEG PUT → GET, байты и Content-Type, загрузку по подписанному GET и TTL, SigV4 region, virtual-host URL без внешнего DNS, path-style, checksum и настройки попыток. HeadBucket не создаёт бакет при 404/403, HEAD различает 404, 403 и разрыв сети. Через API и recognizer проверить удаление и повтор отсутствующего ключа, ошибки DELETE, отсутствие DELETE при Enabled, Suspended и ошибке GetBucketVersioning. Менять состояние между вызовами и считать проверки. Отдать листеру две страницы с непустой второй и проверить Prefix, continuation token, визит уборщика, ошибку второй страницы, отсутствующий/повторный токен и некорректную запись. Критерий — всё воспроизводится локально с временными ключами.
- **TASK-7. Изолировать MinIO в Compose** (ADR-002, FR-5, FR-6, NFR-3, NFR-4). В docker-compose.yml и .env.example задать шесть production S3_*, пример Cloud.ru с незаполненными секретами. API/recognizer разрешают пустую интерполяцию Compose, значения проверяет TASK-2 при старте. Из инфраструктуры storage убрать зависимости приложения, сохранить БД и egress. Профили storage/storage-init ровно test и local-storage, обязательность N4_STORAGE_ROOT_* и N4_S3_* проверяется при запуске локальных сервисов. Test жёстко использует http://storage:9000, us-east-1, path-style true и отдельные N4_S3_* значения, сохраняет зависимость от локального provisioner. Политика MinIO даёт GetBucketVersioning. В tests/unit/s3-compose.test.ts проверить состав профилей, зависимости и изоляцию секретов разбором YAML. Реальным Compose независимо от daemon отрендерить app без локальных настроек, test без production-настроек и test при одновременно заданных значениях-маркерах. Критерий — в test попадают только локальные параметры, web не получает ключей.
- **TASK-8. Описать подключение, перенос и откат** (ADR-002, FR-6, NFR-1, NFR-3, NFR-4). В docs/operations/cloudru-s3.md описать отдельный приватный бакет без истории версионирования, IAM ListBucket/GetBucketVersioning на бакете и Get/Put/DeleteObject на объектах. Указать TLS, недоступность анонимного GET, защищённое хранение секретов. Скопировать по инструкции оригиналы, нормализованные файлы и карточки с прежними ключами/Content-Type, сверить перечень и байты либо их дайджест. На финальное окно остановить запись, обработчики удаления и уборщики, учесть удаления во время копирования, сверить актуальный источник и удалить подтверждённые лишние целевые копии перед переключением обоих процессов. Проверить прежние фото и карточки, выполнить smoke только с синтетическим фото. Для отката учесть записи и удаления после переключения, выполнить обратную сверку и ограничить срок хранения защищённого источника. README.md и docs/REPRODUCE.md должны различать рабочий Cloud.ru и локальный test. Критерий — процедура переносит прежние ключи и объясняет восстановление без потери новых объектов или восстановления удалённых данных.
- **TASK-9. Проверить поставку и сверить OpenSpec** (FR-7, FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, NFR-1, NFR-2, NFR-3, NFR-4). Сопоставить proposal, design, specs и tasks в openspec/changes/cloudru-s3 с результатами и отметить подтверждённые пункты tasks.md. Выполнить openspec validate cloudru-s3 --strict, npm test, npm run typecheck, npm run lint, сборки workspace и тесты env wiring. Проверить существующие сценарии владения, карточек, орфанов, expiry, erasure и интеграционный профиль PostgreSQL/MinIO с Docker daemon при его наличии. Зафиксировать независимое review и fleet QE, отдельный статус живого smoke и конкретные ограничения каждой проверки.

## Порядок зависимостей и параллельные группы

| Группа | Исполнители и задачи | Условие выхода |
|---|---|---|
| 1 · спецификация и архитектура | Инженер общего пакета TASK-1; инженер инфраструктуры TASK-7; инженер API TASK-5; автор runbook TASK-8. Только TASK-1 редактирует манифесты и lock. | Собран shared, определены имена переменных и тестовые конфигурации, проверены ответы отката. |
| 2 · реализация | После TASK-1 отдельные исполнители TASK-2 (конфигурация), TASK-3 (API), TASK-4 (recognizer). | Порты собраны, endpoint и ключи старых фотографий проходят через фактические входы сервисов. |
| 3 · проверка транспорта | Исполнитель транспортных тестов TASK-6 после TASK-2/3/4. | Новые тесты ловят ошибку второй страницы и запрет на физическое удаление. |
| 4 · приёмка | Независимые проверяющие TASK-9 после TASK-5/6/7/8. | Протокол проверок, результаты OpenSpec и решение QE. |

Трудоёмкость групп для планирования — примерно 35, 25, 25 и 20 минут активной работы при параллельном исполнении. Срок проверки на внешнем бакете определяется доступом владельца.

## Контрольные точки и риски

- До реализации K1 проверен на временной проекции реальных каталогов исходников через symlink. Штатный сканер ожидает packages/@dzhechkov и в монорепозитории напрямую возвращает exit 2. Проверенные имена и путь storage-object-lister свободны. K2 читает этот план из рабочей копии.
- После группы 1 проверить Compose standalone v2.39.4 (рендер без daemon) и package lock. После группы 2 сверить ключи, MIME, ownership и серверные маршруты. После группы 3 выполнить регрессии обеих поправок QCSD. Gate ideation закрыт с unresolved=[]; это результат проверки проекта, выполнение проверяют на этапе QE.
- Node 22 необходим для сборок. Отсутствие Docker daemon ограничивает интеграцию, при этом разбор Compose и реальные локальные HTTP-запросы SDK доступны. Для живого smoke требуются предоставленные владельцем реквизиты отдельного бакета. Перенос пользовательских данных и переключение работающих процессов выполняет оператор отдельно.

## Amendments

- AM-1 (QCS-Q-001). При отказе cleanup маршрут сохраняет каждый исходный ответ → test `preserves replay, quota and database responses when rollback cleanup fails` in `tests/unit/scans-cleanup.test.ts`
- AM-2 (RISK-001). Удаление требует актуального подтверждения отсутствия версионирования → test `checks versioning before every delete and refuses unsafe or unreadable status` in `tests/unit/s3-storage.test.ts`

EXPECTED_CODE_TARGETS:
- packages/shared/src/config/env.ts
- packages/shared/src/config/types.ts
- packages/shared/src/index.ts
- packages/shared/src/storage/photo-s3-client.ts
- packages/shared/package.json
- apps/api/package.json
- apps/recognizer/package.json
- package.json
- package-lock.json
- apps/api/src/env.ts
- apps/api/src/bootstrap.ts
- apps/api/src/photo/store-original.ts
- apps/api/src/photo/storage-object-lister.ts
- apps/api/src/routes/scans.ts
- apps/recognizer/src/env.ts
- apps/recognizer/src/photo/storage.ts
- apps/recognizer/src/storage/photo-store-minio.ts
- docker-compose.yml
- .env.example
- README.md
- docs/operations/cloudru-s3.md
- docs/REPRODUCE.md
- tests/unit/config.test.ts
- tests/unit/s3-storage.test.ts
- tests/unit/scans-cleanup.test.ts
- tests/unit/s3-compose.test.ts
- tests/integration/check-env-wiring.test.ts
- tests/integration/provider-adapter.test.ts
- tests/helpers/config.ts
- tests/helpers/scan-config.ts
- tests/helpers/minio.ts
- apps/api/src/photo/purge-orphans.ts
- apps/recognizer/src/photo/purge-expired.ts
- apps/recognizer/src/consent/erasure-job.ts
- apps/recognizer/src/bootstrap.ts
- apps/api/src/routes/scans-photo.ts
- apps/api/src/routes/share-card-internal.ts
- apps/api/src/share/render-card-image.ts
- apps/api/src/server.ts
- packages/db/src/pool.ts
