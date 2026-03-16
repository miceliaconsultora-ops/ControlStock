# Project Constitution (gemini.md)

## North Star
Industrial Stock Control MVP: A robust, offline-first barcode scanning application.

## Source of Truth
Local SQLite DB (`expo-sqlite`) holds the definitive state of truth.
Google Sheets/CSV serves as an external read-only master catalog.

## Behavioral Rules
- **Data Integrity Over Everything**: No duplicate scans in the same session. Atomic JSON exports.
- **Offline-First**: Scanning works flawlessly regardless of network status.
- **Performance**: Hydration of items must not block the Main Thread (use SQLite transactions). Search is optimized with indexes.

## Data Schemas (JSON Payload)

### Input/Import Schema (Master Articles CSV/Sheet)
- `id_barra`: string (PK)
- `cod_articulo`: string
- `descripcion`: string
- `peso_nominal`: number
- `color`: string

### Delivery Payload Schema (Shared via Email)
```json
{
  "header": {
    "device_id": "string",
    "user": "string",
    "session_id": "string",
    "timestamp": "ISO8601"
  },
  "summary": [
    {
      "cod_articulo": "string",
      "total_units": "number",
      "total_weight": "number"
    }
  ],
  "raw_data": [
    {
      "id_barra": "string",
      "cod_articulo": "string",
      "peso": "number",
      "color": "string"
    }
  ]
}
```
