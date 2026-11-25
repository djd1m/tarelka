# Independent fleet regression / coverage review

Verdict: **COMPLETE for local code delivery**. No blocking regression finding in the reviewed change. This is not certification of a deployed Cloud.ru integration or completion of data migration.

Reviewed requirements, ADR-001/002, implementation plan, QE report, tracked source/configuration/test diff and new storage/test files. Followed the existing callers through server/bootstrap, scan/photo and card routes, recognizer normalization, expiry, erasure and orphan cleanup. No code changes made by this review.

## Independent checks

- Node 22 targeted run: `npm test -- tests/unit/s3-storage.test.ts tests/unit/scans-cleanup.test.ts tests/unit/s3-compose.test.ts tests/unit/config.test.ts tests/unit/photo/normalize.test.ts` — **5 files, 76 tests passed**, exit 0.
- Imported compiled shared, API storage/lister, recognizer storage and erasure adapters and constructed their production factories using synthetic configuration — exit 0. This checks compiled package resolution and runtime dependency availability in the current workspace; it does not build or start a container.
- Coordinator evidence, not independently rerun here: full root suite 587 passed / 1 skipped; workspace builds, latest API build, typecheck and lint passed; 17 selected integration/config tests; three actual Compose renderings and env-wiring checks passed.

## Coverage and regression assessment

- The four previous client construction paths now use the shared SDK factory. Public adapter interfaces and object key generation remain compatible. AWS SDK runtime packages are declared in the importing workspaces; MinIO remains available to integration fixtures as a root development dependency. The root Dockerfile builds shared before applications and copies runtime node_modules and compiled workspace packages.
- Real local HTTP transport tests use production adapters for original PUT → recognizer GET, normalized JPEG PUT → GET, byte equality, Content-Type, HEAD present/missing/forbidden/network failure, HeadBucket failure without CreateBucket, signed GET fetch, TTL, region, checksum settings, path-style and Cloud.ru virtual-host URL construction. The HTTP fixture does not validate SigV4 cryptography or provider IAM.
- All three removal adapters delete an existing fixture object, tolerate a repeated absent-key DELETE, reject Enabled/Suspended or unreadable versioning state before DELETE, and propagate failed DELETE. Versioning is rechecked on each call. Earlier `qe-tests.md` suggestions about normalized bytes, existing-object removal and longer token cycles have been addressed in the current tests.
- The paginator supplies a nonempty second page to the existing orphan policy, preserving prefix and continuation; the policy's DB check and actual deletion of the second orphan are asserted. Missing, repeated and A→B→A continuation tokens, malformed records and second-page denial fail visibly. Existing policy continues to protect live original/normalized references, share cards and unfamiliar key shapes.
- The actual scan route test supplies a valid JPEG and transaction stub. Cleanup failure occurs after rollback/release, attempts only the newly uploaded own key, logs the failure and preserves replay 202 with original scan/status, quota 429 and dependency 503. This directly covers the significant response compatibility change caused by propagating deletion errors.
- The private scan photo route still checks session plus device-session ownership before signing/fetching; public JSON still returns the same-origin photo route. Card image access still rechecks revocation and fetches signed URLs server-side. These callers and their response contracts are unchanged. Existing DB-backed scans/ownership/public-card tests are the appropriate broader regression selection, but were not run in this environment.
- Recognizer bootstrap shares the real guarded erasure adapter with expiry. Inspection confirms expiry only marks `purged` after both original and normalized deletion succeed; erasure retains `present` and `erasing` after failure and only completes after successful deletion. Existing erasure integration tests cover physical deletion, normalized-object failure and recovery. Propagating SDK failures preserves those retry boundaries.
- Configuration tests cover both startup loaders and required region/addressing/endpoint settings. Compose tests cover all six external settings, local-storage/test profiles, production/test credential separation, app DB-only dependencies, outbound networking and absence of storage secrets in web. Actual Compose receipts support interpolation beyond the YAML unit assertions.

## Meaningful limits and remaining execution

- Full PostgreSQL/MinIO integration, real ownership/card flows and container builds/startup were **not executed** here: no Docker daemon. Root `npm test` is explicitly the unit/guard configuration and must not be described as that integration run.
- No live Cloud.ru smoke was executed: target bucket credentials are unavailable. Real endpoint signing acceptance, IAM including GetBucketVersioning, TLS/network access and actual bucket versioning/privacy remain external acceptance checks.
- There is no dedicated `purgeExpiredPhotos` execution test found in the current test tree. The unchanged expiry policy was inspected and its actual shared remover was exercised, but DB state retention/recovery for expiry is less directly covered than erasure. This is a nonblocking coverage gap for this adapter migration, not a claim that expiry retry was dynamically verified.
- Deployment switching and migration remain separate operator work. Local verification does not establish copied byte parity or successful rollback against real buckets.

The selected regression scope is proportionate to the changed configuration, transport, cleanup error propagation and pagination boundaries. These execution limits are explicit and do not reveal an implementation defect that blocks local delivery.
