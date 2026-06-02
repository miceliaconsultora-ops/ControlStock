/**
 * SCRIPT PARA CONTROL DE STOCK INDUSTRIAL V2
 * Integra la app movil con Google Drive.
 *
 * GET stock:
 *   ?dataset=stock&action=check
 *   ?dataset=stock&action=download
 *
 * GET preparado pendiente:
 *   ?dataset=delivery&action=check
 *   ?dataset=delivery&action=download
 *
 * POST:
 *   Recibe JSON de preparacion o entrega y lo guarda en JSON_FOLDER_ID.
 */

const DB_FOLDER_ID = '1IVLZcxJ5rd9jdNbNolOXhB-1rDBeSuZV';
const DELIVERY_FOLDER_ID = '1EkL15uYd-E31Y0uD9R6jLctC4DqLCzy2'; // Carpeta del CSV de preparado pendiente.
const JSON_FOLDER_ID = '1Q8la1daByqpgnYH3WwCeIgsnYlaBhiNp';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(JSON_FOLDER_ID);

    const now = new Date();
    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HHmmss');
    const kind = data.header && data.header.kind ? data.header.kind : 'preparation';
    const user = (data.header && (data.header.operator || data.header.user)) || 'Desconocido';
    const userClean = cleanFilePart(user, 'Desconocido');
    const sessionId = data.header && data.header.session_id ? data.header.session_id : 'SIN_SESION';
    const clientPart =
      kind === 'delivery' && data.header && data.header.cliente_id
        ? `_${cleanFilePart(data.header.cliente_id, 'SIN_CLIENTE')}`
        : '';
    const trackingPart =
      kind === 'delivery'
        ? cleanFilePart(data.header && data.header.load_id, `carga_${dateStr.replace(/-/g, '')}_${timeStr}`)
        : timeStr;
    const fileName = `${kind}_${dateStr}_${userClean}${clientPart}_${trackingPart}_${sessionId.substring(0, 8)}.json`;

    const blob = Utilities.newBlob(JSON.stringify(data, null, 2), 'application/json', fileName);
    folder.createFile(blob);

    return jsonOutput({
      status: 'success',
      message: 'Archivo guardado en Drive correctamente.',
      fileName,
    });
  } catch (error) {
    return jsonOutput({ status: 'error', message: error.toString() });
  }
}

function cleanFilePart(value, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : String(value);
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const dataset = e.parameter.dataset || 'stock';
    const folderId = getFolderId(dataset);
    const latestFile = getLatestCsv(folderId);

    if (action === 'check') {
      return jsonOutput({
        status: 'success',
        dataset,
        lastUpdated: latestFile.getLastUpdated().getTime(),
        fileName: latestFile.getName(),
      });
    }

    if (action === 'download') {
      return ContentService.createTextOutput(latestFile.getBlob().getDataAsString())
        .setMimeType(ContentService.MimeType.CSV);
    }

    return jsonOutput({
      status: 'error',
      message: 'Especifique action=check o action=download',
    });
  } catch (error) {
    return jsonOutput({ status: 'error', message: error.toString() });
  }
}

function getFolderId(dataset) {
  if (dataset === 'delivery') {
    if (!DELIVERY_FOLDER_ID) {
      throw new Error('DELIVERY_FOLDER_ID no configurado.');
    }
    return DELIVERY_FOLDER_ID;
  }

  if (dataset === 'stock') return DB_FOLDER_ID;
  throw new Error(`Dataset no soportado: ${dataset}`);
}

function getLatestCsv(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.CSV);

  if (!files.hasNext()) {
    throw new Error('No se encontro archivo CSV en la carpeta configurada.');
  }

  let latestFile = files.next();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getLastUpdated() > latestFile.getLastUpdated()) {
      latestFile = file;
    }
  }
  return latestFile;
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
