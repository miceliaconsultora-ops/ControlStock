---
name: industrial-export-handler
description: Generates the strict atomic JSON payload and triggers OS Share Sheet. Use when finalizing a session.
---

# Industrial Export Handler

## When to use this skill
- User taps "Finalize Session".
- Generating the JSON payload defined in the system integrity rules.
- Sharing the file via Email or other OS apps.
- Purging the session after a successful export.

## Workflow
- Confirm finalization with the user.
- Generate atomic JSON structure (Header, Summary, Raw Data).
- Write JSON to a local temporary file using `expo-file-system`.
- Trigger `expo-sharing` (Share Sheet) to export the file.
- If sharing is confirmed successful, delete the session data from `session_scans`.

## Instructions
- The JSON output must strictly match the `Delivery Payload Schema` in `gemini.md`.
- Failure in the Share Sheet must *not* purge the session. Only atomic success allows deletion.
- Filename should indicate the session and timestamp (e.g., `Export_Lote_{sessionID}.json`).

## Resources
- `SYSTEM_INTEGRITY.md` for JSON shape.
