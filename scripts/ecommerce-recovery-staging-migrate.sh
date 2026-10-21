#!/usr/bin/env bash
# One-shot operator-only staging migration: fresh BACKUP, full RESTORE, then DDL.
set -Eeuo pipefail
fail(){ echo "RECOVERY_STAGING_MIGRATION_BLOCKED: $1" >&2; exit 1; }
test "${RAILWAY_PROJECT_ID:-}" = "1d22ff35-a259-4977-9375-377dda1cdd2b" || fail wrong_project
test "${RAILWAY_ENVIRONMENT_ID:-}" = "43e4c163-6da9-4be5-ad93-0a3534234613" || fail wrong_environment
test "${RAILWAY_ENVIRONMENT_NAME:-}" = staging || fail production_forbidden
test -n "${RECOVERY_MIGRATION_JOB_SERVICE_ID:-}" || fail dedicated_job_unset
test "${RAILWAY_SERVICE_ID:-}" = "$RECOVERY_MIGRATION_JOB_SERVICE_ID" || fail not_dedicated_job
test "${RECOVERY_MIGRATION_APPROVAL:-}" = "backup_restore_verified_then_apply_five_20261020_migrations" || fail approval_absent
test "${PGDATABASE:-}" = railway || fail wrong_db
case "${PGHOST:-}" in *.railway.internal) ;; *) fail wrong_host ;; esac
test -n "${PGUSER:-}" && test -n "${PGPASSWORD:-}" && test -n "${PGPORT:-}" || fail db_ref_incomplete
backup_dir="${RECOVERY_BACKUP_PATH:-/backup}"
test -d "$backup_dir" && test -w "$backup_dir" || fail backup_volume_missing
dir="${RECOVERY_MIGRATION_DIR:-migrations}"
files=(20261020_ecommerce_abandoned_checkout_observations.sql
  20261020_ecommerce_checkout_recovery_intents.sql
  20261020_ecommerce_whatsapp_recovery_delivery.sql
  20261020_ecommerce_recovery_signed_inbound_consent.sql
  20261020_ecommerce_recovery_meta_receipts.sql)
for f in "${files[@]}"; do test -f "$dir/$f" || fail "migration_missing_$f"; done
export PGCONNECT_TIMEOUT=8 PGOPTIONS="-c statement_timeout=30000"
pg=(-h "$PGHOST" -p "$PGPORT" -U "$PGUSER")
psql=(-X -q -v ON_ERROR_STOP=1 "${pg[@]}" -d "$PGDATABASE")
test "$(psql "${psql[@]}" -Atc 'SELECT current_database()')" = railway || fail target_unverified
test "$(psql "${psql[@]}" -Atc "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.contacts') IS NOT NULL AND to_regclass('public.ecommerce_growth_order_task_schedule') IS NOT NULL")" = t || fail staging_schema_missing
test "$(psql "${psql[@]}" -Atc 'SELECT pg_is_in_recovery()')" = f || fail readonly_db
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/ecommerce_recovery_before_$stamp.dump"
echo RECOVERY_FRESH_BACKUP_BEGIN
pg_dump -Fc "${pg[@]}" -d "$PGDATABASE" -f "$file"
test -s "$file" && pg_restore --list "$file" >/dev/null || fail invalid_dump
verify_db="recovery_verify_$stamp"
verify_db="${verify_db,,}"
verify_created=0
cleanup(){ if test "$verify_created" = 1; then dropdb "${pg[@]}" --if-exists "$verify_db" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
createdb "${pg[@]}" -T template0 "$verify_db" || fail verify_db_create_failed
verify_created=1
pg_restore -e --no-owner --no-acl "${pg[@]}" -d "$verify_db" "$file" >/dev/null || fail restore_failed
test "$(psql -X -q -v ON_ERROR_STOP=1 "${pg[@]}" -d "$verify_db" -Atc "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.contacts') IS NOT NULL")" = t || fail restored_schema_missing
dropdb "${pg[@]}" "$verify_db" || fail verify_db_drop_failed
verify_created=0
echo RECOVERY_FRESH_BACKUP_RESTORE_VERIFIED
before="$(psql "${psql[@]}" -Atc "SELECT (SELECT count(*) FROM users)::text || ',' || (SELECT count(*) FROM contacts)::text")"
echo RECOVERY_STAGING_DDL_BEGIN
psql "${psql[@]}" --single-transaction \
  -f "$dir/${files[0]}" -f "$dir/${files[1]}" -f "$dir/${files[2]}" \
  -f "$dir/${files[3]}" -f "$dir/${files[4]}" >/dev/null
test "$(psql "${psql[@]}" -Atc "SELECT
to_regclass('public.ecommerce_abandoned_checkout_observations') IS NOT NULL AND
to_regclass('public.ecommerce_checkout_recovery_intents') IS NOT NULL AND
to_regclass('public.ecommerce_whatsapp_recovery_consents') IS NOT NULL AND
to_regclass('public.ecommerce_checkout_recovery_outbox') IS NOT NULL AND
EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ecommerce_whatsapp_recovery_consents' AND column_name='last_verified_inbound_at') AND
EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ecommerce_checkout_recovery_outbox' AND column_name='meta_delivery_status')")" = t || fail migration_verification_failed
after="$(psql "${psql[@]}" -Atc "SELECT (SELECT count(*) FROM users)::text || ',' || (SELECT count(*) FROM contacts)::text")"
test "$before" = "$after" || fail existing_record_counts_changed
echo "RECOVERY_STAGING_MIGRATION_VERIFIED backup=$(basename "$file") restored=true messages_sent=false"
