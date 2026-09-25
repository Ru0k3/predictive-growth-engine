# Signal / Lab production deployment and provider verification plan

## 1. Remaining production-risk audit

### Release-blocking risks

- **Provider credentials and app approval:** YouTube, Instagram, and TikTok OAuth cannot be declared production-ready until each provider has real staging credentials, exact redirect URI registration, approved scopes, and a test account with the required account type.
- **Database migration safety:** Migration `0005_stable_signal.sql` adds a `lastError` column and uniqueness constraints. It will fail if existing data contains duplicate `(userId, provider)` rows. Run the preflight queries below before applying it.
- **OAuth redirect trust:** The OAuth start procedure accepts a browser-provided origin. Before production release, enforce an allowlist or derive the callback origin from the trusted request host/proxy configuration. Never permit arbitrary redirect origins.
- **Provider API contract verification:** Aggregate metrics differ by provider. Live staging calls must confirm that reach, impressions, followers, engagement, and retention are mapped only when the provider actually exposes those metrics.
- **Background job ownership:** Every scheduled task must be tied to one user and one task UID. Orphaned tasks, duplicate task creation, and a disabled task that remains persisted must be reconciled during rollout.

### High-priority operational risks

- **Token lifecycle:** Refresh-token rotation, expired refresh tokens, revoked consent, and provider-specific refresh failures need staging verification and user-facing recovery instructions.
- **Rate limits and outages:** The worker retries only retryable statuses with bounded backoff. Persistent 401/403/400 errors must remain visible in `connected_channels.status` and `lastError`; do not retry them indefinitely.
- **Snapshot freshness:** Dashboard values are now snapshot-only. The UI must show `awaiting background sync`, persisted snapshot time, and provider error states rather than silently calling external APIs.
- **Duplicate snapshots:** The worker applies a five-minute minimum interval for scheduled work. Production should monitor snapshot volume and add a database-level deduplication key if multiple workers can run concurrently.
- **Migration rollback:** The `lastError` column is additive and can be rolled back safely. Unique constraints require removing or merging duplicate rows before rollback/retry.
- **Data deletion and backup:** Confirm backups, restore testing, user deletion behavior, encrypted-token destruction, and provider disconnect/revocation procedures before onboarding real customers.
- **Observability:** Add alerts for repeated provider errors, stale snapshots, failed heartbeat callbacks, refresh-token failures, and unusual snapshot volume. Logs must not include access tokens, refresh tokens, client secrets, or authorization codes.

## 2. Database migration deployment plan

### Preflight in a staging clone

1. Take a current database backup and verify that it can be restored to an isolated database.
2. Confirm the deployed application is at or before the commit that introduces migration 0005.
3. Check for duplicates:

```sql
SELECT userId, provider, COUNT(*) AS copies
FROM connected_channels
GROUP BY userId, provider
HAVING COUNT(*) > 1;

SELECT userId, provider, COUNT(*) AS copies
FROM provider_settings
GROUP BY userId, provider
HAVING COUNT(*) > 1;
```

4. For each duplicate connected channel, retain the newest valid token/account row, revoke or remove stale rows, and preserve the most recent `lastSyncedAt`/status where appropriate.
5. For duplicate provider settings, retain the newest row. Never print decrypted credentials while resolving duplicates.
6. Confirm the database user can run `ALTER TABLE`, create indexes, and read/write the affected tables.
7. Apply the migration to staging using the repository migration mechanism. Do not use an ad-hoc schema push against production.
8. Verify:

```sql
SHOW COLUMNS FROM connected_channels LIKE 'lastError';
SHOW INDEX FROM connected_channels;
SHOW INDEX FROM provider_settings;
```

9. Run application tests, authenticated snapshot reads, manual sync, scheduled sync, disconnect, and provider-not-configured checks against staging.

### Production rollout

1. Announce a short sync maintenance window; dashboard reads can remain available because the migration is additive, but pause scheduled sync during the DDL if the database provider requires it.
2. Take and verify a production backup immediately before migration.
3. Confirm no duplicate preflight rows remain.
4. Apply `drizzle/0005_stable_signal.sql` exactly once through the deployment migration runner.
5. Verify the column and indexes, then deploy the application commit containing the snapshot-only dashboard and shared worker.
6. Re-enable heartbeat schedules gradually, starting with one internal/staging user and then a small production cohort.
7. Confirm each cohort receives one snapshot per provider, errors persist without token leakage, and dashboard freshness advances after the worker runs.
8. Monitor database latency, provider response status distribution, task callback failures, snapshot row growth, and stale connected accounts for at least one full daily sync cycle.

### Rollback

- If application deployment fails but migration succeeds, roll back the application binary; the additive `lastError` column is harmless to the previous code.
- If the migration fails on duplicates, stop rollout, restore/repair the duplicate rows, and rerun only after preflight passes.
- If the new worker causes provider load or callback failures, disable heartbeat tasks and use the prior application release while preserving the migration.
- Do not drop the unique constraints as a first response to an application bug; investigate data ownership and task duplication first.

## 3. OAuth callback verification checklist

For each provider, execute with a real staging developer app and a dedicated test account.

### Start and consent

- [ ] Provider is configured server-side; no platform API key is requested from the end user.
- [ ] Unconfigured provider returns a clear configuration error and does not create a connection row.
- [ ] Authorization URL uses the official provider consent host.
- [ ] Client ID/key, redirect URI, scope separator, and provider-specific parameters are correct.
- [ ] Redirect URI exactly matches the registered staging callback URL.
- [ ] State cookie is HTTP-only, secure, short-lived, and scoped to the callback flow.
- [ ] State value is high entropy and unique per attempt.
- [ ] Consent can be canceled and returns a user-visible failure state without persisting tokens.

### Callback security and failure paths

- [ ] Missing `code` returns an error and does not write a connection.
- [ ] Missing `state` returns an error and does not write a connection.
- [ ] State mismatch returns HTTP 403 and does not exchange the code.
- [ ] Missing provider cookie returns an error and does not exchange the code.
- [ ] Invalid provider cookie is rejected; it cannot select an arbitrary provider implementation.
- [ ] Missing origin/callback context redirects to a safe, configured application origin.
- [ ] Callback with an unauthenticated session does not persist a token.
- [ ] Provider token-exchange 400/401/403/429/5xx responses produce a safe user-facing error without leaking response bodies or secrets.
- [ ] Replayed callback code does not create a duplicate connection or duplicate snapshot.
- [ ] Reconnecting the same provider updates the existing workspace-owned row rather than creating a second row.
- [ ] Callback logs contain provider, user-safe error category, and correlation data only—never codes or tokens.

### Successful callback persistence

- [ ] Access token is encrypted at rest with `PROVIDER_TOKEN_ENCRYPTION_KEY`.
- [ ] Refresh token, when supplied, is encrypted separately.
- [ ] Plaintext tokens are absent from database rows, API responses, logs, and error messages.
- [ ] Provider account ID, display name, granted scopes, expiry, and last-sync time are stored correctly.
- [ ] Initial snapshot is created only after the provider account has been resolved.
- [ ] Provider-specific metric mappings are checked against the provider response fixture.
- [ ] Dashboard shows persisted snapshot freshness and does not make an API call during page load.

## 4. Token refresh verification checklist

- [ ] Valid, non-expired access token is used without a refresh request.
- [ ] Token inside the five-minute expiry window refreshes before provider data fetch.
- [ ] Rotating refresh token replaces the stored encrypted refresh token.
- [ ] New access-token expiry is persisted correctly.
- [ ] Refresh response without a new refresh token preserves the existing refresh token.
- [ ] Refresh 400/401/invalid-grant marks the connection `error`, persists a bounded safe message, and tells the user to reconnect.
- [ ] Refresh 429/5xx is retried according to the worker policy and then recorded as an error after exhaustion.
- [ ] Concurrent scheduled/manual requests do not overwrite a newer token with an older token; validate with a single-flight or database locking strategy before high concurrency.
- [ ] Expired refresh token does not cause an infinite retry loop.
- [ ] Disconnect revokes the current access token where supported and deletes the local connection row.
- [ ] After disconnect, scheduled sync skips the provider and no token remains usable locally.

## 5. Rate-limit and outage verification checklist

- [ ] Provider 429 response with `Retry-After: 2` waits approximately two seconds before retrying.
- [ ] Provider 429 response without `Retry-After` uses exponential backoff.
- [ ] 408 and 5xx responses retry up to the configured maximum attempts.
- [ ] 400, 401, 403, and non-transient validation errors do not retry repeatedly.
- [ ] Backoff is capped and cannot block a heartbeat callback indefinitely.
- [ ] One provider failing does not prevent other providers for the same user from syncing.
- [ ] Failed providers persist `status=error` and a redacted bounded `lastError`.
- [ ] A later successful sync clears `lastError` and restores `status=connected`.
- [ ] Scheduled sync is sequential per user and respects the minimum duplicate interval.
- [ ] Manual “Sync now” is explicit and may force a sync without making dashboard refreshes force one.
- [ ] Callback response includes per-provider success/failure results for operational diagnosis.
- [ ] Snapshot row count and provider request count are monitored for unexpected amplification.
- [ ] Provider outages do not replace prior good snapshots with zeros; the last successful snapshot remains available with stale/error status visible.

## 6. Post-deploy acceptance checks

- [ ] Unauthenticated dashboard uses clearly labeled demo fallback data.
- [ ] Authenticated workspace with no snapshots shows `awaiting background sync`.
- [ ] Authenticated workspace with snapshots shows persisted freshness timestamp.
- [ ] Refreshing the dashboard causes no provider token refresh or external provider API request.
- [ ] Heartbeat callback creates/updates snapshots once per provider.
- [ ] Manual sync updates the dashboard after refetch.
- [ ] Empty, loading, success, and provider-error states are visible on desktop and mobile.
- [ ] Full test suite, TypeScript check, and production build pass from the release commit.
