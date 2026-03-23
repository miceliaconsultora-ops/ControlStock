/**
 * SCRIPT PARA CONTROL DE STOCK INDUSTRIAL
 * Integración entre App Móvil y Google Drive
 */

const DB_FOLDER_ID = '1IVLZcxJ5rd9jdNbNolOXhB-1rDBeSuZV';
const JSON_FOLDER_ID = '1Q8la1daByqpgnYH3WwCeIgsnYlaBhiNp';

// 1. Recibir el JSON desde la App (Envío Automático)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(JSON_FOLDER_ID);
    
    // Nombre de archivo con el Operario y la Fecha
    const dateStr = new Date().toISOString().split('T')[0];
    const userClean = (data.header.user || 'Desconocido').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Export_${dateStr}_${userClean}_${data.header.session_id.substring(0,8)}.json`;
    
    const blob = Utilities.newBlob(JSON.stringify(data, null, 2), "application/json", fileName);
    folder.createFile(blob);
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Archivo guardado en Drive correctamente.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. Enviar el Catalogo (CSV) a la App (Sincronización)
function doGet(e) {
  try {
    const folder = DriveApp.getFolderById(DB_FOLDER_ID);
    const files = folder.getFilesByType(MimeType.CSV);
    
    if (!files.hasNext()) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No se encontró archivo CSV en la carpeta de base de datos.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Buscar el CSV más reciente si hay varios
    let latestFile = files.next();
    while (files.hasNext()) {
      let file = files.next();
      if (file.getLastUpdated() > latestFile.getLastUpdated()) {
        latestFile = file;
      }
    }
    
    const action = e.parameter.action;
    
    // Si la App solo quiere saber si hay una actualización (ahorro de datos)
    if (action === 'check') {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'success', 
        lastUpdated: latestFile.getLastUpdated().getTime(),
        fileName: latestFile.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Si la App quiere descargar el CSV completo
    if (action === 'download') {
      return ContentService.createTextOutput(latestFile.getBlob().getDataAsString())
        .setMimeType(ContentService.MimeType.CSV);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Especifique la acción (?action=check o ?action=download)' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
