// ЕДИНСТВЕННОЕ место, где сервис `recognizer` читает `process.env` (FR-foundation-2).
// Причина та же, что в `apps/api/src/env.ts`: страж проброса переменных сверяет чтения
// ИСХОДНИКОВ СЕРВИСА с блоком `environment:` ЭТОГО сервиса.

import {
  attempt,
  collectConfig,
  MODEL_PROVIDERS,
  optionalText,
  requireEnum,
  requirePositiveInt,
  requireText,
  requireS3Endpoint,
  requireBoolean,
  ConfigError,
  type RecognizerConfig,
} from '@n4/shared';

/** Источник значений. По умолчанию — окружение процесса; тест подставляет своё. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadRecognizerConfig(env: EnvSource = process.env): RecognizerConfig {
  return collectConfig<RecognizerConfig>((fail) => {
    const modelProvider = attempt(
      fail,
      () =>
        requireEnum(
          'N4_MODEL_PROVIDER',
          env.N4_MODEL_PROVIDER,
          MODEL_PROVIDERS,
          'нераспознанное значение означало бы молчаливый откат к дешёвой реализации там, где ждали живого вызова, — или наоборот, платный вызов там, где ждали фейк',
        ),
      'fake' as const,
    );

    const anthropicApiKey = optionalText(env.ANTHROPIC_API_KEY);
    // Условие зависит от РЕЖИМА, поэтому проверяет код, а не compose (DEC-A-009).
    // При `fake` пустой ключ законен; при `live` он валит старт.
    if (modelProvider === 'live' && anthropicApiKey === undefined) {
      fail(
        new ConfigError(
          'ANTHROPIC_API_KEY',
          env.ANTHROPIC_API_KEY === undefined ? 'missing' : 'empty',
          'при N4_MODEL_PROVIDER=live каждый разбор кадра — платный вызов наружу, и без ключа он невыполним',
        ),
      );
    }

    const openrouterApiKey = optionalText(env.OPENROUTER_API_KEY);
    // Та же форма, что у ANTHROPIC_API_KEY выше: условие зависит от РЕЖИМА (DEC-A-045/046).
    // При `fake`/`live` пустой ключ OpenRouter законен; при `openrouter` он валит старт —
    // тем же сообщением про платный вызов, что у `live`, а не отдельной формулировкой.
    if (modelProvider === 'openrouter' && openrouterApiKey === undefined) {
      fail(
        new ConfigError(
          'OPENROUTER_API_KEY',
          env.OPENROUTER_API_KEY === undefined ? 'missing' : 'empty',
          'при N4_MODEL_PROVIDER=openrouter каждый разбор кадра — платный вызов наружу, и без ключа он невыполним',
        ),
      );
    }

    return {
      databaseUrl: attempt(
        fail,
        () => requireText('DATABASE_URL', env.DATABASE_URL, 'без строки подключения воркер не возьмёт ни одного задания'),
        '',
      ),
      storage: {
        region: attempt(fail, () => {
          const region = requireText('S3_REGION', env.S3_REGION, 'регион бакета нужен для подписи S3');
          if (!/^[a-z0-9][a-z0-9-]*$/.test(region)) throw new ConfigError('S3_REGION', 'invalid', 'регион S3 содержит недопустимые символы');
          return region;
        }, ''),
        forcePathStyle: attempt(fail, () => requireBoolean('S3_FORCE_PATH_STYLE', env.S3_FORCE_PATH_STYLE, 'способ адресации бакета должен быть задан явно'), true),
        endpoint: attempt(fail, () => requireS3Endpoint(env.S3_ENDPOINT), ''),
        bucket: attempt(fail, () => requireText('S3_BUCKET', env.S3_BUCKET, 'без имени бакета кадр нечем прочитать'), ''),
        accessKey: attempt(fail, () => requireText('S3_ACCESS_KEY', env.S3_ACCESS_KEY, 'отсутствующий секрет доступа к бакету — отказ, а не анонимный доступ'), ''),
        secretKey: attempt(fail, () => requireText('S3_SECRET_KEY', env.S3_SECRET_KEY, 'отсутствующий секрет доступа к бакету — отказ, а не анонимный доступ'), ''),
      },
      quota: {
        scanLimitUser: attempt(
          fail,
          () => requirePositiveInt('N4_SCAN_LIMIT_USER', env.N4_SCAN_LIMIT_USER, 'незаданный личный потолок означал бы неограниченные платные вызовы от одного посетителя'),
          0,
        ),
        scanLimitDay: attempt(
          fail,
          () => requirePositiveInt('N4_SCAN_LIMIT_DAY', env.N4_SCAN_LIMIT_DAY, 'незаданный суточный потолок означал бы счёт без верхней границы'),
          0,
        ),
        escalationLimitDay: attempt(
          fail,
          () => requirePositiveInt('N4_ESCALATION_LIMIT_DAY', env.N4_ESCALATION_LIMIT_DAY, 'незаданный потолок эскалаций означал бы, что дорогая модель ограничена только общим потолком'),
          0,
        ),
      },
      modelProvider,
      anthropicApiKey,
      openrouterApiKey,
    };
  });
}

export const RECOGNIZER_REQUIRED_VARIABLES: readonly string[] = [
  'DATABASE_URL',
  'S3_REGION',
  'S3_FORCE_PATH_STYLE',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'N4_SCAN_LIMIT_USER',
  'N4_SCAN_LIMIT_DAY',
  'N4_ESCALATION_LIMIT_DAY',
  'N4_MODEL_PROVIDER',
];
