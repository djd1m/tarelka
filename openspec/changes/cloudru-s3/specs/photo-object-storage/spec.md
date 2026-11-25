## ADDED Requirements

### Requirement: Explicit S3 configuration

API и recognizer SHALL принимать endpoint, region, bucket, access key, secret key
и forcePathStyle через проверяемую конфигурацию окружения.

#### Scenario: Cloud.ru configuration is valid

- **GIVEN** заданы HTTPS endpoint Cloud.ru, регион, бакет и ключи
- **WHEN** запускаются API и recognizer
- **THEN** оба сервиса используют указанное S3-хранилище

#### Scenario: Required setting is invalid

- **GIVEN** обязательный параметр отсутствует, пуст или имеет некорректный формат
- **WHEN** сервис загружает конфигурацию
- **THEN** запуск завершается с названием ошибочного параметра

### Requirement: Photo operations preserve content

Хранилище SHALL поддерживать загрузку оригинала, чтение, запись нормализованной копии,
проверку существования и ограниченный по времени подписанный GET.

#### Scenario: Photo is processed and displayed

- **GIVEN** пользователь загрузил допустимое фото
- **WHEN** recognizer читает оригинал и сохраняет нормализованную копию
- **THEN** байты доступны через существующий маршрут фото с проверкой владения
- **AND** объект сохраняет корректный Content-Type

### Requirement: Deletion errors remain observable

Хранилище SHALL считать отсутствие удаляемого объекта успехом и передавать ошибки
доступа и транспорта логике повторов удаления аккаунта и очистки по сроку.

#### Scenario: Storage refuses deletion

- **GIVEN** S3 отклоняет удаление объекта
- **WHEN** выполняется удаление данных аккаунта или очистка фото по сроку
- **THEN** обработчик получает ошибку и может повторить операцию

#### Scenario: Object has already been deleted

- **GIVEN** объекта нет в бакете
- **WHEN** повторяется удаление
- **THEN** удаление завершается успешно

#### Scenario: Bucket retains old object versions

- **GIVEN** GetBucketVersioning возвращает Enabled или Suspended либо недоступен
- **WHEN** приложение пытается удалить фотографию
- **THEN** операция сообщает ошибку и физическое удаление не считается подтверждённым

#### Scenario: Rollback cleanup is unavailable

- **GIVEN** попытка создания скана откатывается и удаление загруженного объекта недоступно
- **WHEN** API обрабатывает повтор, исчерпанную квоту или ошибку БД
- **THEN** API сохраняет соответствующий ответ 202, 429 или 503 и журналирует отказ cleanup

### Requirement: Orphan listing covers every page

Уборщик SHALL обходить все страницы ListObjectsV2 выбранного бакета.

#### Scenario: Bucket listing spans multiple pages

- **GIVEN** первая страница содержит continuation token
- **WHEN** уборщик запрашивает список объектов
- **THEN** обработка продолжается со следующей страницей
- **AND** объекты всех страниц передаются существующей логике проверки осиротевших объектов

### Requirement: Production and local storage can be configured independently

Compose SHALL поддерживать внешний бакет Cloud.ru для приложения
и локальный MinIO для изолированных интеграционных тестов.

#### Scenario: Application uses Cloud.ru

- **GIVEN** заданы параметры Cloud.ru S3
- **WHEN** разрешается конфигурация приложения
- **THEN** административные реквизиты MinIO для приложения не требуются

### Requirement: Existing object keys survive migration

Инструкция переноса SHALL сохранять ключи объектов из PostgreSQL и требовать
проверку содержимого перед переключением приложения.

#### Scenario: Existing photo is copied to Cloud.ru

- **GIVEN** в PostgreSQL записаны object_key и normalized_object_key
- **WHEN** оператор переносит фотографии в целевой бакет
- **THEN** объекты имеют исходные ключи и проверенные байты
