# Skills Directory

This directory houses the troubleshooting skills packaged with the Windows Troubleshooting Companion. Each skill pairs a metadata file with one or more scripts that the skills engine executes within the sandbox.

## Current Skills

| Skill | Description | Script(s) |
| --- | --- | --- |
| `wifi-reset` | Enables a disabled Wi-Fi adapter. | `wifi-reset.ps1` |
| `printer-queue-clear` | Stops the spooler, clears pending jobs, and restarts the service. | `printer-queue-clear.ps1` |
| `word-file-recovery` | Lists Microsoft Word AutoRecover files without altering data. | `word-file-recovery.ps1` |
| `app-cache-reset` | Archives and resets Microsoft Teams and Outlook caches. | `app-cache-reset.ps1` |
| `disk-space` | Collects disk metrics and removes aged files from safe temp locations. | `disk-space.ps1`, `disk-space.sh` |
| `system-info` | Provides baseline system diagnostics. | `system-info.ps1` |

## File Structure

- `{skill-id}.json` — Metadata following `skill-package-schema.json`.
- `{skill-id}.ps1` — PowerShell implementation for Windows endpoints.
- `{skill-id}.sh` — Shell implementation for Unix/macOS endpoints (when applicable).

## Output Convention

Scripts must emit a single line prefixed with `SUCCESS:` or `ERROR:` so the skills engine can parse results reliably. The payload should be compact JSON capturing the relevant context.

## Testing

Acceptance tests for the MVP skills live in `src/__tests__/mvp-skills-acceptance.test.ts`. Run them with:

```bash
npm test -- mvp-skills-acceptance.test.ts
```

## Additional Documentation

Refer to `docs/mvp-skills-package.md` for a high-level overview, security posture, and maintenance guidance for the MVP skills bundle.
