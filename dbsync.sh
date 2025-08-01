#!/bin/bash

# Usage:
# ./dbsync.sh push|pull --local-db <local_db_name> --remote-db <remote_db_name> [--fresh] [--no-user]
# Example:
# ./dbsync.sh push --local-db dev --remote-db gipfelapp --fresh --no-user
# ./dbsync.sh pull --local-db dev --remote-db gipfelapp --no-user

# Reads remote SSH host alias from .env file in the same directory.
# Expected .env key:
# REMOTE_SSH_HOST=your-ssh-config-alias

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"

TMP_DIR="$SCRIPT_DIR/../tmp"
DATE=$(date +%F_%H-%M-%S)

# Load remote SSH host from .env
if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
else
    echo "Missing .env file for remote SSH host info!"
    exit 1
fi

# Check required .env variable
if [[ -z "$REMOTE_SSH_HOST" ]]; then
    echo "Missing REMOTE_SSH_HOST in .env!"
    exit 1
fi

REMOTE="$REMOTE_SSH_HOST"

# Functions
backup_local() {
    mkdir -p "$TMP_DIR"
    mongodump --db "$LOCAL_DB" --out "$TMP_DIR/local_backup_${LOCAL_DB}_$DATE"
}

backup_remote() {
    ssh "$REMOTE" "mkdir -p /tmp && mongodump --db $REMOTE_DB --out /tmp/remote_backup_${REMOTE_DB}_$DATE"
    scp -r "$REMOTE:/tmp/remote_backup_${REMOTE_DB}_$DATE" "$TMP_DIR/"
}

drop_local_db() {
    echo "Dropping local database: $LOCAL_DB"
    mongosh --eval "db.getSiblingDB('$LOCAL_DB').dropDatabase()"
}

drop_remote_db() {
    echo "Dropping remote database: $REMOTE_DB"
    ssh "$REMOTE" "mongosh --eval \"db.getSiblingDB('$REMOTE_DB').dropDatabase()\""
}

restore_local() {
    if [[ "$NO_USER" == "1" ]]; then
        echo "Restoring local database '$LOCAL_DB' without the User collection due to --no-user flag"
        mongorestore --db "$LOCAL_DB" --drop --excludeCollection users "$TMP_DIR/remote_dump_$REMOTE_DB/$REMOTE_DB"
    else
        mongorestore --db "$LOCAL_DB" --drop "$TMP_DIR/remote_dump_$REMOTE_DB/$REMOTE_DB"
    fi
}

restore_remote() {
    if [[ "$NO_USER" == "1" ]]; then
        echo "Restoring remote database '$REMOTE_DB' without the User collection due to --no-user flag"
        scp -r "$TMP_DIR/local_dump_$LOCAL_DB/$LOCAL_DB" "$REMOTE:/tmp/local_dump_$LOCAL_DB"
        ssh "$REMOTE" "mongorestore --db $REMOTE_DB --drop --excludeCollection users /tmp/local_dump_$LOCAL_DB"
    else
        scp -r "$TMP_DIR/local_dump_$LOCAL_DB/$LOCAL_DB" "$REMOTE:/tmp/local_dump_$LOCAL_DB"
        ssh "$REMOTE" "mongorestore --db $REMOTE_DB --drop /tmp/local_dump_$LOCAL_DB"
    fi
}

dump_local() {
    mongodump --db "$LOCAL_DB" --out "$TMP_DIR/local_dump_$LOCAL_DB"
}

dump_remote() {
    ssh "$REMOTE" "mongodump --db $REMOTE_DB --out /tmp/remote_dump_$REMOTE_DB"
    scp -r "$REMOTE:/tmp/remote_dump_$REMOTE_DB" "$TMP_DIR/"
}

# Argument Parsing
MODE="$1"
shift

NO_USER=0

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --local-db)
            LOCAL_DB="$2"
            shift 2
            ;;
        --remote-db)
            REMOTE_DB="$2"
            shift 2
            ;;
        --fresh)
            FRESH=1
            shift
            ;;
        --no-user)
            NO_USER=1
            shift
            ;;
        *)
            echo "Unknown parameter passed: $1"
            exit 1
            ;;
    esac
done

if [[ -z "$MODE" || -z "$LOCAL_DB" || -z "$REMOTE_DB" ]]; then
    echo "Usage: $0 push|pull --local-db <local_db_name> --remote-db <remote_db_name> [--fresh] [--no-user]"
    exit 1
fi

# Main Logic
if [[ "$MODE" == "push" ]]; then
    echo "Pushing local database '$LOCAL_DB' to remote '$REMOTE' as '$REMOTE_DB'"
    backup_local
    dump_local
    if [[ "$FRESH" == "1" ]]; then
        if [[ "$NO_USER" == "1" ]]; then
            echo "Skipping User collection deletion on remote due to --no-user flag"
            ssh "$REMOTE" "mongosh --eval \"db.getSiblingDB('$REMOTE_DB').getCollectionNames().filter(c => c !== 'users').forEach(c => db.getSiblingDB('$REMOTE_DB').getCollection(c).drop())\""
        else
            drop_remote_db
        fi
    fi
    restore_remote
elif [[ "$MODE" == "pull" ]]; then
    echo "Pulling remote database '$REMOTE_DB' from '$REMOTE' to local '$LOCAL_DB'"
    backup_remote
    dump_remote
    if [[ "$FRESH" == "1" ]]; then
        if [[ "$NO_USER" == "1" ]]; then
            echo "Skipping User collection deletion on local due to --no-user flag"
            mongosh --eval "db.getSiblingDB('$LOCAL_DB').getCollectionNames().filter(c => c !== 'users').forEach(c => db.getSiblingDB('$LOCAL_DB').getCollection(c).drop())"
        else
            drop_local_db
        fi
    fi
    restore_local
else
    echo "Invalid mode. Use push or pull."
    exit 1
fi