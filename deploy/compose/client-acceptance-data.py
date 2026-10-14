#!/usr/bin/env python3
"""Prepare, preview, remove and verify one disposable live acceptance tenant.

Run on the deployment host via SSH stdin. Never prints credentials or row data.
The public browser suite must not run until prepare has completed.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

MODE, RUN_ID = sys.argv[1:]
assert MODE in {"prepare", "plan", "cleanup", "verify"}
assert re.fullmatch(r"\d{8}t\d{6}-[a-f0-9]{6}", RUN_ID)
ROOT = Path("/opt/weaver")
BACKUP = ROOT / "backups" / f"client-acceptance-{RUN_ID}"
PG = ["docker", "exec", "-i", "weaver-live-postgres-1"]
os.umask(0o077)


def query(sql):
    return subprocess.check_output(
        [*PG, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "weaver", "-d", "weaver", "-At"],
        input=sql, text=True, stderr=subprocess.PIPE,
    ).strip()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    assert re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", value)
    return '"' + value + '"'


def snapshot():
    tables = json.loads(query("SELECT coalesce(json_agg(json_build_array(table_schema,table_name) ORDER BY table_schema,table_name),'[]') FROM information_schema.tables WHERE table_type='BASE TABLE' AND (table_schema='public' OR table_schema LIKE 'tenant\\_%' ESCAPE '\\') AND table_name <> 'refresh_sessions';"))
    result = {}
    for schema, table in tables:
        data = query(f"SELECT coalesce(jsonb_agg(row_data ORDER BY row_data::text),'[]') FROM (SELECT to_jsonb(t) row_data FROM {ident(schema)}.{ident(table)} t) rows;")
        result[f"{schema}.{table}"] = {"rows": len(json.loads(data)), "sha256": hashlib.sha256(data.encode()).hexdigest()}
    return result


def dump(path):
    assert not path.exists()
    with path.open("wb") as output:
        subprocess.run([*PG, "pg_dump", "-U", "weaver", "-d", "weaver", "-Fc"], stdout=output, check=True)
    with path.open("rb") as source:
        subprocess.run([*PG, "pg_restore", "-l"], stdin=source, stdout=subprocess.DEVNULL, check=True)


if MODE == "prepare":
    assert not BACKUP.exists(), "Use a new run ID"
    revision = (ROOT / "current/DEPLOYED_REVISION").read_text().strip()
    config = json.loads(subprocess.check_output(["docker", "inspect", "weaver-live-api-1"]))[0]
    assert "ALLOW_TENANT_SCHEMA_BOOTSTRAP=true" in config["Config"]["Env"], "Tenant bootstrap is disabled; do not change live configuration for this test"
    manifest = {
        "runId": RUN_ID, "baseUrl": "https://weaver.usercore.com", "revision": revision,
        "slug": f"acceptance-{RUN_ID}", "orgName": f"Disposable client acceptance {RUN_ID}",
        "accounts": {name: f"acceptance-{name}-{RUN_ID}@example.invalid" for name in ["owner", "staff", "client", "viewer"]},
        "backup": str(BACKUP),
    }
    emails = ",".join(literal(email) for email in manifest["accounts"].values())
    assert query(f"SELECT count(*) FROM public.users WHERE email IN ({emails});") == "0"
    assert query(f"SELECT count(*) FROM public.tenants WHERE slug={literal(manifest['slug'])};") == "0"
    assert query(f"SELECT count(*) FROM information_schema.schemata WHERE schema_name={literal('tenant_' + manifest['slug'].replace('-', '_'))};") == "0"
    BACKUP.mkdir(mode=0o700)
    (BACKUP / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    before = snapshot()
    (BACKUP / "baseline.json").write_text(json.dumps(before, indent=2) + "\n")
    dump(BACKUP / "database-before.dump")
    print(json.dumps({"prepared": True, "manifest": manifest, "existing_tables_fingerprinted": len(before), "database_backup_bytes": (BACKUP / "database-before.dump").stat().st_size, "planned_additions": {"organizations": 1, "accounts": 4, "private_projects": 3}, "inverse": "Remove only the new organization schema, its cascading public records, four exact new user emails, and synthetic uploaded files"}))
    sys.exit(0)

manifest = json.loads((BACKUP / "manifest.json").read_text())
assert manifest["runId"] == RUN_ID
assert manifest["baseUrl"] == "https://weaver.usercore.com"
emails = ",".join(literal(email) for email in manifest["accounts"].values())
tenants = json.loads(query(f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,slug,schema_name FROM public.tenants WHERE slug={literal(manifest['slug'])}) t;"))
assert len(tenants) <= 1
users = json.loads(query(f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,email FROM public.users WHERE email IN ({emails})) t;"))
assert len(users) <= 4
user_ids = ",".join(literal(user["id"]) for user in users) or "NULL"
tenant = tenants[0] if tenants else None
if tenant:
    assert tenant["schema_name"] == 'tenant_' + manifest['slug'].replace('-', '_')
    assert query(f"SELECT count(*) FROM public.tenant_memberships WHERE tenant_id={literal(tenant['id'])} AND user_id NOT IN ({user_ids});") == "0", "Unexpected person joined the test organization"
assert query(f"SELECT count(*) FROM public.tenant_memberships WHERE user_id IN ({user_ids})" + (f" AND tenant_id <> {literal(tenant['id'])}" if tenant else "") + ";") == "0", "Test account has unrelated membership"
counts, files = {}, []
if tenant:
    schema = tenant["schema_name"]
    tables = json.loads(query(f"SELECT coalesce(json_agg(table_name ORDER BY table_name),'[]') FROM information_schema.tables WHERE table_schema={literal(schema)} AND table_type='BASE TABLE';"))
    for table in tables:
        counts[table] = int(query(f"SELECT count(*) FROM {ident(schema)}.{ident(table)};"))
    if "attachments" in tables:
        files = json.loads(query(f"SELECT coalesce(json_agg(storage_key),'[]') FROM {ident(schema)}.attachments;"))
    if "attachment_cleanup" in tables:
        files += json.loads(query(f"SELECT coalesce(json_agg(storage_key),'[]') FROM {ident(schema)}.attachment_cleanup;"))
    for key in files:
        assert re.fullmatch(r"[a-f0-9-]{36}", key), "Unexpected storage key"
plan = {"organization_count": len(tenants), "user_count": len(users), "tenant_id": tenant["id"] if tenant else None, "user_ids": [u["id"] for u in users], "slug": manifest["slug"], "tenant_tables": counts, "synthetic_upload_count": len(set(files))}
if MODE == "plan":
    (BACKUP / "cleanup-plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    print(json.dumps(plan))
elif MODE == "cleanup":
    assert (BACKUP / "cleanup-plan.json").exists(), "Preview cleanup first"
    assert json.loads((BACKUP / "cleanup-plan.json").read_text()) == plan, "Test data changed since cleanup preview"
    dump(BACKUP / "database-before-cleanup.dump")
    (BACKUP / "upload-keys.json").write_text(json.dumps(sorted(set(files))) + "\n")
    upload_backup = BACKUP / "synthetic-uploads"
    upload_backup.mkdir(exist_ok=True)
    for key in set(files):
        copied = subprocess.run(["docker", "cp", f"weaver-live-api-1:/tmp/weaver-uploads/{key}", str(upload_backup / key)], capture_output=True)
        if copied.returncode:
            raise RuntimeError("Cannot quarantine synthetic upload; no database cleanup applied")
    if files:
        node = "const fs=require('fs'); const keys=JSON.parse(fs.readFileSync(0,'utf8')); for(const key of keys){if(!/^[a-f0-9-]{36}$/.test(key))throw Error('key');fs.unlinkSync('/tmp/weaver-uploads/'+key)}"
        subprocess.run(["docker", "exec", "-i", "weaver-live-api-1", "node", "-e", node], input=json.dumps(list(set(files))), text=True, check=True)
    sql = "BEGIN; SET LOCAL lock_timeout='5s';\n"
    if tenant:
        sql += f"DROP SCHEMA {ident(tenant['schema_name'])} CASCADE;\nDELETE FROM public.tenants WHERE id={literal(tenant['id'])} AND slug={literal(manifest['slug'])};\n"
    sql += f"DELETE FROM public.users WHERE id IN ({user_ids}) AND email IN ({emails});\nCOMMIT;"
    query(sql)
    (BACKUP / "cleanup-applied.json").write_text(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"cleanup_applied": True, **plan}))
else:
    assert not tenants and not users, "Disposable records remain"
    before = json.loads((BACKUP / "baseline.json").read_text())
    after = snapshot()
    changed = [name for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]
    assert query(f"SELECT count(*) FROM public.organization_invitations WHERE email IN ({emails});") == "0", "Test invitations remain"
    assert query(f"SELECT count(*) FROM information_schema.schemata WHERE schema_name={literal('tenant_' + manifest['slug'].replace('-', '_'))};") == "0", "Test schema remains"
    applied = json.loads((BACKUP / "cleanup-applied.json").read_text())
    removed_user_ids = ",".join(literal(value) for value in applied["user_ids"]) or "NULL"
    assert query(f"SELECT count(*) FROM public.refresh_sessions WHERE user_id IN ({removed_user_ids});") == "0", "Test refresh sessions remain"
    upload_keys = json.loads((BACKUP / "upload-keys.json").read_text())
    node = "const fs=require('fs');const keys=JSON.parse(fs.readFileSync(0,'utf8'));if(keys.some(key=>!/^[a-f0-9-]{36}$/.test(key)))throw Error('key');process.stdout.write(String(keys.filter(key=>fs.existsSync('/tmp/weaver-uploads/'+key)).length));"
    remaining_files = int(subprocess.check_output(["docker", "exec", "-i", "weaver-live-api-1", "node", "-e", node], input=json.dumps(upload_keys), text=True))
    assert remaining_files == 0, "Test upload files remain"
    result = {"disposable_organizations_remaining": 0, "disposable_users_remaining": 0, "disposable_sessions_remaining": 0, "synthetic_upload_files_remaining": remaining_files, "existing_tables_checked": len(before), "existing_tables_changed": changed, "existing_data_unchanged": not changed}
    (BACKUP / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    assert not changed, "Existing data changed; inspect hashes without exposing row contents"
