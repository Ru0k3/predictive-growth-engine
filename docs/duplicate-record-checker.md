# Duplicate and distributed-state checker

`scripts/check-duplicate-records.py` is a **read-only migration preflight**. It checks the duplicate groups that would block the connected-channel and provider-settings unique constraints, plus duplicate state/lease keys, expired rows, and orphaned rows.

## SQLite

```bash
python3 scripts/check-duplicate-records.py --sqlite ./staging.db
python3 scripts/check-duplicate-records.py --sqlite ./staging.db --format json --strict
```

SQLite is accessed using Python's standard library in read-only URI mode. The script does not create or modify the database.

## PostgreSQL

```bash
python3 scripts/check-duplicate-records.py --postgres "$DATABASE_URL"
DATABASE_URL=postgresql://user:password@host:5432/app \
  python3 scripts/check-duplicate-records.py --format json --strict
```

PostgreSQL mode uses the `psql` CLI with `ON_ERROR_STOP=1`. Do not place a password in shell history; use the normal PostgreSQL password mechanism such as `PGPASSWORD` supplied by the deployment environment or a `.pgpass` file with restrictive permissions.

## Exit codes

- `0`: no duplicate blockers; missing tables and hygiene findings are warnings unless `--strict` is used.
- `1`: duplicate groups were found, a query failed, or `--strict` found missing tables/expired/orphaned rows.
- `2`: invalid arguments, missing database, missing `psql`, or connection/setup failure.

The output includes only identifiers, providers, counts, and status. It never prints access tokens, refresh tokens, client secrets, OAuth codes, or full database rows.

## Expected deployment use

Run this before applying migrations `0005` and `0006`. Do not apply the unique constraints while either of these duplicate checks returns rows:

- `connected_channels` grouped by `(userId, provider)`
- `provider_settings` grouped by `(userId, provider)`

The script also checks `oauth_states` and `sync_leases`, which are created by migration `0006`. On a pre-0006 database, use the default mode to see missing-table warnings; use `--strict` when validating that the full distributed-state migration is complete.

The script supports PostgreSQL query syntax and the quoted camelCase identifiers produced by the current Drizzle schema. The application itself currently uses `mysql2`; PostgreSQL mode is intended for a compatible local/staging schema or a future PostgreSQL adapter, not as a claim that the current application database driver supports PostgreSQL.

## Distributed coordination integration tests

`server/distributed.integration.test.ts` is an opt-in real-database suite. It uses the application's MySQL/TiDB adapter and requires `TEST_DATABASE_URL` or `DATABASE_URL`:

```bash
TEST_DATABASE_URL='mysql://user:password@127.0.0.1:3306/signal_test' \
  pnpm vitest run server/distributed.integration.test.ts
```

The target must already contain migrations `0005` and `0006`. Tests use a generated test user ID and delete only their own rows before and after execution. Without a test database URL, the suite is skipped rather than falsely reported as an end-to-end pass.

The scheduled sync callback invokes `cleanupExpiredCoordinationRecords(100)` before processing a user. Cleanup is bounded to 100 expired OAuth-state rows and 100 expired sync-lease rows per callback, is safe to repeat, and logs failures without interrupting provider synchronization. Active leases and unexpired OAuth states are not deleted.

Sync leases last two minutes in production and renew every 30 seconds. Renewal requires the user, provider, and current lease token and uses an atomic update that also requires the lease to remain unexpired. If renewal fails, the worker stops before writing the provider snapshot. Test-only lease-duration and heartbeat-interval options allow long-running behavior to be tested without real two-minute sleeps.
