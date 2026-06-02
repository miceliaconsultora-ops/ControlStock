# Blueprint V2 - Control Stock

## Situacion nueva

La aplicacion deja de ser solo una herramienta de preparacion de entrega contra stock. Pasa a tener dos modos de trabajo:

1. Preparacion de entrega: el operario escanea rollos contra el stock actualizado. Cada dispositivo genera un JSON de preparacion.
2. Entrega de preparado: el operario escanea rollos ya preparados, contra una base distinta que contiene rollos asignados a clientes. Cada cierre genera JSON por cliente con lo efectivamente entregado.

La asignacion cliente/rollo no nace dentro de la app en esta version. Ocurre afuera: un supervisor toma los JSON de preparacion, arma preparaciones por cliente y publica una nueva base en Google Sheets. La app se hidrata contra esa base para validar entregas parciales o completas.

## Principio de diseno

Mantener dos maestros separados:

- Maestro de stock: rollos disponibles para preparar.
- Maestro de preparado pendiente: rollos ya separados y asignados a cliente, pendientes de entrega.

La app no debe mezclar ambos estados. El modo elegido define contra que base se valida el escaneo y que payload se genera.

## Modo 1 - Preparacion

Se conserva la logica actual:

- El dispositivo sincroniza stock desde Google Sheets/Drive.
- El operario inicia una sesion de preparacion.
- Cada codigo se valida contra `master_stock`.
- Se bloquean duplicados dentro de la sesion.
- Se genera un JSON de preparacion por dispositivo/operario/sesion.
- El JSON se sube a la carpeta cloud de preparaciones.

Mejoras necesarias para V2:

- Guardar snapshot de los datos hidratados al momento del escaneo, no depender solo del join contra el maestro al exportar.
- Persistir sesiones con estado, no solo usar el `session_id` de navegacion.
- Usar outbox local para exportaciones pendientes/subidas/fallidas.
- No borrar datos hasta tener export confirmado o, como minimo, conservar historial exportado.

## Proceso externo entre modos

Fuera de la app:

- El supervisor consolida todos los JSON de preparacion.
- Asigna rollos a clientes.
- Genera o reemplaza un Google Sheet de preparado pendiente por cliente.
- Cuando una entrega parcial se confirma, el sistema externo resta esos rollos del preparado pendiente y vuelve a publicar el sheet actualizado.

La app solo necesita poder rehidratar ese sheet y validar contra la version vigente.

## Modo 2 - Entrega

La app sincroniza una base de preparado pendiente. Cada fila representa un rollo ya preparado y asignado a un cliente.

Flujo recomendado:

- El operario entra en modo Entrega.
- Sincroniza preparado pendiente desde Google Sheets/Drive.
- Escanea rollos que se cargan o salen.
- La app busca cada `id_barra` en el preparado pendiente.
- Si existe y esta pendiente, lo marca como entregado en la sesion local.
- La app agrupa automaticamente por cliente.
- Al finalizar, genera un JSON por cliente con los rollos efectivamente entregados.
- Al exportar una entrega, la app marca el `manifest_id` + `manifest_version` local como utilizado. No permite iniciar otra entrega contra esa misma planilla hasta sincronizar una nueva version del preparado pendiente.

Este enfoque permite una entrega parcial mezclada: si salen algunos rollos de varios clientes, el operario no necesita cambiar de cliente todo el tiempo. El cliente sale del maestro de preparado pendiente. La app registra el hecho real: que rollos cargaron/salieron y a que cliente pertenecen.

## Estados de escaneo en entrega

Para mantenerlo simple, alcanza con estos estados:

- `delivered`: rollo valido, preparado y registrado en esta entrega.
- `duplicate_session`: rollo ya leido en la misma sesion de entrega.
- `not_prepared`: rollo no existe en el preparado pendiente sincronizado.
- `wrong_client`: solo aplica si el operario esta filtrando por cliente y el rollo pertenece a otro.
- `stale_manifest`: el rollo ya figura entregado localmente o la base parece desactualizada.

## Base de preparado pendiente

Columnas minimas del Google Sheet/CSV:

```csv
manifest_id,manifest_version,cliente_id,cliente_nombre,id_barra,cod_articulo,descripcion,peso_nominal,color
PREP-2026-05-25,1716676239000,CLI-001,Cliente Demo,7790001000011,ALG-BLA,Algodon,12.5,Blanco
```

Campos opcionales utiles:

```csv
preparacion_id,orden_entrega,observaciones,prepared_at
```

`manifest_version` debe venir de la fecha/hash/version del sheet. La app debe incluirlo en cada JSON de entrega para que el proceso externo sepa contra que version se confirmo la salida.

## Modelo SQLite propuesto

Mantener `master_stock`, pero agregar tablas nuevas:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL, -- 'preparation' | 'delivery'
  operator_name TEXT,
  device_id TEXT,
  manifest_id TEXT,
  manifest_version TEXT,
  started_at TEXT NOT NULL,
  closed_at TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS scan_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  id_barra TEXT NOT NULL,
  scan_timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  cliente_id TEXT,
  cliente_nombre TEXT,
  cod_articulo TEXT,
  descripcion TEXT,
  peso_nominal REAL DEFAULT 0,
  color TEXT,
  raw_source TEXT
);

CREATE TABLE IF NOT EXISTS delivery_plan_items (
  id_barra TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  manifest_version TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  cod_articulo TEXT,
  descripcion TEXT,
  peso_nominal REAL DEFAULT 0,
  color TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS export_outbox (
  export_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  cliente_id TEXT,
  file_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | uploaded | failed
  created_at TEXT NOT NULL,
  uploaded_at TEXT,
  error_message TEXT
);
```

Con esto se evita duplicar logica por modo y se deja trazabilidad.

## JSON de preparacion

Puede mantenerse parecido al actual, sumando `kind` y snapshot completo:

```json
{
  "header": {
    "kind": "preparation",
    "device_id": "DEVICE_ID",
    "operator": "Operario",
    "session_id": "prep_...",
    "timestamp": "ISO8601",
    "stock_manifest_version": "..."
  },
  "summary": [],
  "raw_data": []
}
```

## JSON de entrega por cliente

```json
{
  "header": {
    "kind": "delivery",
    "device_id": "DEVICE_ID",
    "operator": "Operario",
    "session_id": "del_...",
    "load_id": "carga_20260526_143522",
    "load_started_at": "ISO8601",
    "manifest_id": "PREP-2026-05-25",
    "manifest_version": "1716676239000",
    "cliente_id": "CLI-001",
    "cliente_nombre": "Cliente Demo",
    "timestamp": "ISO8601"
  },
  "delivered": [
    {
      "id_barra": "7790001000011",
      "cod_articulo": "ALG-BLA",
      "descripcion": "Algodon",
      "peso": 12.5,
      "color": "Blanco",
      "load_id": "carga_20260526_143522",
      "scanned_at": "ISO8601"
    }
  ],
  "exceptions": []
}
```

El proceso externo resta `delivered[].id_barra` del preparado pendiente del cliente y publica una nueva version del sheet.

## Cambios de UI

Dashboard:

- Boton "Preparar entrega".
- Boton "Entregar preparado".
- Estado de sincronizacion de stock.
- Estado de sincronizacion de preparado pendiente.
- Outbox/exportaciones pendientes.

Preparacion:

- Scanner actual, con revision y export de preparacion.

Entrega:

- Contadores por cliente y total.
- Scanner contra preparado pendiente.
- Feedback claro: valido, duplicado, no preparado, cliente incorrecto.
- Review agrupado por cliente.
- Finalizar genera un JSON por cliente.

## Correcciones a aprovechar

- Corregir el error TypeScript actual del componente web/native scanner.
- Reemplazar parser CSV manual por parser robusto.
- Agregar `device_id` persistente real.
- Agrupar preparacion por `cod_articulo` + `color` cuando corresponda.
- Evitar purga destructiva inmediata.
- Versionar manifiestos sincronizados.
- Separar configuracion cloud por entorno.
- Guardar errores y exportaciones pendientes en outbox local.

## Decisiones de Integración y Arquitectura

### 1. Integración con VB6 (Confirmada)
Se ha seleccionado la **Opción 1** (Google Drive para Ordenadores + Script Puente Local) por su robustez, seguridad y simplicidad:
- **Flujo de Datos**: La app móvil sube los JSON a Drive via Apps Script. Google Drive para Ordenadores descarga automáticamente los JSON en el equipo local.
- **Procesamiento**: Un script puente en Python/Node.js/C# monitorea la carpeta de Drive en local, lee y parsea los JSON, y escribe archivos CSV planos (o directo en la base de datos local).
- **VB6**: Lee estos archivos CSV/DB planos de manera trivial, evitando tener que lidiar con conexiones HTTP complejas o parsing de JSON.

### 2. Alcance del MVP V2
La V2 se concentrará en:
- Dos modos de operación claros (Preparación y Entrega).
- Dos tablas de maestros locales en SQLite.
- Scanner y tabla de eventos común.
- Outbox de exportaciones local para resiliencia offline.
- Generación de payloads JSON estructurados.
- Automatización local de descarga y aplanamiento de datos para VB6.

