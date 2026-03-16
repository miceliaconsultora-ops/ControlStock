---
name: offline-sync-engine
description: Manages MasterData storage and retrieval. Use when defining the sync flow from Google Sheets to local SQLite for the ~20k articles.
---

# Offline Sync Engine

## When to use this skill
- Implementing the initial app startup sync.
- Writing the bulk insert logic for ~20,000 records.
- Creating the "Force Sync" mechanic.

## Workflow
- Verify local database version/timestamp vs remote trigger.
- Download CSV/JSON from Google Sheets.
- Process data in chunks.
- Open SQLite transaction (`db.transaction()`).
- Insert/Replace records into `master_stock` table.
- Close transaction.

## Instructions
- **Do not block the Main Thread**. If possible, use web workers or async batching when parsing the 20k rows.
- Use `expo-sqlite` asynchronous API (`execAsync` or transaction blocks).
- Provide progress feedback to the UI (e.g., "Syncing: 50%").
- Ensure the table `master_stock` has an index on `id_barra`.

## Resources
- Table schema resides in `SYSTEM_INTEGRITY.md` / `gemini.md`.
