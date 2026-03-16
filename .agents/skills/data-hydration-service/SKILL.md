---
name: data-hydration-service
description: Handles local lookup of scanned IDs. Use when processing a raw scan to assign article code, weight, and color from the master table.
---

# Data Hydration Service

## When to use this skill
- Post-processing a successful barcode scan.
- Updating the `session_scans` table with status 'hydrated', 'pending' or 'error'.
- Querying `master_stock` by `id_barra`.

## Workflow
- Receive new `id_barra`.
- Query `master_stock` for matching `id_barra`.
- If found: Update scan status to `hydrated` and fetch metadata (weight, color, article code).
- If not found: Mark scan status as `pending` (unresolved) for post-processing.
- Update UI state to reflect hydration status (Green for hydrated, Yellow for pending).

## Instructions
- Ensure queries are fast by leveraging the primary key/index on `id_barra`.
- Hydration should happen reactively, not blocking the next scan.
- Unresolved items must still be exportable or clearly flagged in the Review Screen.

## Resources
- Schema guidelines found in `SYSTEM_INTEGRITY.md`.
