# Independent primary QE — Cloud.ru S3

Reviewer: qe-primary; family: codex; independent implementation review.
Verdict: CLEAN for the requested working-copy code delivery. No required code changes identified.

Reviewed requirements FR-1–FR-7/NFR-1–NFR-4, both ADRs, architecture, plan, ideation amendments, every tracked code/configuration diff, all new storage adapters/tests, OpenSpec artifacts, operator runbook, author 08_qe_report.md, and compose/mutation evidence JSON. The requested delivery excludes migration of live photos and switching a running deployment.

## Findings

No blocking, critical, high, warning, or suggestion conditions identified after complete scope review.

## Independent evidence

- Node 22: targeted Vitest run passed 4 files / 69 tests, including real AWS SDK local HTTP transport, configuration, Compose YAML, and rollback cleanup.
- Node 22: full npm test passed 78 files / 586 tests, with 1 pre-existing skip. This is the default unit/guard suite; it does not run PostgreSQL/MinIO integration tests.
- Node 22: npm run typecheck completed with exit 0.
- FR-1/NFR-2: both env loaders require all six S3 settings; shared factory sets explicit region, credentials, addressing, WHEN_REQUIRED checksums, three attempts and request/connection timeout. Inspected installed Smithy handler to confirm throwOnRequestTimeout is implemented.
- FR-2: actual SDK HTTP fixture verifies original bytes, MIME, normalized JPEG upload, HEAD distinction, signed GET/TTL/region and Cloud.ru virtual-host URL construction. Existing object keys and PhotoStorage/RecognizerStorage/PhotoStorePort contracts remain compatible.
- FR-3: reviewed deletePhotoS3Object plus actual expiry, account erasure and orphan callers. Successful GetBucketVersioning without Status is required before every DELETE; unsafe/unreadable state and DELETE failures propagate. Existing expiry/erasure code writes purged only after both objects are deleted and keeps failed rows retryable. Rollback-route test triggers deletion failure after ROLLBACK/RELEASE and preserves 202/429/503.
- FR-4: actual paginator sends Prefix/ContinuationToken; nonempty page two reaches existing orphan policy and removal. Missing/repeated continuation, malformed listing entries and denied second page reject. Existing photo-key/DB ownership checks remain in place.
- FR-5/NFR-3/NFR-4: Compose YAML keeps MinIO in test/local-storage and test on private network with independent N4 credentials. API/recognizer receive external S3 values and egress; web receives no S3 keys. Author compose-verification.json records real daemon-free Compose app/test/mixed rendering; independent YAML tests pass. This reviewer did not repeat the standalone Compose binary invocation.
- FR-6/NFR-1: runbook retains keys/Content-Type, byte verification before cutover, stops writers and cleanup for final sync, reconciles deletions, and handles reverse transfer before rollback. Existing server photo/card proxy routes and ownership checks were reviewed unchanged.
- FR-7: reviewed proposal/design/spec/tasks and author's strict OpenSpec validation claim; independent schema-validation execution is assigned to the QE tests reviewer.
- Both ideation amendments are implemented and their targeted tests pass independently. Author mutation-verification.json records assertion failures for temporary rollback/versioning/pagination mutations and restored control. This reviewer inspected that evidence but did not repeat source mutations.

## Limits and delivery interpretation

No Cloud.ru credentials or reachable target bucket were supplied; live provider signing/IAM/versioning compatibility, private-bucket configuration and end-to-end deployment are not demonstrated. No Docker daemon is available; full PostgreSQL/MinIO integration and Docker image startup were not run. These are documented deployment verification limits, not hidden passing checks. Author build/lint/Compose/mutation evidence is distinguished above from checks executed independently here. No additional code changes are necessary for requested source delivery on the available evidence; production cutover still requires the documented live smoke and integration environment.

## Focused refresh after host rework

Current nonce: 6fc78fa2-48a6-4618-bf05-2288cecee330
Current revision: 6e03cfd957a551e2310621a6bac7edbf99e937369398510618287f6a848afad7
Verdict remains CLEAN for source delivery; no conditions originated or added.

Checked actual author handoff in qe-author.json against every host changedPath and affected dependency. The only production logic delta replaces previous-token tracking with a Set of all issued tokens; normal pagination remains unchanged and any repeated token, including A→B→A, now throws. The actual HTTP fixture exercises this cycle. Strengthened tests read normalized bytes back through recognizer and seed an existing private object before each adapter deletion, then verify absence and idempotent repeated removal.

Independent Node 22 focused run passed 4 files / 70 tests (11 storage, 1 rollback, 55 config, 3 Compose). All 54 measured file hashes matched the current host snapshot before and after tests. Added caller targets match unchanged Git content: expiry/erasure/orphans still gate durable purge on successful removal; bootstrap selects the real adapters, server routes preserve proxy and ownership behavior, and transaction helper releases before rollback cleanup. ADR status, proposal/task completion and plan target additions accurately describe local implementation and retain explicit unavailable live/Docker checks. Reviewed the current author QE report as supporting evidence; latest 587-test full suite/lint/API build are author reruns, distinct from this reviewer's independently repeated 70 focused tests.

Accepted structural classification and independently verified the actual implementation/tests. No further code changes or new risks identified for source delivery. Initial limitations on live Cloud.ru, Docker integration and deployment readiness remain. This receipt does not claim production cutover validation.
