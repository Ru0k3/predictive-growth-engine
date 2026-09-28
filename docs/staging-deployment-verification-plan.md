# Signal / Lab staging deployment verification plan

This plan is for staging only. It does not authorize or describe a production migration. The application currently uses the MySQL/TiDB adapter through `mysql2`.

## 1. Release and environment preflight

Verify the release branch and commit, then run:

```bash
pnpm test
pnpm check
pnpm build
git diff --check
git status --short --branch
```

Required staging configuration must be present in the hosting provider's secret manager. Verify **presence only**; never print values:

| Variable | Required | Verification |
|---|---:|---|
| `DATABASE_URL` | Yes | Staging MySQL/TiDB connection |
| `APP_ORIGIN` or `ALLOWED_APP_ORIGINS` | Yes | Exact trusted OAuth callback origin |
| `PROVIDER_TOKEN_ENCRYPTION_KEY` | Yes | Stable encryption key; do not rotate during test |
| `YOUTUBE_CLIENT_ID` | If YouTube is enabled | Staging app client ID |
| `YOUTUBE_CLIENT_SECRET` | If YouTube is enabled | Staging app secret |
| `INSTAGRAM_CLIENT_ID` | If Instagram is enabled | Staging Meta/Instagram app ID |
| `INSTAGRAM_CLIENT_SECRET` | If Instagram is enabled | Staging app secret |
| `TIKTOK_CLIENT_KEY` | If TikTok is enabled | Staging TikTok client key |
| `TIKTOK_CLIENT_SECRET` | If TikTok is enabled | Staging TikTok client secret |
| `COORDINATION_CLEANUP_INTERVAL_MS` | Optional | Default 900000; allowed range 60000–86400000 |
| `COORDINATION_CLEANUP_BATCH_SIZE` | Optional | Default 100; allowed range 1–1000 |

Do not continue if the database, origin configuration, encryption key, or selected provider credentials are missing.

## 2. Backup and migration preflight

1. Take a staging database backup.
2. Restore it into an isolated database and verify that the restore is readable.
3. Run the MySQL/TiDB duplicate SQL before applying constraints:

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

4. Confirm `oauth_states`, `sync_leases`, and `maintenance_leases` exist if the environment is already partially migrated.
5. Resolve duplicate provider rows without printing or decrypting credentials in logs.
6. Apply migrations exactly once, in order:

```text
drizzle/0005_stable_signal.sql
drizzle/0006_distributed_state_leases.sql
drizzle/0007_maintenance_cleanup_lease.sql
```

7. Verify:

```sql
SHOW COLUMNS FROM connected_channels LIKE 'lastError';
SHOW INDEX FROM connected_channels;
SHOW INDEX FROM provider_settings;
SHOW COLUMNS FROM oauth_states;
SHOW INDEX FROM oauth_states;
SHOW COLUMNS FROM sync_leases;
SHOW INDEX FROM sync_leases;
SHOW COLUMNS FROM maintenance_leases;
SHOW INDEX FROM maintenance_leases;
```

Do not use an ad-hoc schema push against production. Do not modify an already-applied migration.

## 3. Coordination verification

Run the real database integration suite against an isolated staging test database containing all migrations:

```bash
TEST_DATABASE_URL='mysql://...' \
  pnpm vitest run server/distributed.integration.test.ts
```

Use the normal secret mechanism rather than putting a real password in shell history.

Verify:

- Two workers cannot acquire the same active `(userId, provider)` lease.
- Renewal with the current token succeeds.
- Renewal with a wrong token fails.
- A released or expired token cannot renew.
- A wrong token cannot release a lease.
- A current token can release its own lease.
- A long-running sync renews before expiry.
- A competing worker remains blocked while renewal succeeds.
- Exactly one snapshot is written.
- A lease takeover prevents the old worker from persisting or updating status.
- A new lease owner can persist successfully.
- Expired OAuth states and sync leases are removed.
- Active leases and unexpired OAuth states remain.
- Concurrent cleanup runs do not conflict because of `maintenance_leases`.

The snapshot write is protected by a short MySQL/TiDB transaction. It locks the matching `sync_leases` row with `FOR UPDATE`, verifies the token and future expiry, inserts the snapshot, and updates the connected-channel success state before committing. Provider API calls occur outside the transaction.

## 4. Dedicated cleanup verification

The server starts a cleanup scheduler independently of user schedules. Each instance may wake up, but only the instance holding the `coordination-cleanup` maintenance lease performs deletion.

Verify:

- Default interval is 15 minutes.
- Interval is clamped to 1 minute minimum and 24 hours maximum.
- Default batch size is 100.
- Batch size is clamped to 1–1000.
- Cleanup does not delete active or unexpired records.
- Cleanup can be run repeatedly.
- A database failure logs only a safe error category and does not terminate the server or provider sync.
- Cleanup deletes at most one bounded batch per table per run.
- The legacy scheduled callback fallback remains bounded and uses the same distributed lock.

## 5. Application smoke tests

Against staging, verify:

- Application startup and authentication.
- Unauthenticated dashboard.
- Authenticated dashboard with no snapshots.
- Authenticated dashboard with snapshots.
- Dashboard refresh performs no provider API calls.
- Manual sync uses the shared worker.
- Scheduled sync uses the shared worker.
- Provider-not-configured behavior.
- Disconnect and reconnect.
- Old good snapshots remain after provider failure.
- Later success clears `lastError` and restores connected status.

## 6. Provider verification

For each provider enabled in staging, use an eligible dedicated test account and official consent page:

- YouTube
- Instagram/Meta
- TikTok

Verify exact registered redirect URI, state mismatch/expiry/replay handling, pending-to-connected transition, encrypted tokens, token refresh and rotation, bounded retries, `Retry-After`, redacted errors, disconnect/revocation, and reconnect.

Do not call a provider production-ready without real staging credentials, app approval, registered redirect URLs, and an eligible test account.

## 7. Rollback and evidence

If application deployment fails after migrations succeed, roll back the application release while preserving additive coordination tables. If a migration fails, stop and inspect the migration journal and schema before retrying; do not blindly rerun a partially applied file.

Record:

- Starting and final commit
- Staging URL
- Backup and restore result
- Migration results for 0005, 0006, and 0007
- Duplicate preflight output without secrets
- Integration-test results
- Cleanup counts and duration
- Provider test results
- Dashboard API-call behavior
- Full test/check/build results
- Remaining risks

No production migration or customer onboarding should occur until this staging evidence is complete and reviewed.
