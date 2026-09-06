#!/bin/sh
# Disposable local/CI bootstrap only. Admission is enforced before container start.
set -eu
umask 077
PATH=/opt/postgresql/bin:/bin
LC_ALL=C
TZ=UTC
export PATH LC_ALL TZ

fail() {
    printf 'postgres bootstrap: %s\n' "$1" >&2
    exit 1
}

[ "$(id -u)" = 70 ] && [ "$(id -g)" = 70 ] || fail unexpected_user
[ "${PGDATA:-/var/lib/postgresql/data}" = /var/lib/postgresql/data ] || fail unexpected_data_path
PGDATA=/var/lib/postgresql/data
export PGDATA
[ "$#" -ge 1 ] && [ "$1" = postgres ] || fail unsupported_command
shift
[ -d "$PGDATA" ] && [ ! -L "$PGDATA" ] || fail invalid_data_directory
[ -d /run/postgresql ] && [ ! -L /run/postgresql ] || fail invalid_runtime_directory

# libpq must not discover an ambient service, passfile, option, or TLS override.
unset PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE \
    PGGSSENCMODE PGGSSLIB PGHOST PGHOSTADDR PGKRBSRVNAME PGLOADBALANCEHOSTS \
    PGOPTIONS PGPASSFILE PGPASSWORD PGPORT PGREQUIREAUTH PGREQUIREPEER \
    PGSERVICE PGSERVICEFILE PGSYSCONFDIR PGSSLCERT PGSSLCOMPRESSION PGSSLCRL \
    PGSSLCRLDIR PGSSLKEY PGSSLMAXPROTOCOLVERSION PGSSLMINPROTOCOLVERSION \
    PGSSLMODE PGSSLNEGOTIATION PGSSLROOTCERT PGTARGETSESSIONATTRS PGUSER

roles_sha=807d591779783d83ea0c4759d58076101db672a9d4fb93a95d754026aedd222a
marker="$PGDATA/.hedefora-bootstrap-v1"
marker_profile="postgresql=17.11;database=hedefora_dev;roles=$roles_sha;locale=builtin:C.UTF-8"
cluster_identifier() {
    [ -d "$PGDATA/global" ] && [ ! -L "$PGDATA/global" ] || fail invalid_cluster_control
    [ -f "$PGDATA/global/pg_control" ] && [ ! -L "$PGDATA/global/pg_control" ] || fail invalid_cluster_control
    control=$(pg_controldata -D "$PGDATA" 2>&1) || fail invalid_cluster_control
    # pg_controldata may print a CRC warning while returning zero.
    case "$control" in *WARNING:*|*FATAL:*|*ERROR:*|*warning:*|*fatal:*|*error:*) fail invalid_cluster_control ;; esac
    identifier=$(printf '%s\n' "$control" | awk '/^Database system identifier:/ { print $NF; count++ } END { if (count != 1) exit 1 }') || fail invalid_cluster_identity
    case "$identifier" in ''|*[!0-9]*) fail invalid_cluster_identity ;; esac
    [ "${#identifier}" -le 20 ] || fail invalid_cluster_identity
    printf '%s' "$identifier"
}
contents=$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit) || fail data_inventory_failed

if [ -n "$contents" ]; then
    [ -f "$marker" ] && [ ! -L "$marker" ] || fail incomplete_or_foreign_cluster
    [ "$(wc -c < "$marker")" -le 512 ] || fail invalid_bootstrap_marker
    [ -f "$PGDATA/PG_VERSION" ] && [ ! -L "$PGDATA/PG_VERSION" ] || fail invalid_cluster_version
    [ "$(wc -c < "$PGDATA/PG_VERSION")" -eq 3 ] || fail invalid_cluster_version
    [ "$(cat "$PGDATA/PG_VERSION")" = 17 ] || fail incompatible_cluster_version
    identity=$(cluster_identifier) || fail invalid_cluster_identity
    [ "$(cat "$marker")" = "$marker_profile;systemIdentifier=$identity" ] || fail incompatible_bootstrap_marker
else
    # initdb's password file accepts one line. Bound all synthetic inputs before
    # any cluster write; no value appears in process arguments or diagnostics.
    newline='
'
    carriage_return=$(printf '\r')
    validate_password() {
        [ "${#1}" -ge 12 ] && [ "${#1}" -le 1024 ] || fail invalid_local_credentials
        case "$1" in
            *"$newline"*|*"$carriage_return"*) fail invalid_local_credentials ;;
        esac
    }
    validate_password "${HEDEFORA_DEV_POSTGRES_PASSWORD:-}"
    validate_password "${HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD:-}"
    validate_password "${HEDEFORA_DEV_POSTGRES_APP_PASSWORD:-}"
    validate_password "${HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD:-}"
    export HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD HEDEFORA_DEV_POSTGRES_APP_PASSWORD HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD

    temporary=$(mktemp -d /run/postgresql/bootstrap.XXXXXX) || fail temporary_directory_failed
    server_may_be_running=false
    cleanup() {
        result=$?
        trap - EXIT HUP INT TERM
        if [ "$server_may_be_running" = true ] && [ -f "$PGDATA/postmaster.pid" ]; then
            if ! pg_ctl -D "$PGDATA" -m immediate -w -t 5 stop >/dev/null 2>&1; then
                printf 'postgres bootstrap: cleanup_stop_failed\n' >&2
                result=1
            fi
        fi
        if ! rm -f "$temporary/password" "$temporary/roles.sql" "$temporary/server.log"; then
            result=1
        fi
        if ! rmdir "$temporary"; then result=1; fi
        exit "$result"
    }
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM
    [ -f /docker-entrypoint-initdb.d/010_roles.sql ] && [ ! -L /docker-entrypoint-initdb.d/010_roles.sql ] || fail invalid_roles_input
    cp /docker-entrypoint-initdb.d/010_roles.sql "$temporary/roles.sql" || fail roles_snapshot_failed
    printf '%s  %s\n' "$roles_sha" "$temporary/roles.sql" | sha256sum -c - >/dev/null 2>&1 || fail roles_checksum_mismatch
    printf '%s\n' "$HEDEFORA_DEV_POSTGRES_PASSWORD" > "$temporary/password"
    initdb --pgdata="$PGDATA" --username=hedefora_dev \
        --pwfile="$temporary/password" --auth-local=scram-sha-256 \
        --auth-host=scram-sha-256 --data-checksums --encoding=UTF8 \
        --locale=C.UTF-8 --locale-provider=builtin --no-clean \
        >/dev/null 2>&1 || fail initdb_failed
    rm -f "$temporary/password" || fail password_cleanup_failed
    server_may_be_running=true
    pg_ctl -D "$PGDATA" -w -t 30 -l "$temporary/server.log" \
        -o "-c listen_addresses='' -c unix_socket_directories='$temporary' -c unix_socket_permissions=0700 -c password_encryption=scram-sha-256 -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0" \
        start >/dev/null 2>&1 || fail temporary_server_failed
    PGPASSWORD=$HEDEFORA_DEV_POSTGRES_PASSWORD
    export PGPASSWORD
    psql -X -w -q --host="$temporary" --port=5432 --username=hedefora_dev \
        --dbname=postgres --set=ON_ERROR_STOP=1 \
        --command='CREATE DATABASE hedefora_dev OWNER hedefora_dev;' \
        >/dev/null 2>&1 || fail database_creation_failed
    psql -X -w -q --host="$temporary" --port=5432 --username=hedefora_dev \
        --dbname=hedefora_dev --set=ON_ERROR_STOP=1 --file="$temporary/roles.sql" \
        >/dev/null 2>&1 || fail role_bootstrap_failed
    unset PGPASSWORD
    pg_ctl -D "$PGDATA" -m fast -w -t 30 stop >/dev/null 2>&1 || fail temporary_stop_failed
    server_may_be_running=false
    # Local admin sockets still require SCRAM; remote connections require TLS.
    printf '%s\n' \
        'local all all scram-sha-256' \
        'hostssl all all 0.0.0.0/0 scram-sha-256' \
        'hostssl all all ::/0 scram-sha-256' \
        'hostnossl all all 0.0.0.0/0 reject' \
        'hostnossl all all ::/0 reject' > "$PGDATA/pg_hba.conf"
    rm -f "$temporary/roles.sql" "$temporary/server.log" || fail temporary_cleanup_failed
    rmdir "$temporary" || fail temporary_cleanup_failed
    trap - EXIT HUP INT TERM
    identity=$(cluster_identifier) || fail invalid_cluster_identity
    marker_temporary=$(mktemp "$PGDATA/.hedefora-bootstrap.XXXXXX") || fail marker_creation_failed
    printf '%s\n' "$marker_profile;systemIdentifier=$identity" > "$marker_temporary"
    mv -f "$marker_temporary" "$marker" || fail marker_creation_failed
fi

unset HEDEFORA_DEV_POSTGRES_PASSWORD HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD \
    HEDEFORA_DEV_POSTGRES_APP_PASSWORD HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD
# Explicit server options supplied by the isolated harness may configure TLS.
# Fixed trailing values preserve the data path, SCRAM and log redaction boundary.
exec /opt/postgresql/bin/postgres "$@" -D "$PGDATA" \
    -c "data_directory=$PGDATA" -c "hba_file=$PGDATA/pg_hba.conf" \
    -c 'listen_addresses=*' -c unix_socket_directories=/run/postgresql \
    -c unix_socket_permissions=0700 -c password_encryption=scram-sha-256 \
    -c log_statement=none -c log_min_error_statement=panic \
    -c log_parameter_max_length_on_error=0
