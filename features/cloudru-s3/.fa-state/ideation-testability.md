# QCSD — Testability

Reviewer qcsd-testability, family codex. Independent design review.

## Verdict

GO for implementation planning. The settled design exposes each changed behavior through
existing service ports and a proposed export for the production object lister. No blocking
acceptance or testability gap was identified in this snapshot. This review concerns design.
Implementation verification remains a subsequent QE obligation.

## Scope inspected

Requirements FR-1 through FR-7 and NFR-1 through NFR-4, both ADRs, architecture,
current API PhotoStorage, recognizer storage and deletion ports, purgeOrphanObjects,
purgeExpiredPhotos and runErasureJob. Existing config, ownership, orphan and erasure tests
were examined. The existing erasure regression proves that a failed storage deletion leaves
an account erasing and a later successful retry completes it. Existing orphan regressions
protect normalized images, live originals, share cards and foreign key shapes.

## Traceability for the implementation plan

| Requirement | Concrete proof to retain or add |
|---|---|
| FR-1 | Both env loaders, individual missing/empty values, invalid boolean and endpoint, non-default region |
| FR-2 | Actual SDK PUT/GET byte equality and Content-Type, normalized JPEG, presigned GET resolution |
| FR-3 | Actual adapter propagates 403 and transport errors, DELETE is repeatable, existing erasure/expiry state transitions |
| FR-4 | Production lister traverses two pages and sends the returned continuation token, prefix reaches the request |
| FR-5 | Compose resolves with absent MinIO administrator credentials, test endpoint/keys remain local even if Cloud.ru keys are present |
| FR-6 | Operator guide describes key preservation, byte checks, final sync with writes stopped, rollback and orphan-cleaner coordination |
| FR-7 | Strict OpenSpec validation plus final mapping to implemented files and tests |
| NFR-1 | Existing route ownership and same-origin photo/card response regressions |
| NFR-2 | Assert WHEN_REQUIRED behavior and virtual-host presigned URL with ru-central-1 scope |
| NFR-3 | Env wiring assertions for API/recognizer, web receives no storage secret |
| NFR-4 | Local HTTP fixture, explicit separate result for unavailable live Cloud.ru smoke |

## Testability assessment

| Principle | Score / 10 | Basis |
|---|---|---|
| Observability | 9 | SDK commands and failures observable at transport boundary |
| Controllability | 10 | Existing ports and local fixture control responses |
| Decomposability | 9 | Factory, adapters, config and Compose checked independently |
| Determinism | 9 | Local fixture avoids cloud timing and credential dependencies |
| Simplicity | 9 | Existing ports and keys reused |
| Stability | 9 | Public route contracts remain covered by existing tests |
| Understandability | 9 | Explicit FR identifiers and ADR Confirmation paths |
| Isolation | 9 | Local MinIO uses independent settings |
| Automation | 8 | Docker integration depends on unavailable host tooling |
| Realism | 7 | HTTP fixture exercises SDK while provider smoke needs credentials |

Total 88/100. The realism and automation limits require truthful reporting during delivery,
which NFR-4 already specifies.

## Test construction notes

Presigned URLs should be checked by actual byte retrieval for the local fixture. A separate
virtual-host URL assertion can cover Cloud.ru addressing without requiring external DNS.
Checksum regression should assert the selected SDK configuration or actual wire headers,
and should fail if SDK defaults replace WHEN_REQUIRED. Existing tests using injected listers
cover orphan policy, so the new test should exercise the exported production paginator.
Keep a nonempty page two to make a single-page implementation fail. Explicitly test the
first successful DELETE followed by a repeated DELETE and distinguish 404 HEAD from 403.

The tests described above operationalize already declared requirements and ADR Confirmation.
They introduce no additional product capability.

## Focused rework verification

Rechecked settled revision 62b4f7fd2744fcaf1699de26f8eed81f7d30acad75ea601c318c92b65d190e2d. Author handoff matches
all three changed design paths and classifies the change structurally.

ADR-001 and architecture now explicitly own POST /scans cleanup failure handling in
the replay, quota and DB failure branches. Named route regressions preserve 202/429/503
when the storage adapter throws. These branches currently await removal directly,
which independently confirms the need for that acceptance.

The common deletion operation now checks GetBucketVersioning for every DELETE with no
cached status. Enabled, Suspended and status-read failure refuse deletion. The planned
transport test file exercises those inputs and unversioned/repeated success. ADR-002
records the never-versioned bucket prerequisite and GetBucketVersioning permission.

The delta is testable through existing ports, with explicit success/failure observations.
Verdict remains clean for planning. This focused verification confirms corrected design
artifacts. Code and runtime evidence are owed during QE.
