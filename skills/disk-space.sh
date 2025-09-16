#!/bin/bash
# Shell script to check disk space and cleanup aged temporary files on Unix-like systems
set -euo pipefail

get_disk_stats() {
  df -Pk / | awk 'NR==2 {printf "{\"filesystem\":\"%s\",\"sizeKB\":%s,\"usedKB\":%s,\"availableKB\":%s,\"usedPercent\":%s}", $1,$2,$3,$4,$5}'
}

cleanup_temp() {
  local threshold_percent="$1"
  local used_percent
  used_percent=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')

  if [ "$used_percent" -lt "$threshold_percent" ]; then
    echo '{"cleanupTriggered":false,"paths":[]}'
    return 0
  fi

  local timestamp backup_root tmp_summary
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  backup_root="/tmp/wtc-disk-cleanup-$timestamp"
  mkdir -p "$backup_root"

  local paths=("/tmp" "${TMPDIR:-/var/tmp}")
  local cleaned_paths=()

  for path in "${paths[@]}"; do
    [ -d "$path" ] || continue
    # Remove files older than 7 days; ignore errors for permission denied
    find "$path" -type f -mtime +7 -print0 2>/dev/null | while IFS= read -r -d '' file; do
      rm -f "$file" 2>/dev/null || true
    done
    cleaned_paths+=("\"$path\"")
  done

  tmp_summary="{\"cleanupTriggered\":true,\"paths\":[${cleaned_paths[*]}]}"
  echo "$tmp_summary"
}

main() {
  local disk_json cleanup_json
  disk_json=$(get_disk_stats)
  cleanup_json=$(cleanup_temp 85)
  printf 'SUCCESS: {"timestampUtc":"%s","disk":%s,"cleanup":%s}\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$disk_json" "$cleanup_json"
}

if ! main; then
  echo "ERROR: Failed to gather disk statistics or cleanup"
  exit 1
fi
