#!/bin/bash
# Shell script to check disk space (Unix/Linux/macOS)

try {
    # Get disk space information using df command
    disk_info=$(df -h / | awk 'NR==2 {print $2 " " $3 " " $4 " " $5}')

    # Parse the output
    total=$(echo $disk_info | cut -d' ' -f1)
    used=$(echo $disk_info | cut -d' ' -f2)
    free=$(echo $disk_info | cut -d' ' -f3)
    percent=$(echo $disk_info | cut -d' ' -f4 | tr -d '%')

    # Create JSON output
    echo "SUCCESS: {\"total\": \"$total\", \"used\": \"$used\", \"free\": \"$free\", \"freePercent\": $percent}"
} catch {
    echo "ERROR: Failed to get disk space information"
    exit 1
}