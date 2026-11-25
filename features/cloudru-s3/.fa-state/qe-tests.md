# Independent qe-tests review

Verdict: clean for the reviewed implementation and local verification scope. No blocking test finding. Current snapshot: 6e03cfd957a551e2310621a6bac7edbf99e937369398510618287f6a848afad7. Initial snapshot: d66f013ea6c0d60a3afece1d60ad6f6f5a20b6cdb3b87efe1bb587965af779b7. Reviewer: qe-tests / codex.

Read requirements, both ADRs, plan, changed configuration and adapters, cleanup route, transport/config/Compose tests, existing orphan policy and erasure retry implementation/tests. Compared author QE report and author Compose/mutation receipts against actual assertions.

## Independent evidence

- Node 22 `npm test -- tests/unit/s3-storage.test.ts tests/unit/scans-cleanup.test.ts tests/unit/s3-compose.test.ts tests/unit/config.test.ts`: 4 files, 69 tests passed.
- `npm run test:integration -- tests/integration/check-env-wiring.test.ts tests/integration/provider-adapter.test.ts`: 2 files, 17 tests passed. These selected tests do not establish PostgreSQL/MinIO integration.
- Actual Compose v2.39.4 `config --format json`, isolated synthetic environment and `/dev/null` env file: app without local secrets, test without production S3 settings, and mixed markers all passed independent assertions. App excludes storage/provisioner and only depends on DB; test uses local endpoint/region/addressing/bucket/keys; web receives no S3 variables.

## Safeguard and transport assessment

The SDK fixture uses real production factories and local HTTP rather than mocking SDK command classes. It proves original bytes cross API PUT and recognizer GET, original MIME and fetched signed URL bytes, caller TTL and SigV4 credential region, checksum settings, local path addressing and Cloud.ru virtual-host URL construction. It accepts fixture signatures rather than validating credentials against a real provider.

Cleanup uses an injected Fastify route and valid JPEG. All replay/quota/database branches encounter an actual failing remover, after ROLLBACK and release; the test checks 202/429/503, response data/error codes, own new object key, log event and no COMMIT. The amendment is exercised on input.

Versioning test invokes API, erasure and orphan removers, changes state between calls, refuses Enabled/Suspended/forbidden versioning lookup, and proves no DELETE for these refusals plus two successful missing-key deletes per adapter. The second-page test passes a real paginator into the existing orphan ownership policy and observes the second key's DB lookup and DELETE. Prefix/continuation and malformed/denied pages are asserted. Config checks both startup loaders and all six required S3 settings, strict boolean, endpoint form and region, without printing supplied credentials.

## Initial observations and final focused verification

The initial review recorded three nonblocking opportunities: normalized JPEG byte round trip, existing-object state after deletion, and a longer token cycle. The author implemented all three. At the final snapshot I independently reran the same four targeted files: **70/70 tests passed** (11 transport, 55 config, 3 Compose, 1 route test covering three response branches).

The normalized image is now read through the production recognizer GET and compared byte-for-byte. Every deleting adapter starts with an existing fixture object; DELETE is followed by the production HEAD returning false, then another DELETE proves idempotency. The new cyclic fixture produces page-two→page-three→page-two; the paginator stores all emitted tokens in a Set and throws at the repeated token before yielding that page. This prevents the longer loop that adjacent-token comparison missed.

I checked the author handoff as structural, confirmed changedScope contains every host changedPath, and independently recalculated every current manifest digest. All match. Newly declared unchanged dependencies include orphan/expiry/erasure logic, recognizer bootstrap, server photo/card routes, renderer and transaction helper. Their integration preserves deletion-before-purged/erased, provider wiring, ownership-before-photo access, share-card revocation checks, and rollback/release ordering. They require no code fix. ADR working-copy status, proposal/tasks and plan scope metadata agree with local completion and disclosed live/daemon limits. The author handoff is copied unchanged into my receipt, with authorAssessmentChecked:true and structural deltaVerification implementationVerified:true. No initial own conditions existed; none remain or were added.

Author mutation-verification.json records failing rollback/versioning/pagination mutants and restored success, but lacks mutant patches and logs. I did not mutate shared source files and do not present these as independent mutation executions. The three relevant tests have observable assertions which would detect reverting those respective safeguards.

Full daemon-backed PostgreSQL/MinIO integration and live Cloud.ru smoke remain unexecuted here. Existing erasure logic still awaits deletion before purged/erased; its complete database retry semantics require the unavailable integration environment. Local passing tests and Compose rendering do not certify a real Cloud.ru IAM policy, networking, TLS, or bucket versioning state. No switch or migration is authorized by this receipt.

## Discrimination instrument limit

Reviewed the final author report and both raw discrimination JSON attempts. The restored-dependencies result classifies cleanup as DISCRIMINATES with one executed baseline assertion (`expected 500 to be 202`). The S3 file is CANNOT_ISOLATE: baseline HEAD has no newly introduced storage-object-lister module, so its failure is file-load with no test assertions executed. Aggregate remains CANNOT_ISOLATE and measurementValid is partial; it is not a passed S3 baseline comparison. Initial dependency-isolation failure is also retained. The author records separate versioning/pagination mutation assertion failures and restored green control, and my own source inspection/current real-HTTP tests verify those safeguards trigger; I have not independently reproduced those author mutations. This is an explicit verification-tool limitation, with no newly observed product defect. The workflow owner must retain this partial measurement in the final Step-8 decision.
