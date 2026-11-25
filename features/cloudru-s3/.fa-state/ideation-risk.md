# QCSD risk review

Verdict — CONDITIONAL. Reviewer — qcsd-risk, family codex. Phase — ideation.

## RISK-001 — retained versions after successful deletion

Severity — HIGH. Classification — structural.

The proposed adapter interprets successful DeleteObject as physical erasure. An enabled or suspended versioning configuration can retain earlier object versions behind a delete marker. The existing erasure and expiry jobs then commit purged and eventually erased, so ordinary retries stop visiting the retained data.

Evidence comes from the proposed ADR-001 Decision and architecture error-handling section, the state commits in apps/recognizer/src/consent/erasure-job.ts and photo/purge-expired.ts, and the source reference clipmkr/packages/s3/src/erasure.ts. Clipmkr explicitly checks GetBucketVersioning and rejects any Status before deletion.

The design must establish an unversioned bucket before destructive operations. Enabled, Suspended, and a failed status read must refuse deletion success. Cover expiry, account erasure, orphan cleanup and rollback deletion through a common guard. Name tests for each refusal and the unversioned successful case. The operator instructions must include the bucket prerequisite and GetBucketVersioning permission.

## Reviewed mitigations

The design preserves server-side ownership checks and authenticated image routes. It confines local MinIO to test/local-storage profiles and supplies fixed local endpoint and separate N4_S3 credentials to tests. Rollout scope requires copying existing keys and verifying bytes before a write freeze and final synchronization. Original storage is retained for rollback. Those choices address the major privacy, destructive-test, and missing-media migration risks at design level.

No runtime code or tests were executed in this design review. The report assesses the prepared design snapshot only.

## Focused verification

Current design verdict — CLEAN. Original condition RISK-001 is retained in the receipt and verified against revision 62b4f7fd2744fcaf1699de26f8eed81f7d30acad75ea601c318c92b65d190e2d.

ADR-001 now requires deletePhotoS3Object and a GetBucketVersioning request before every DELETE. Enabled, Suspended, and failed reads refuse deletion. ADR-002 requires a never-versioned bucket and the additional runtime permission. Architecture confirms no cache, failure propagation before purged, and route rollback error handling. ADR Confirmation names the versioning refusal and repeat-success transport tests.

The author classified all three changed files as structural and declared the added IAM dependency. That assessment matches the reviewed delta. No additional serious design risk was identified. implementationVerified=true here verifies the phase-specific design artifacts, and makes no claim about runtime implementation or test execution.
