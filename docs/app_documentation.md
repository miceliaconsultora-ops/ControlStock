# Documentación: Sistema de Control de Stock Industrial (MVP)

## 1. Visión General
El **Control de Stock Industrial MVP** es una aplicación móvil robusta diseñada para operar en entornos industriales (plantas, depósitos) donde la conectividad puede ser inestable. Su función principal es el escaneo de códigos de barras para la gestión de inventario, operando bajo una filosofía **offline-first**.

### Propuesta de Valor (North Star)
*   **Fiabilidad**: Funcionamiento garantizado sin Internet.
*   **Integridad**: Prevención de duplicados a nivel de sesión.
*   **Rendimiento**: Hidratación instantánea de datos maestros (>20,000 artículos) mediante SQLite.

---

## 2. Arquitectura de Software

La aplicación está construida utilizando un stack moderno y eficiente:
- **Framework**: Expo (React Native) para una experiencia nativa y fluida.
- **Base de Datos**: `expo-sqlite`. Almacena el catálogo de artículos y el registro de escaneos localmente.
- **Estilos**: NativeWind (Tailwind CSS) para una interfaz limpia y profesional.
- **Navegación**: React Navigation (Stack) manejando el flujo de estados.

### Componentes de Servicio
1.  **Sync Engine**: Gestiona la descarga e inserción masiva del catálogo (Google Sheets/CSV) en el almacenamiento local. Optimizado con transacciones SQLite para no bloquear la interfaz.
2.  **Hydration Service**: Al escanear un código, este servicio busca en milisegundos la información del producto (descripción, peso, color).
3.  **Aggregation Engine**: Realiza cálculos reactivos en la pantalla de revisión (totales por artículo, pesos acumulados).
4.  **Export Handler**: Genera un payload JSON atómico y utiliza el Share Sheet del sistema operativo para envío seguro por correo electrónico.

---

## 3. Flujo del Usuario (UX)

### Paso 1: Configuración Inicial (Dashboard)
El operario inicia el día sincronizando el catálogo si es necesario. Puede ver el estado de la base de datos local y el nombre del operario activo.

### Paso 2: Escaneo en Tiempo Real (Scanner)
Interfaz de cámara optimizada. Implementa un **debounce de 1.5s** y validación de duplicados para evitar errores por escaneo accidental o repetido de una misma etiqueta.

### Paso 3: Revisión y Alerta (Review)
Antes de finalizar, el usuario puede revisar el listado de ítems capturados, ver los totales calculados y realizar correcciones manuales si fuera necesario.

### Paso 4: Finalización y Exportación
Se genera un archivo JSON estructurado (ver esquemas de datos) y se activa la ventana de compartir para enviar el reporte de la sesión a los sistemas centrales.

---

## 4. Esquemas de Datos

### Importación (Maestro de Artículos)
| Campo | Tipo | Función |
| :--- | :--- | :--- |
| `id_barra` | String | Clave Primaria (Barcode único) |
| `cod_articulo`| String | Código del producto |
| `descripcion` | String | Nombre legible del producto |
| `peso_nominal`| Number | Peso teórico para validación |
| `color` | String | Variante de color |

### Exportación (JSON Payload)
```json
{
  "header": {
    "device_id": "...",
    "user": "...",
    "session_id": "...",
    "timestamp": "ISO8601"
  },
  "summary": [
    {
      "cod_articulo": "...",
      "total_units": 0,
      "total_weight": 0
    }
  ],
  "raw_data": [
    {
      "id_barra": "...",
      "cod_articulo": "...",
      "peso": 0,
      "color": "..."
    }
  ]
}
```

---

## 5. Decisiones Técnicas Clave
- **SQLite como Fuente de Verdad**: A diferencia de otras apps que dependen de una API constante, aquí la base de datos local es soberana.
- **Manejo de Transacciones**: La hidratación y sincronización usan transacciones explícitas para asegurar integridad de datos (ACID local).
- **Consumo de Batería**: Motor de escaneo optimizado para no sobrecalentar el dispositivo durante sesiones largas.
