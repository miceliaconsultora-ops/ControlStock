# Project Task Plan (B.L.A.S.T - Phase B)

## Goals
- Build an Industrial Stock Control MVP using Expo (React Native).
- Implement robust Offline-First architecture using SQLite.
- Ensure strict Data Integrity (no duplicates, atomic exports).

## Phases
1. **Blueprint**: Define schemas and answer discovery questions.
2. **Link**: Wait for user confirmation, then set up the actual integrations (if any online API is needed, here it's Google Sheets CSV download).
3. **Architect**: Design the 3-layer approach (SQLite interactions, UI logic, Sync logic). Create .agent/skills as requested.
4. **Stylize**: Build the UI for Scanner and Review screens with Tailwind (NativeWind).
5. **Trigger**: Test local Export via Share Sheet.

## Checklists
- [x] Gather requirements.
- [ ] Define `gemini.md` (Project Constitution).
- [ ] Create Skills under `.agents/skills/`.
- [ ] Set up React Native/Expo project (or write the code into directories).
- [ ] Implement `expo-sqlite` database initialization.
- [ ] Build UI.
