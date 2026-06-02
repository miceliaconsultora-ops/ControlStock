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
- [x] Define `gemini.md` (Project Constitution).
- [x] Create Skills under `.agents/skills/`.
- [x] Set up React Native/Expo project.
- [x] Implement `expo-sqlite` database initialization.
- [x] Build UI screens and Services.
- [/] **Phase T: Trigger & Test**
    - [x] Create `assets/master_data.csv` for standalone testing.
    - [ ] Configure `eas.json` for APK builds.
    - [ ] Generate Android APK.

## PASOS A COMPLETAR.
- [x] Modificar el csv con datos textiles.
- [x] Generar códigos de barras escaneables (generate_barcodes.html).
- [x] Integrar cámara web (html5-qrcode) para escaneo en navegador.
- [x] Probar con la cámara de la computadora (cámara web real).
- [x] Agrupar por cod_articulo y color.
- [x] Revisar la descarga y el payload.
- [x] Configurar eas.json para APK builds.
- [ ] Generar el apk y probar en el celular.

## V2 - Preparacion + Entrega

- [x] Definir blueprint de dos modos.
- [x] Mantener preparacion contra stock.
- [x] Agregar entrega contra preparado pendiente por cliente.
- [x] Crear tabla comun de eventos de escaneo.
- [x] Crear tabla de preparado pendiente.
- [x] Crear outbox de exportaciones.
- [x] Generar JSON de preparacion.
- [x] Generar JSON de entrega por cliente.
- [x] Conectar sync real de preparado pendiente con Google Apps Script.
- [ ] Configurar `DELIVERY_FOLDER_ID` real en Apps Script.
- [x] Remover instancia previa del flujo de entrega.
- [x] Registrar entrega factica y agrupar automaticamente por cliente.
- [x] Agregar `load_id` por carga efectiva.
- [x] Bloquear reutilizacion local de una planilla de preparado ya exportada.
- [x] Banner "Cliente completo - Enviar" + envio individual del JSON por cliente.
- [x] Buffer de enviados (`export_outbox`) para no reenviar al finalizar.
- [x] Auto-cierre de la carga cuando todo el plan esta entregado y subido.
- [ ] Probar APK en dispositivo fisico.
- [ ] **Integración con VB6 (Local Bridge)**
    - [ ] Configurar Google Drive para Ordenadores (Desktop) en equipo de prueba.
    - [ ] Crear Script Puente Local (Python/Node.js) para monitorear carpeta local y procesar JSON.
    - [ ] Implementar parser/conversor de JSON a CSV plano en carpeta local de entrada de VB6.
    - [ ] Validar importación de CSV de prueba en VB6.

