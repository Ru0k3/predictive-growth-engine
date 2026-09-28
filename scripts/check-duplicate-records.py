#!/usr/bin/env python3
"""Read-only migration preflight for connected channels, provider settings, OAuth state, and sync leases.

Examples:
  python3 scripts/check-duplicate-records.py --sqlite ./staging.db
  DATABASE_URL=postgresql://user:pass@localhost/app python3 scripts/check-duplicate-records.py
  python3 scripts/check-duplicate-records.py --postgres "$DATABASE_URL" --format json --strict

PostgreSQL mode uses the psql CLI; no application credentials or rows are printed.
The script never writes to the database.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from typing import Any

TABLES = ["connected_channels", "provider_settings", "oauth_states", "sync_leases", "maintenance_leases"]

DUPLICATE_CHECKS = {
    "connected_channels_by_user_provider": (
        'SELECT "userId", "provider", COUNT(*) AS copies '
        'FROM "connected_channels" GROUP BY "userId", "provider" '
        'HAVING COUNT(*) > 1 ORDER BY copies DESC, "userId", "provider"'
    ),
    "provider_settings_by_user_provider": (
        'SELECT "userId", "provider", COUNT(*) AS copies '
        'FROM "provider_settings" GROUP BY "userId", "provider" '
        'HAVING COUNT(*) > 1 ORDER BY copies DESC, "userId", "provider"'
    ),
    "oauth_states_by_state": (
        'SELECT "state", COUNT(*) AS copies FROM "oauth_states" '
        'GROUP BY "state" HAVING COUNT(*) > 1'
    ),
    "sync_leases_by_user_provider": (
        'SELECT "userId", "provider", COUNT(*) AS copies FROM "sync_leases" '
        'GROUP BY "userId", "provider" HAVING COUNT(*) > 1'
    ),
    "maintenance_leases_by_lock_name": (
        'SELECT "lockName", COUNT(*) AS copies FROM "maintenance_leases" '
        'GROUP BY "lockName" HAVING COUNT(*) > 1'
    ),
}

HYGIENE_CHECKS = {
    "expired_oauth_states": (
        'SELECT COUNT(*) AS count FROM "oauth_states" WHERE "expiresAt" <= CURRENT_TIMESTAMP'
    ),
    "expired_sync_leases": (
        'SELECT COUNT(*) AS count FROM "sync_leases" WHERE "expiresAt" <= CURRENT_TIMESTAMP'
    ),
    "expired_maintenance_leases": (
        'SELECT COUNT(*) AS count FROM "maintenance_leases" WHERE "expiresAt" <= CURRENT_TIMESTAMP'
    ),
    "orphaned_oauth_states": (
        'SELECT COUNT(*) AS count FROM "oauth_states" s '
        'LEFT JOIN "users" u ON u."id" = s."userId" WHERE u."id" IS NULL'
    ),
    "orphaned_sync_leases": (
        'SELECT COUNT(*) AS count FROM "sync_leases" l '
        'LEFT JOIN "users" u ON u."id" = l."userId" WHERE u."id" IS NULL'
    ),
}

# SQLite and PostgreSQL both accept double-quoted identifiers and CURRENT_TIMESTAMP.
# PostgreSQL deployments created by a quoted Drizzle schema use camelCase columns.

@dataclass
class Result:
    name: str
    rows: list[dict[str, Any]]
    status: str = "ok"
    error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--sqlite", metavar="PATH", help="SQLite database path")
    source.add_argument("--postgres", metavar="URL", help="PostgreSQL connection URL")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--strict", action="store_true", help="Treat missing tables and hygiene findings as failures")
    return parser.parse_args()


def sqlite_table_exists(connection: sqlite3.Connection, table: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (table,)
    ).fetchone()
    return row is not None


def postgres_table_exists(url: str, table: str) -> bool:
    rows = run_psql(url, "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = %s" % sql_literal(table))
    return bool(rows)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_psql(url: str, query: str) -> list[dict[str, Any]]:
    if not shutil.which("psql"):
        raise RuntimeError("PostgreSQL mode requires the psql CLI, which was not found")
    completed = subprocess.run(
        ["psql", url, "-X", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", query],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PGPASSWORD": os.environ.get("PGPASSWORD", "")},
    )
    if completed.returncode:
        # psql may echo connection details or server text. Return only a bounded, sanitized error.
        message = " ".join(completed.stderr.split())[:400]
        raise RuntimeError(message or "psql query failed")
    rows: list[dict[str, Any]] = []
    for line in completed.stdout.splitlines():
        fields = line.split("\t")
        rows.append({f"column_{index + 1}": value for index, value in enumerate(fields)})
    return rows


def execute_sqlite(connection: sqlite3.Connection, query: str) -> list[dict[str, Any]]:
    cursor = connection.execute(query)
    columns = [description[0] for description in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def execute_postgres(url: str, query: str, name: str) -> list[dict[str, Any]]:
    # Add a stable header query so psql output can be converted without depending on
    # client-side column formatting. The result is still metadata/counts only.
    aliases = {
        "expired_oauth_states": 'SELECT COUNT(*) AS count FROM "oauth_states" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
        "expired_sync_leases": 'SELECT COUNT(*) AS count FROM "sync_leases" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
        "expired_maintenance_leases": 'SELECT COUNT(*) AS count FROM "maintenance_leases" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
        "orphaned_oauth_states": 'SELECT COUNT(*) AS count FROM "oauth_states" s LEFT JOIN "users" u ON u."id" = s."userId" WHERE u."id" IS NULL',
        "orphaned_sync_leases": 'SELECT COUNT(*) AS count FROM "sync_leases" l LEFT JOIN "users" u ON u."id" = l."userId" WHERE u."id" IS NULL',
    }
    # For duplicate queries, use JSON output from PostgreSQL so column names are retained.
    if name in DUPLICATE_CHECKS:
        query = f"SELECT COALESCE(json_agg(row_to_json(result)), '[]'::json) FROM ({query}) result"
        raw = run_psql(url, query)
        if not raw or not raw[0]:
            return []
        return json.loads(raw[0].get("column_1", "[]"))
    query = aliases.get(name, query)
    raw = run_psql(url, query)
    if not raw:
        return []
    values = list(raw[0].values())
    return [{"count": int(values[0])}]


def table_exists(backend: str, source: Any, table: str) -> bool:
    if backend == "sqlite":
        return sqlite_table_exists(source, table)
    return postgres_table_exists(source, table)


def execute(backend: str, source: Any, query: str, name: str) -> list[dict[str, Any]]:
    if backend == "sqlite":
        return execute_sqlite(source, query)
    return execute_postgres(source, query, name)


def run_checks(backend: str, source: Any, strict: bool) -> dict[str, Any]:
    results: list[Result] = []
    missing_tables: list[str] = []
    for table in TABLES:
        try:
            if not table_exists(backend, source, table):
                missing_tables.append(table)
        except Exception as error:
            results.append(Result(f"table:{table}", [], "error", str(error)))

    for name, query in {**DUPLICATE_CHECKS, **HYGIENE_CHECKS}.items():
        required_table = "oauth_states" if "oauth_states" in name else "maintenance_leases" if "maintenance_leases" in name else "sync_leases" if "sync_leases" in name else "connected_channels" if "connected_channels" in name else "provider_settings"
        if name.startswith("orphaned_") and "users" not in missing_tables:
            required_table = required_table
        if required_table in missing_tables or (name.startswith("orphaned_") and "users" in missing_tables):
            results.append(Result(name, [], "missing_table", f"required table is missing: {required_table}"))
            continue
        try:
            results.append(Result(name, execute(backend, source, query, name)))
        except Exception as error:
            results.append(Result(name, [], "error", str(error)))

    duplicate_results = [r for r in results if r.name in DUPLICATE_CHECKS and r.status == "ok" and r.rows]
    hygiene_results = [r for r in results if r.name in HYGIENE_CHECKS and r.status == "ok" and int(r.rows[0].get("count", 0)) > 0]
    errors = [r for r in results if r.status == "error"]
    blocking = bool(duplicate_results or errors or (strict and (missing_tables or hygiene_results)))
    return {
        "backend": backend,
        "read_only": True,
        "tables_missing": missing_tables,
        "results": [r.__dict__ for r in results],
        "duplicate_blockers": [r.name for r in duplicate_results],
        "hygiene_findings": [r.name for r in hygiene_results],
        "exit_status": "FAIL" if blocking else "PASS",
    }


def print_text(report: dict[str, Any]) -> None:
    print(f"Backend: {report['backend']}")
    print("Mode: read-only (no INSERT, UPDATE, DELETE, ALTER, or DROP statements)")
    print()
    if report["tables_missing"]:
        print("Missing tables: " + ", ".join(report["tables_missing"]))
    for result in report["results"]:
        name = result["name"]
        if result["status"] == "ok":
            if name in HYGIENE_CHECKS:
                count = result["rows"][0].get("count", 0) if result["rows"] else 0
                label = "FINDING" if int(count) > 0 else "OK"
                print(f"{label:7} {name}: {count}")
            elif result["rows"]:
                print(f"BLOCKER {name}: {len(result['rows'])} duplicate group(s)")
                for row in result["rows"]:
                    safe = ", ".join(f"{key}={value}" for key, value in row.items() if key != "state")
                    print(f"         {safe}")
            else:
                print(f"OK      {name}: no duplicate groups")
        else:
            print(f"{result['status'].upper():7} {name}: {result.get('error', '')}")
    print()
    print(f"Result: {report['exit_status']}")


def main() -> int:
    args = parse_args()
    source_kind = "sqlite" if args.sqlite else "postgres" if args.postgres else "postgres" if os.environ.get("DATABASE_URL", "").startswith(("postgres://", "postgresql://")) else "sqlite"
    source_value = args.sqlite or args.postgres or os.environ.get("DATABASE_URL")
    if not source_value:
        print("error: provide --sqlite PATH, --postgres URL, or a PostgreSQL DATABASE_URL", file=sys.stderr)
        return 2
    connection = None
    try:
        if source_kind == "sqlite":
            if not os.path.exists(source_value):
                raise RuntimeError(f"SQLite database does not exist: {source_value}")
            connection = sqlite3.connect(f"file:{os.path.abspath(source_value)}?mode=ro", uri=True)
            report = run_checks(source_kind, connection, args.strict)
        else:
            report = run_checks(source_kind, source_value, args.strict)
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    finally:
        if connection is not None:
            connection.close()
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_text(report)
    return 1 if report["exit_status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
