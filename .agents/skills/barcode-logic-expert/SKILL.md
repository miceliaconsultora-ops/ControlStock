---
name: barcode-logic-expert
description: Handles expo-barcode-scanner implementation. Use when building or debugging the device scanner component. Implements 1.5s debounce and duplicate prevention per session.
---

# Barcode Logic Expert

## When to use this skill
- Building the React Native camera/scanner component.
- Implementing scan event handlers.
- Debugging issues with rapid scanning or duplicate inputs.

## Workflow
- Check for existing session ID.
- Verify if `id_barra` was already scanned in current `session_scans`.
- Apply 1.5 seconds debounce between successful scans.
- Trigger haptic feedback on success.
- Trigger visual red alert on duplicate.

## Instructions
1. Use `expo-barcode-scanner` (or `expo-camera` with barcode scanning features for modern SDKs).
2. Store recently scanned IDs in state/ref to instantly block duplicates before querying SQLite.
3. Queue valid scans to be saved into SQLite `session_scans` table.
4. Emit event for data hydration process to take over.

## Resources
- Ensure `expo-haptics` is used for vibration feedback.
