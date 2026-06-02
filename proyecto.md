# Proyecto - Control Stock V2

## Estado actual

La aplicacion paso de ser un flujo unico de preparacion contra stock a una V2 con dos etapas:

1. Preparacion de entrega contra stock total.
2. Entrega de rollos ya preparados contra una base de preparado pendiente por cliente.

La app esta funcionando en preview web y ya se probo el flujo completo de entrega con Google Drive y Apps Script. El siguiente paso operativo es probar en celular, primero con Expo Go y despues con APK preview.

## Flujo funcional e Integración VB6

```mermaid
flowchart TD
  A["CSV stock total"] --> B["App: Preparar entrega"]
  B --> C["JSON de preparacion"]
  C --> D["Carpeta salida JSONs (Drive Cloud)"]

  D -->|Sync Google Drive Desktop| GDriveLocal["G:\\Mi unidad\\ControlStock\\JSONs"]
  GDriveLocal -->|Script Puente (JSON to CSV)| Bridge["C:\\ControlStock\\Import (CSVs)"]
  Bridge -->|Lectura simple| VB6["Sistema VB6 (ERP)"]
  VB6 -->|Supervisor arma despacho| F["CSV preparado pendiente por cliente"]

  F --> G["App: Entregar preparado"]
  G --> H["JSON de entrega por cliente"]
  H --> D
```


## Carpetas y origenes Drive

Stock total:

```text
DB_FOLDER_ID = 1IVLZcxJ5rd9jdNbNolOXhB-1rDBeSuZV
```

Preparado pendiente:

```text
DELIVERY_FOLDER_ID = 1EkL15uYd-E31Y0uD9R6jLctC4DqLCzy2
```

Salida de JSONs:

```text
JSON_FOLDER_ID = 1Q8la1daByqpgnYH3WwCeIgsnYlaBhiNp
```

URL publicada del Apps Script:

```text
https://script.google.com/macros/s/AKfycbzRtzlpC_Q3y8f3kyl63YWHZvgFIMGDVUojLg8WYJHufH17fU3gDb2NaIQwUu5KeD90EQ/exec
```

## Etapa 1 - Preparacion

El operario inicia una sesion de preparacion y escanea rollos contra el stock total sincronizado. Cada dispositivo genera un payload JSON de preparacion.

El JSON de preparacion se sube a la carpeta configurada como `JSON_FOLDER_ID`.

Ese JSON no asigna clientes dentro de la app. La asignacion por cliente ocurre afuera: el supervisor o sistema externo toma las preparaciones, arma el preparado pendiente por cliente y publica un nuevo CSV en la carpeta `DELIVERY_FOLDER_ID`.

## Etapa 2 - Entrega

La app se hidrata desde el CSV de preparado pendiente. Cada fila representa un rollo preparado y asignado a un cliente.

El operario escanea lo que efectivamente se carga o sale. No hay camion ni instancia preasignada. La app busca cada rollo en el preparado pendiente, obtiene el cliente desde esa base y agrupa la entrega automaticamente.

Al finalizar, la app genera un JSON por cliente y los sube a la misma carpeta `JSON_FOLDER_ID`.

Cada carga efectiva tiene un `load_id` con fecha y hora, por ejemplo:

```text
carga_20260526_135046
```

Ese `load_id` queda en el nombre del archivo, en `header.load_id` y en cada item entregado.

## Regla anti reutilizacion

Cuando una entrega se revisa y exporta correctamente, la app marca localmente como consumido el `manifest_id + manifest_version` del CSV usado.

Esto evita reutilizar la misma planilla de preparado pendiente para otra entrega. Para volver a entregar, el proceso externo debe publicar una nueva version del preparado pendiente, cambiando `manifest_version`.

Ejemplo probado:

```text
manifest_id = PREP-2026-05-26
manifest_version = 2026-05-26-002
```

## Envio por cliente y cierre automatico de carga (V2.1)

Durante la entrega, cuando se escanean todos los rollos planeados de un cliente,
el Scanner muestra un banner verde tocable **"Cliente completo - Enviar"** con el
nombre del cliente.

Al tocarlo se sube **solo el JSON de ese cliente** (`exportDeliveryClient`), sin
cerrar la sesion ni consumir la planilla todavia.

Buffer anti-reenvio: los clientes enviados con exito quedan en `export_outbox`
con `status='uploaded'`. Al finalizar la sesion (`exportDeliverySession`) se
saltean esos clientes, asi no se reenvian.

Cierre automatico (`maybeAutoFinalizeDelivery`): cuando **todos** los clientes
del plan estan completos **y** subidos, la app cierra la sesion y marca la
planilla como consumida sola, sin necesidad de tocar "Exportar entrega". Vuelve
al Dashboard mostrando "Carga finalizada". Asi, terminada la carga, la misma
planilla (mismo `manifest_id` + `manifest_version`) no se puede rehidratar; hace
falta una nueva `manifest_version`.

Si el envio individual no llega a Drive, el JSON se comparte localmente, NO entra
al buffer y el banner se mantiene para reintentar. La carga nunca se cierra con
algo sin subir.

Funciones clave:

```text
aggregationService.getClientDeliveryCompletion()
exportService.exportDeliveryClient()
exportService.getSentDeliveryClientIds()
exportService.maybeAutoFinalizeDelivery()
```

## CSV de preparado pendiente

Columnas actuales:

```csv
manifest_id,manifest_version,cliente_id,cliente_nombre,id_barra,cod_articulo,descripcion,peso_nominal,color
```

Archivo local de prueba creado:

```text
C:\Antigravity\Control_Stock\preparacionprueba_v2.csv
```

## JSONs de entrega verificados

Se verifico que los archivos nuevos salen con `load_id` en el nombre:

```text
delivery_2026-05-26_Diego_Rebora_CLI-001_carga_20260526_135046_del_1779.json
delivery_2026-05-26_Diego_Rebora_CLI-002_carga_20260526_135046_del_1779.json
```

Tambien se verifico que el contenido interno incluye:

```json
"load_id": "carga_20260526_135046",
"manifest_version": "2026-05-26-002"
```

## Cambios tecnicos implementados

Se agregaron o modificaron las piezas principales:

- `sessions`: sesiones persistentes por modo.
- `scan_events`: eventos de escaneo comunes para preparacion y entrega.
- `delivery_plan_items`: maestro local de preparado pendiente.
- `export_outbox`: historial/outbox de exportaciones.
- `sessionService`: creacion de sesiones y `device_id`.
- `deliveryPlanService`: sync del preparado pendiente.
- `scanWorkflowService`: validacion de scans segun modo.
- `exportService`: JSON de preparacion y JSON de entrega por cliente.
- `Codigo_Google_Script.js`: GET para stock y delivery, POST para subir JSONs.

## Archivos importantes

```text
App.tsx
Codigo_Google_Script.js
src/constants/api.ts
src/db/database.ts
src/services/sessionService.ts
src/services/deliveryPlanService.ts
src/services/scanWorkflowService.ts
src/services/exportService.ts
src/services/syncService.ts
src/screens/DashboardScreen.tsx
src/screens/ScannerScreen.tsx
src/screens/ReviewScreen.tsx
docs/v2_blueprint.md
progress.md
task_plan.md
```

## Verificaciones realizadas

TypeScript:

```powershell
npx tsc --noEmit
```

Build web:

```powershell
npx expo export --platform web
```

Preview web:

```text
http://127.0.0.1:8082
```

Endpoint delivery check:

```text
?dataset=delivery&action=check
```

Respuesta esperada:

```json
{"status":"success","dataset":"delivery","fileName":"preparacionprueba_v2.csv"}
```

## Proximo paso

Estado al cierre de la sesion: V2.1 (envio por cliente + cierre automatico de
carga) implementada y probada OK en preview web. Pendiente: generar y probar la
APK en celular fisico.

Probar en celular.

Primera pasada rapida:

```powershell
npx expo start
```

Luego escanear el QR con Expo Go y validar camara, SQLite, preparado pendiente, escaneo, revision y export.

Segunda pasada:

```powershell
npx eas build --platform android --profile preview
```

Esto genera un APK instalable para prueba mas cercana al uso real.

