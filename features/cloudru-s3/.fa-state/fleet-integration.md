# Fleet integration assessment — Cloud.ru S3

Readiness: **COMPLETE** for the requested working-copy implementation and the integration checks available in this environment. No blocking integration defect found. This is not a production cutover or a claim of successful Cloud.ru/PostgreSQL/MinIO deployment.

Independent review on 2026-11-25. Only this assessment was written; no product files were edited.

## Actual consumers and contract

| Consumer | Reviewed integration |
| --- | --- |
| API upload and share-card writes | `createPhotoStorage` uses the shared factory for PUT with existing object keys, bytes and MIME. `POST /scans` writes before the database transaction and attempts cleanup after rollback/release. Cleanup failure is logged without replacing replay/quota/database responses. Share-card JPEG writes use the same adapter. |
| Recognition | Bootstrap constructs `createRecognizerStorage(config.storage)` and passes it to normalization and the model image fetcher. Original reads consume `GetObject` streams as bytes; normalized writes retain `image/jpeg` and the existing `.normalized.jpg` key convention. |
| Expiry and account erasure | Recognizer bootstrap still calls the compatibility-named `createMinioPhotoStore`, now an AWS S3 adapter. Both daily expiry and hourly erasure reach `deletePhotoS3Object`; failure propagates and the existing jobs mark photos purged only after deletion succeeds. |
| Orphan cleanup | API bootstrap constructs `createPhotoObjectLister(config.storage)` for its hourly job. ListObjectsV2 pagination forwards prefix/tokens to the existing orphan policy. Missing/repeated/cyclic continuation and malformed entries fail. Existing policy checks photo-key form, age, original/normalized database references and share-card references before deletion. |
| Photo and card GET paths | `presignedGetUrl` uses the shared client and caller TTL. Scan photos remain behind the owner-checked same-origin route. Rendering fetches the signed original URL; public-card image delivery rechecks revocation then fetches a signed card URL internally. No new browser-facing storage credentials or direct private-photo URL was introduced. |

Every delete adapter checks `GetBucketVersioning` immediately before `DeleteObject`. Enabled, Suspended or unreadable status prevents DELETE. Missing objects remain an idempotent successful DELETE; forbidden DELETE remains a failure. The deployed bucket therefore needs GetBucketVersioning permission and never-enabled versioning; the runbook states these constraints. This check is not atomic against an external administrator changing versioning concurrently.

`ensureBucket` now performs HEAD only and does not create a production bucket. Source search found no runtime startup caller of `ensureBucket`; startup validates configuration shape, not bucket reachability/permissions. This matches the prepared-bucket deployment procedure, but successful process startup alone is not evidence that storage works.

## Package-root and transport compatibility

The public `@n4/shared` root exports both S3 functions. An independent Node **v22.23.5** ESM import resolved the actual package `exports`/compiled `dist/index.js`, without Vitest's source alias. Both functions were callable. Actual compiled API and recognizer bootstrap entrypoints also resolved their imports and exited with the expected named S3 configuration errors under an empty fixture environment, before opening a database connection. These checks do not establish full running-service health.

The actual root factory produced `NodeHttpHandler` with `connectionTimeout=2000`, `requestTimeout=15000`, `throwOnRequestTimeout=true`, `maxAttempts=3`, and request/response checksum modes `WHEN_REQUIRED`. An additional real HTTP fixture through the compiled package root returned 503 three times; exactly three requests were observed, SDK `$metadata.attempts` was 3, and the final error propagated.

Transport limits have precise boundaries: the 15-second timer applies per HTTP attempt and is cleared by the installed Smithy handler on response resolution, so it is not a deadline for consuming the entire GET body. There is no explicit `socketTimeout` or operation-wide deadline. Retries/backoff can extend total operation duration. Presigned GETs in scan-photo proxying, card rendering and card-image proxying use global `fetch`, outside the SDK retry/checksum/timeout settings, and specify no application AbortSignal. This is existing caller behavior, not a newly demonstrated whole-request timeout guarantee.

## Manifest, environment and dependency packaging

AWS SDK `3.1137.0` is pinned consistently: shared owns client-s3; API owns client-s3 and the presigner; recognizer owns client-s3. Root `minio@8.0.6` is a development dependency for existing real-MinIO test helpers; the lock marks it dev-only. Runtime adapters do not import it. The unchanged Dockerfile installs from all workspace manifests/root lock, builds shared before applications, and copies node_modules plus built packages into the API/recognizer images. Current images still copy development dependencies; moving MinIO to devDependencies is dependency ownership/isolation, not proof that the image omits MinIO bytes.

Independent Compose resolution used the actual `/tmp/tarelka-tools/docker-compose` binary, `--env-file /dev/null`, and synthetic fixture values only:

- `app` with external S3 settings and no MinIO admin/user credentials: passed; services were db/api/recognizer/web, with no storage service.
- `test` with local credentials and no external S3 settings: passed; test endpoint remained `http://storage:9000`, region `us-east-1`, path-style true, with local credentials.
- Mixed app/edge/test profiles with both sets: passed; test continued using local S3 credentials and endpoint.
- `check-env-wiring.sh` against the actual resolved mixed-profile YAML: exit 0 for API, recognizer and web.

API and recognizer receive all six S3 variables, have egress access, and depend only on DB. Web receives no S3 credentials. Local storage/init are explicit test/local-storage profiles without published ports; root credentials are checked inside local startup commands rather than required during production Compose interpolation. Storage-init provisions the local bucket/user/policy before test execution. Local app use requires the documented separate local-storage startup and S3_* override; enabling app alone does not start MinIO.

## Independently executed checks

Node 22 was selected with `PATH=/root/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH`.

- `npm test -- tests/unit/s3-storage.test.ts tests/unit/s3-compose.test.ts tests/unit/scans-cleanup.test.ts tests/unit/config.test.ts` — **4 files, 70 tests passed**.
- `npm run test:integration -- tests/integration/check-env-wiring.test.ts tests/integration/provider-adapter.test.ts` — **2 files, 17 tests passed**.
- Actual compiled shared-root import/handler configuration, compiled API/recognizer configuration-refusal probes, three-attempt real HTTP error propagation, three Compose resolutions and resolved-YAML env guard — passed as described above.

The 11 S3 adapter cases use real AWS SDK HTTP serialization/signing against an in-process HTTP fixture. They cover byte/MIME preservation, regional signing and tenant:key access-key syntax, 900-second signed GET consumption, virtual-host URL generation, no optional upload checksum/chunk encoding, HEAD 404 versus authorization/transport failure, safe versioning deletion across all adapters, failed DELETE propagation, second-page orphan processing and malformed pagination. The fixture does **not** validate signatures, IAM/private-bucket policy, TLS, Cloud.ru server compatibility or durable object storage. Virtual-host Cloud.ru coverage generates URLs without contacting Cloud.ru.

The 17 selected integration-config tests exercise env wiring and provider/config selection without PostgreSQL or MinIO. They are not the full storage/database integration suite. Existing real-service tests for scan routes, erasure, expiry, ownership and orphan cleanup were inspected but not run: this environment has no Docker engine/socket. Cloud.ru keys are absent, so no live PUT/GET/HEAD/signed GET/DELETE, anonymous access-denial test, migration or cutover was performed. Docker image builds and full service boot were not performed by this assessment. Those operational checks remain prerequisites for deployment and are explicitly documented, not hidden behind the COMPLETE code-delivery status.
