# MVP Skills Package Overview

The MVP skills package ships with a curated set of PowerShell scripts that remediate the highest-volume Windows support issues surfaced in the PRD. Each skill follows the `skill-package-schema.json` contract and is designed to be idempotent, observable, and safe for enterprise deployment.

## Skills Included

| Skill ID | Purpose | Risk Level | Requires Admin | Key Actions |
| --- | --- | --- | --- | --- |
| `wifi-reset` | Restores Wi-Fi connectivity when the adapter is disabled. | Medium | Yes | Enables the Wi-Fi adapter and reports status. |
| `printer-queue-clear` | Resolves stuck print jobs by clearing the spooler queue. | Medium | Yes | Stops the spooler service, deletes spool files, restarts service. |
| `word-file-recovery` | Surfaces AutoRecover files for unsaved Word documents. | Low | No | Enumerates `.asd` files without modifying user content. |
| `app-cache-reset` | Fixes common Teams/Outlook launch issues caused by corrupt caches. | Medium | Yes | Stops running processes, archives caches, recreates fresh directories. |
| `disk-space` | Audits disk space and reclaims aged temporary files when space is low. | Low | No | Collects drive statistics and prunes safe temp locations. |
| `system-info` | Gathers system diagnostics for troubleshooting context. | Low | No | Returns platform, architecture, uptime, and memory usage metrics. |

## Security Considerations

- **No dynamic code execution**: Scripts avoid risky constructs (`Invoke-Expression`, `Add-Type`, etc.).
- **Scoped deletions**: Cleanup scripts operate only on known safe directories and use archival instead of hard deletion where possible.
- **Graceful failure handling**: Errors are surfaced using the `ERROR:` convention so the skills engine can log and escalate appropriately.
- **Idempotency**: All skills can run multiple times without harming system state.

## Output Contract

Every script emits a single line prefixed with `SUCCESS:` or `ERROR:` containing compact JSON payloads that describe the action taken. The Admin Console and offline queue leverage these payloads for observability and audit trails.

## Testing

Acceptance tests live in `src/__tests__/mvp-skills-acceptance.test.ts` and verify:

- Metadata schema compliance for each skill.
- Presence of all referenced scripts.
- Absence of disallowed PowerShell commands.
- Consistent success messaging.

Run the tests with:

```bash
npm test -- mvp-skills-acceptance.test.ts
```

These tests integrate with the wider Jest suite and are executed in CI once Task 12.0 is complete.

## Extending the Package

When adding new skills:

1. Define metadata following `skill-package-schema.json`.
2. Implement PowerShell scripts using the success/error output convention.
3. Update `docs/mvp-skills-package.md` with purpose, risk, and admin requirements.
4. Extend `mvp-skills-acceptance.test.ts` to include the new skill.
5. Ensure any destructive operations either prompt for elevation or use archival safeguards.
