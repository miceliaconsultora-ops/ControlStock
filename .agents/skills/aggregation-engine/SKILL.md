---
name: aggregation-engine
description: Reactive computation logic for the Review Screen. Use when grouping scanned items by Article ID to sum weights and count units.
---

# Aggregation Engine

## When to use this skill
- Building the "Review Screen" or "Listado de Lote".
- Preparing data for the final JSON export summary.
- Calculating totals per `cod_articulo`.

## Workflow
- Query all `hydrated` scans from the current session.
- Group rows by `cod_articulo`.
- Compute `SUM(peso_nominal)` and `COUNT(id_barra)` per group.
- Compute global totals (Total Units, Total Weight).

## Instructions
- The computation can be done via SQL (`SELECT cod_articulo, COUNT(*), SUM(peso_nominal) FROM session_scans JOIN master_stock ... GROUP BY cod_articulo`) or in memory using JavaScript/TypeScript.
- SQL grouping is preferred for performance.
- Ensure pending/unresolved items are either grouped in an "Unknown" category or filtered with a warning.

## Resources
- Target JSON structure defined in `SYSTEM_INTEGRITY.md` (`summary` array).
