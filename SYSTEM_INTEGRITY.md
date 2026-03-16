# System Integrity & Data Contracts

## Database Schema (SQLite)
- **table: master_stock**
  - id_barra (PK, INDEX)
  - cod_articulo (TEXT)
  - descripcion (TEXT)
  - peso_nominal (REAL)
  - color (TEXT)
  - last_updated (DATETIME)

- **table: session_scans**
  - id_barra (PK)
  - scan_timestamp (DATETIME)
  - session_id (TEXT)
  - status (TEXT: 'hydrated', 'pending', 'error')

## JSON Export Contract
{
  "header": {
    "device_id": string,
    "user": string,
    "session_id": string,
    "timestamp": ISO8601
  },
  "summary": [
    {
      "cod_articulo": string,
      "total_units": number,
      "total_weight": number
    }
  ],
  "raw_data": [
    {
      "id_barra": string,
      "cod_articulo": string,
      "peso": number,
      "color": string
    }
  ]
}

## UI/UX Rules
- Feedback háptico (vibración) en cada escaneo exitoso.
- Alerta visual roja si un código ya fue escaneado en la sesión actual.
- Botón de "Forzar Sincronización de Maestro" protegido por confirmación.