import { getDatabase } from '../db/database';
import { AggregatedArticle, AggregatedDeliveryClient, WorkMode } from '../types';

/**
 * Preparation summary grouped by article and color.
 */
export async function getAggregatedData(
  sessionId: string
): Promise<AggregatedArticle[]> {
  const db = await getDatabase();

  return await db.getAllAsync<AggregatedArticle>(
    `SELECT
       COALESCE(cod_articulo, 'SIN_CODIGO') as cod_articulo,
       COALESCE(descripcion, 'Articulo Desconocido') as descripcion,
       COUNT(id_barra) as total_units,
       COALESCE(SUM(peso_nominal), 0) as total_weight,
       COALESCE(color, '-') as color
     FROM scan_events
     WHERE session_id = ? AND status IN ('hydrated', 'pending')
     GROUP BY COALESCE(cod_articulo, 'SIN_CODIGO'), COALESCE(color, '-')
     ORDER BY total_units DESC`,
    [sessionId]
  );
}

/**
 * Delivery summary grouped by client.
 */
export async function getDeliveryAggregatedClients(
  sessionId: string
): Promise<AggregatedDeliveryClient[]> {
  const db = await getDatabase();

  return await db.getAllAsync<AggregatedDeliveryClient>(
    `SELECT
       COALESCE(cliente_id, 'SIN_CLIENTE') as cliente_id,
       COALESCE(cliente_nombre, 'Cliente sin nombre') as cliente_nombre,
       COUNT(id_barra) as total_units,
       COALESCE(SUM(peso_nominal), 0) as total_weight
     FROM scan_events
     WHERE session_id = ? AND status = 'delivered'
     GROUP BY COALESCE(cliente_id, 'SIN_CLIENTE'), COALESCE(cliente_nombre, 'Cliente sin nombre')
     ORDER BY cliente_nombre`,
    [sessionId]
  );
}

/**
 * Completion status for a single client within a delivery session.
 * "Complete" means every planned roll for the client has been delivered.
 */
export async function getClientDeliveryCompletion(
  sessionId: string,
  clienteId: string
): Promise<{
  planned: number;
  delivered: number;
  isComplete: boolean;
  clienteNombre: string | null;
}> {
  const db = await getDatabase();

  const plan = await db.getFirstAsync<{ cnt: number; nombre: string | null }>(
    `SELECT COUNT(*) as cnt, MAX(cliente_nombre) as nombre
     FROM delivery_plan_items
     WHERE cliente_id = ?`,
    [clienteId]
  );
  const delivered = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
     FROM scan_events
     WHERE session_id = ? AND cliente_id = ? AND status = 'delivered'`,
    [sessionId, clienteId]
  );

  const planned = plan?.cnt ?? 0;
  const deliveredCount = delivered?.cnt ?? 0;

  return {
    planned,
    delivered: deliveredCount,
    isComplete: planned > 0 && deliveredCount >= planned,
    clienteNombre: plan?.nombre ?? null,
  };
}

/**
 * Get global totals for a session, including all valid scan statuses.
 */
export async function getSessionTotals(
  sessionId: string
): Promise<{ totalUnits: number; totalWeight: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ totalUnits: number; totalWeight: number }>(
    `SELECT
       COUNT(id_barra) as totalUnits,
       COALESCE(SUM(peso_nominal), 0) as totalWeight
     FROM scan_events
     WHERE session_id = ? AND status IN ('hydrated', 'pending', 'delivered')`,
    [sessionId]
  );

  return {
    totalUnits: row?.totalUnits ?? 0,
    totalWeight: row?.totalWeight ?? 0,
  };
}

export async function getSessionTotalsByMode(
  sessionId: string,
  mode: WorkMode
): Promise<{ totalUnits: number; totalWeight: number; exceptions: number }> {
  const db = await getDatabase();
  const validStatuses =
    mode === 'delivery' ? `('delivered')` : `('hydrated', 'pending')`;

  const row = await db.getFirstAsync<{ totalUnits: number; totalWeight: number }>(
    `SELECT
       COUNT(id_barra) as totalUnits,
       COALESCE(SUM(peso_nominal), 0) as totalWeight
     FROM scan_events
     WHERE session_id = ? AND status IN ${validStatuses}`,
    [sessionId]
  );

  const exceptionRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
     FROM scan_events
     WHERE session_id = ? AND status NOT IN ${validStatuses}`,
    [sessionId]
  );

  return {
    totalUnits: row?.totalUnits ?? 0,
    totalWeight: row?.totalWeight ?? 0,
    exceptions: exceptionRow?.cnt ?? 0,
  };
}
