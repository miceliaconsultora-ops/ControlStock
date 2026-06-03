# Guía de prueba — App Control Stock (APK Android)

Documento para el programador que va a probar la app en el celular.
**No requiere Google Drive para Escritorio.** La app se comunica con Google Drive
por internet a través de un Apps Script. Drive Escritorio recién hace falta en la
etapa siguiente (puente hacia VB6), no para esta prueba.

---

## 1. Qué se está probando

La app es un control de stock de rollos textiles, **offline-first**. Tiene dos flujos:

1. **Preparar entrega** (preparación): se escanean rollos contra el **stock maestro**.
   Al cerrar, genera un JSON con el resumen agrupado por artículo/color.
2. **Entregar preparado** (entrega): se escanean rollos contra un **preparado
   pendiente** (planilla por cliente). Agrupa por cliente y genera **un JSON por
   cliente**.

Los CSV de entrada y los JSON de salida viven en **Google Drive**. El intercambio
es así:

```
   [Drive: Stock maestro CSV]  --download-->  App  --scan-->  [Drive: Salida JSON]
   [Drive: Preparado CSV]      --download-->  App  --scan-->  [Drive: Salida JSON]
```

---

## 2. Requisitos para probar

- Celular **Android** con **internet** (datos o WiFi).
- **Acceso a las 3 carpetas de Drive** (ver punto 5). El programador ya tiene
  acceso al Drive donde están.
- La **APK** instalada (ver punto 3).
- Algo para escanear los códigos (ver detalle en el punto 4). Como mínimo,
  alcanza con poder **cargar el código a mano** desde la app, pero lo ideal es
  escanear con la cámara los códigos de barra de prueba.

---

## 3. Instalación de la APK

1. Descargar la APK (abrir este link **desde el celular**):

   **https://expo.dev/artifacts/eas/jj5s28gAWeqUcnf9RWm9c3.apk**

2. Al abrir el archivo, Android pedirá permitir **"Instalar apps de orígenes
   desconocidos"** → aceptar.
3. Instalar y abrir **Control Stock**.
4. La primera vez pide:
   - **Nombre de operario** (queda asociado a cada preparación/entrega).
   - **Permiso de cámara** (para escanear) → permitir.

---

## 4. Códigos de barra de prueba (qué escanear)

Los `id_barra` de los CSV de ejemplo son **códigos de barra EAN-13 reales y
escaneables**. Hay tres maneras de obtenerlos:

1. **Generador HTML (recomendado, tiene los 25 códigos):**
   abrir `assets/generate_barcodes.html` en cualquier navegador (PC o celular).
   Muestra los 25 rollos textiles (000011–000257) como códigos de barra. Se pueden
   **escanear directo de la pantalla** con la cámara de la app, o **imprimir** con
   el botón "Imprimir Códigos". Todos los `id_barra` de los CSV de ejemplo salen
   de acá.
2. **Imágenes PNG ya listas (cobertura parcial):**
   - `assets/barcodes_textiles_2_*.png` → códigos 000127 a 000219.
   - `assets/barcodes_textiles_3_*.png` → códigos 000035, 000226, 000233, 000240, 000257.
   - ⚠️ `assets/barcodes_prueba.png` es de **otra serie** (`77912345…`), **no**
     corresponde a los CSV textiles; ignorarlo para esta prueba.
3. **Carga manual / lector externo:** en la pantalla de escaneo se puede **escribir
   o pegar** el `id_barra`, o usar un **lector USB/Bluetooth**. Útil si no se puede
   escanear con cámara.

> Sugerencia: tener abierto `generate_barcodes.html` en la pantalla de la
> computadora y escanear desde ahí con el celular es la forma más rápida de probar.

---

## 5. Carpetas de Google Drive

La app usa **3 carpetas**. Se abren con `https://drive.google.com/drive/folders/<ID>`:

| Rol | Qué va ahí | ID de carpeta |
|-----|------------|---------------|
| **Stock maestro** (entrada) | CSV con todos los rollos disponibles | `1IVLZcxJ5rd9jdNbNolOXhB-1rDBeSuZV` |
| **Preparado pendiente** (entrada) | CSV con la planilla de entrega por cliente | `1EkL15uYd-E31Y0uD9R6jLctC4DqLCzy2` |
| **Salida JSON** (salida) | Acá la app **deja** los JSON de preparación/entrega | `1Q8la1daByqpgnYH3WwCeIgsnYlaBhiNp` |

> **Importante — cómo lee la app:** de cada carpeta de entrada, la app toma
> **únicamente el CSV más reciente** (por fecha de modificación). No combina
> archivos. Si subís un CSV nuevo, ese pasa a ser el "activo".

> **Importante — formato real CSV:** los archivos deben quedar como **`.csv` de
> verdad**, NO como Google Sheets. Si al subir el archivo Drive lo convierte a
> Sheets, la app no lo va a encontrar. Para evitarlo: en Drive, *Configuración →
> "Convertir los archivos subidos…"* debe estar **desactivado**, o subir el `.csv`
> arrastrándolo y verificando que el ícono quede como archivo CSV (no como hoja
> de cálculo).

---

## 6. Formato de los archivos de entrada (CSV)

Codificación recomendada: **UTF-8**. Separador: **coma (`,`)**. Primera fila =
encabezados (en minúscula, con esos nombres exactos).

> **Plantillas listas:** en `docs/ejemplos_csv/` hay dos archivos de ejemplo
> consistentes entre sí para subir directamente a Drive: `stock_ejemplo.csv` y
> `preparado_ejemplo.csv` (ver su `README.md`).

### 6.1. Stock maestro (carpeta "Stock maestro")

Encabezados obligatorios:

```
id_barra,cod_articulo,descripcion,peso_nominal,color
```

Ejemplo (`stock_prueba.csv`):

```csv
id_barra,cod_articulo,descripcion,peso_nominal,color
7790001000011,ALG-BLA,Algodón,12.5,Blanco
7790001000028,ALG-BLA,Algodón,11.8,Blanco
7790001000035,ALG-BLA,Algodón,13.2,Blanco
7790001000042,ALG-NEG,Algodón,10.0,Negro
7790001000059,ALG-NEG,Algodón,12.0,Negro
7790001000066,ALG-ROJ,Algodón,14.5,Rojo
7790001000073,ALG-ROJ,Algodón,13.8,Rojo
7790001000080,ALG-AZU,Algodón,11.0,Azul
7790001000097,POL-BLA,Poliéster,8.5,Blanco
7790001000103,POL-BLA,Poliéster,9.2,Blanco
```

| Columna | Significado |
|---------|-------------|
| `id_barra` | Código de barras del rollo (único). Es lo que se escanea. |
| `cod_articulo` | Código del artículo (tipo + color, ej. ALG-BLA). |
| `descripcion` | Descripción/tipo de tela. |
| `peso_nominal` | Peso del rollo en kg (número, punto decimal). |
| `color` | Color del rollo. |

### 6.2. Preparado pendiente (carpeta "Preparado pendiente")

Encabezados obligatorios:

```
manifest_id,manifest_version,cliente_id,cliente_nombre,id_barra,cod_articulo,descripcion,peso_nominal,color
```

Ejemplo (`preparado_prueba.csv`):

```csv
manifest_id,manifest_version,cliente_id,cliente_nombre,id_barra,cod_articulo,descripcion,peso_nominal,color
PREP-2026-05-26,2026-05-26-001,CLI-001,Cliente Norte,7790001000011,ALG-BLA,Algodón,12.5,Blanco
PREP-2026-05-26,2026-05-26-001,CLI-001,Cliente Norte,7790001000028,ALG-BLA,Algodón,11.8,Blanco
PREP-2026-05-26,2026-05-26-001,CLI-002,Cliente Sur,7790001000066,ALG-ROJ,Algodón,14.5,Rojo
```

| Columna | Significado |
|---------|-------------|
| `manifest_id` | Identificador de la planilla de preparado. |
| `manifest_version` | Versión de la planilla (ver nota de "re-test" abajo). |
| `cliente_id` | Identificador del cliente. |
| `cliente_nombre` | Nombre del cliente (se muestra en la app). |
| `id_barra` | Código de barras del rollo a entregar. |
| `cod_articulo` / `descripcion` / `peso_nominal` / `color` | Igual que en stock. |

> **Re-test de entrega:** cuando una planilla se entrega por completo, la app la
> marca como **"ya utilizada"** y bloquea volver a usarla (para no entregar dos
> veces lo mismo). Para **volver a probar la entrega**, subí un CSV nuevo con un
> **`manifest_version` distinto** (ej. `...-002`). La app detecta el cambio de
> versión y desbloquea el flujo.

---

## 7. Pasos de la prueba (camino recomendado)

### Preparación previa
1. Subir un **stock CSV** a la carpeta *Stock maestro* (punto 6.1).
2. Subir un **preparado CSV** a la carpeta *Preparado pendiente* (punto 6.2).
3. Confirmar que ambos quedaron como `.csv` (no Sheets).

### Flujo A — Preparación
1. Abrir la app → tocar **"Actualizar stock desde Drive"**. Debe avisar cuántos
   artículos descargó (el contador "Stock local" sube).
2. Tocar **"Preparar entrega"**.
3. Escanear rollos (cámara / lector / manual). Cada lectura válida suma un rollo.
4. Revisar el resumen agrupado por **artículo + color** (unidades y peso total).
5. Cerrar/Exportar. La app sube un **JSON de preparación** a la carpeta *Salida JSON*.

### Flujo B — Entrega
1. En el inicio, tocar **"Actualizar preparado desde Drive"** (sube el contador
   "Preparado pendiente" y "Clientes en entrega").
2. Tocar **"Entregar preparado"**.
3. Escanear los rollos. La app los agrupa por **cliente** automáticamente.
4. Cuando un cliente queda completo aparece el banner **"Cliente completo —
   Enviar"** → al tocarlo, sube **el JSON de ese cliente** a *Salida JSON*.
5. Al completar y enviar **todos** los clientes, la app **cierra la carga sola**
   (auto-finalización) y marca la planilla como utilizada.

### Verificación
- Mirar la carpeta **Salida JSON** en Drive: deben aparecer los archivos generados
  (ver nombres y contenido en el punto 8).

> **Prueba sin Drive (opcional, rápida):** la app trae datos de prueba embebidos.
> Con **"Reiniciar stock de prueba"** y **"Cargar preparado de prueba"** se puede
> recorrer ambos flujos sin tocar Drive (la salida igual intenta subir a Drive).

---

## 8. Formato de los archivos de salida (JSON)

La app deja los JSON en la carpeta **Salida JSON**. Este es el insumo que más
adelante consumirá el puente hacia VB6.

### 8.1. Preparación
Nombre: `preparation_<fecha>_<operario>_<hora>_<idsesion8>.json`

```json
{
  "header": {
    "device_id": "device-xxxx",
    "user": "Juan Perez",
    "session_id": "ses_xxxxxxxx",
    "timestamp": "2026-06-02T14:35:00.000Z"
  },
  "summary": [
    {
      "cod_articulo": "ALG-BLA",
      "descripcion": "Algodón",
      "color": "Blanco",
      "total_units": 3,
      "total_weight": 37.5,
      "rollos": [
        { "id_barra": "7790001000011", "peso": 12.5 },
        { "id_barra": "7790001000028", "peso": 11.8 },
        { "id_barra": "7790001000035", "peso": 13.2 }
      ]
    }
  ],
  "raw_data": [
    { "id_barra": "7790001000011", "cod_articulo": "ALG-BLA", "peso": 12.5, "color": "Blanco" }
  ]
}
```

### 8.2. Entrega (un archivo por cliente)
Nombre: `delivery_<fecha>_<operario>_<cliente_id>_<load_id>_<idsesion8>.json`

```json
{
  "header": {
    "kind": "delivery",
    "device_id": "device-xxxx",
    "operator": "Juan Perez",
    "session_id": "ses_xxxxxxxx",
    "load_id": "carga_xxxx",
    "load_started_at": "2026-06-02T14:00:00.000Z",
    "manifest_id": "PREP-2026-05-26",
    "manifest_version": "2026-05-26-001",
    "cliente_id": "CLI-001",
    "cliente_nombre": "Cliente Norte",
    "timestamp": "2026-06-02T14:40:00.000Z"
  },
  "delivered": [
    {
      "id_barra": "7790001000011",
      "cod_articulo": "ALG-BLA",
      "descripcion": "Algodón",
      "peso": 12.5,
      "color": "Blanco",
      "load_id": "carga_xxxx",
      "scanned_at": "2026-06-02T14:39:50.000Z"
    }
  ],
  "exceptions": [
    { "id_barra": "7790009999999", "status": "no_planificado", "scanned_at": "2026-06-02T14:39:55.000Z" }
  ]
}
```

`exceptions` lista los rollos escasos para ese cliente que **no** quedaron como
entregados (ej. escaneos no planificados). En una entrega limpia va vacío (`[]`).

---

## 9. Qué reportar tras la prueba

Para cada flujo (Preparación y Entrega), anotar:

- [ ] ¿La cámara escaneó bien los códigos? ¿Lectura manual / lector USB-BT OK?
- [ ] ¿La descarga desde Drive trajo la cantidad esperada de filas?
- [ ] ¿El agrupado (por artículo/color en prep; por cliente en entrega) fue correcto?
- [ ] ¿Aparecieron los JSON en la carpeta *Salida JSON*? ¿Nombres y contenido OK?
- [ ] Errores/mensajes inesperados (captura de pantalla si se puede).
- [ ] Modelo de celular y versión de Android.

---

## 10. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| "No se encontró archivo CSV" al actualizar | El archivo se subió como Google Sheets, no como CSV | Resubir como `.csv` real (ver punto 5) |
| Descarga trae datos viejos | Hay un CSV más nuevo que el esperado | Recordá: la app toma el **más reciente** de la carpeta |
| "Preparado ya utilizado" / no deja entregar | Esa planilla ya se entregó | Subir CSV con `manifest_version` distinto (punto 6.2) |
| Falta columna X | Encabezado mal escrito | Respetar nombres exactos del punto 6 |
| No sube el JSON a Drive | Sin internet en el momento del envío | La app guarda local y reintenta; verificar conexión |

---

## 11. Nota sobre la integración con VB6 (etapa siguiente, NO en esta prueba)

Esta prueba valida la app y el ida/vuelta con Drive **por internet**. La conexión
con VB6 es un paso posterior y separado: un puente local (con Google Drive para
Escritorio sincronizando la carpeta *Salida JSON*) que tomará esos JSON y los
convertirá a CSV plano para que VB6 los importe. **No es necesario para probar la
app ahora.**
