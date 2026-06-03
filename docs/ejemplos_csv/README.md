# Archivos CSV de ejemplo

Plantillas listas para subir a Google Drive y probar la app.
Ver la guía completa en [`../guia_prueba_apk.md`](../guia_prueba_apk.md).

| Archivo | Subir a la carpeta de Drive | Rol |
|---------|-----------------------------|-----|
| `stock_ejemplo.csv` | **Stock maestro** (`1IVLZcxJ5rd9jdNbNolOXhB-1rDBeSuZV`) | Rollos disponibles para la preparación |
| `preparado_ejemplo.csv` | **Preparado pendiente** (`1EkL15uYd-E31Y0uD9R6jLctC4DqLCzy2`) | Planilla de entrega por cliente |

## Notas

- Los dos archivos son **consistentes entre sí**: todos los `id_barra` del
  preparado existen en el stock, así el flujo de entrega funciona de punta a punta.
- `preparado_ejemplo.csv` tiene **3 clientes** (CLI-001, CLI-002, CLI-003) para
  ver el agrupado y el banner "Cliente completo — Enviar".
- Subir como **`.csv` real** (no como Google Sheets). La app toma siempre el CSV
  **más reciente** de cada carpeta.
- Para **re-testear la entrega**, duplicar `preparado_ejemplo.csv` y cambiar
  `manifest_version` (ej. `2026-06-02-002`); la app desbloquea la planilla al
  detectar la versión nueva.
- **Para escanear:** los `id_barra` de estos CSV son códigos EAN-13 reales. Abrir
  `assets/generate_barcodes.html` en el navegador muestra todos los códigos
  textiles listos para escanear con la cámara o imprimir (ver punto 4 de la guía).
