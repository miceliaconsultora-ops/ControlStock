# B.L.A.S.T Project Progress

- [x] Initialized B.L.A.S.T memory files.
- [x] Created `task_plan.md`, `findings.md`, `gemini.md`.
- [x] Initialized 5 required skills using the Skill Creator format inside `.agents/skills/`.
- [x] Database Schema configuration implemented for MVP.
- [x] UI implementation completed for MVP.

## V2 Progress

- [x] Documented V2 blueprint in `docs/v2_blueprint.md`.
- [x] Added persistent `sessions`, `scan_events`, `delivery_plan_items`, and `export_outbox` tables.
- [x] Added delivery plan CSV parsing and local sync service.
- [x] Added common scan workflow for preparation and delivery modes.
- [x] Updated Dashboard with two workflows: preparation and prepared delivery.
- [x] Updated Scanner to route scans by mode.
- [x] Updated Review to aggregate preparation by article/color and delivery by client.
- [x] Added delivery export generation: one JSON payload per client.
- [x] Replaced destructive purge flow with session status updates and outbox history.
- [x] Added Apps Script support for `dataset=delivery` using a configurable delivery CSV folder.
- [x] Removed delivery instance/truck selection from the delivery flow.
- [x] Delivery now records the factual loaded/scanned rolls and groups them by client.
- [x] Added `load_id` to delivery sessions and delivery payload items.
- [x] Marked exported delivery manifests as consumed so the same prepared sheet cannot be reused locally.
- [x] Verified TypeScript with `npx tsc --noEmit`.
- [x] Verified web bundle with `npx expo export --platform web`.

## V2.1 Progress - Envio por cliente y cierre de carga

- [x] Banner "Cliente completo - Enviar" en el Scanner (modo entrega): aparece
      cuando se escanearon todos los rollos planeados de un cliente.
- [x] Envio individual del JSON de ese cliente con un toque
      (`exportDeliveryClient`).
- [x] Buffer persistente de clientes ya enviados usando `export_outbox`
      (`status='uploaded'`), via `getSentDeliveryClientIds`.
- [x] `exportDeliverySession` saltea los clientes ya enviados individualmente.
- [x] Auto-finalizacion (`maybeAutoFinalizeDelivery`): cuando todos los clientes
      del plan estan completos Y subidos, cierra la sesion y marca la planilla
      consumida sin requerir "Exportar entrega".
- [x] Manejo de fallo de subida: si el envio individual no llega a Drive, queda
      compartido localmente y el banner se mantiene para reintentar (no cierra
      la carga con algo sin subir).
- [x] Verificado TypeScript (`npx tsc --noEmit`) y probado en preview web
      (http://localhost:8082) con el plan de prueba de 4 clientes. Funciona OK.
