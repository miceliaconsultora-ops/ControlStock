// ── Data Types ──────────────────────────────────────────────────

export interface MasterArticle {
  id_barra: string;
  cod_articulo: string;
  descripcion: string;
  peso_nominal: number;
  color: string;
  last_updated?: string;
}

export type ScanStatus = 'hydrated' | 'pending' | 'error';
export type WorkMode = 'preparation' | 'delivery';
export type SessionStatus = 'open' | 'closed' | 'exported';
export type ScanEventStatus =
  | 'hydrated'
  | 'pending'
  | 'delivered'
  | 'duplicate_session'
  | 'not_prepared'
  | 'wrong_client'
  | 'stale_manifest'
  | 'error';
export type ExportStatus = 'pending' | 'uploaded' | 'failed';

export interface SessionScan {
  id_barra: string;
  scan_timestamp: string;
  session_id: string;
  status: ScanStatus;
  // Hydrated fields (from master_stock join)
  cod_articulo?: string;
  descripcion?: string;
  peso_nominal?: number;
  color?: string;
}

export interface AggregatedArticle {
  cod_articulo: string;
  descripcion: string;
  total_units: number;
  total_weight: number;
  color: string;
}

export interface SessionRecord {
  session_id: string;
  mode: WorkMode;
  operator_name: string;
  device_id: string;
  load_id?: string | null;
  manifest_id?: string | null;
  manifest_version?: string | null;
  started_at: string;
  closed_at?: string | null;
  status: SessionStatus;
}

export interface ScanEvent {
  event_id: string;
  session_id: string;
  id_barra: string;
  scan_timestamp: string;
  status: ScanEventStatus;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cod_articulo?: string | null;
  descripcion?: string | null;
  peso_nominal?: number | null;
  color?: string | null;
  raw_source?: string | null;
}

export interface DeliveryPlanItem {
  id_barra: string;
  manifest_id: string;
  manifest_version: string;
  cliente_id: string;
  cliente_nombre: string;
  cod_articulo: string;
  descripcion: string;
  peso_nominal: number;
  color: string;
  last_updated?: string;
}

export interface AggregatedDeliveryClient {
  cliente_id: string;
  cliente_nombre: string;
  total_units: number;
  total_weight: number;
}

export interface ExportOutboxItem {
  export_id: string;
  session_id: string;
  mode: WorkMode;
  cliente_id?: string | null;
  file_name: string;
  payload_json: string;
  status: ExportStatus;
  created_at: string;
  uploaded_at?: string | null;
  error_message?: string | null;
}

// ── Export Payload Types ────────────────────────────────────────

export interface ExportHeader {
  device_id: string;
  user: string;
  session_id: string;
  timestamp: string;
}

export interface ExportSummaryItem {
  cod_articulo: string;
  descripcion: string;
  color: string;
  total_units: number;
  total_weight: number;
  /** Detail of each individual roll scanned within this article group */
  rollos: Array<{
    id_barra: string;
    peso: number;
  }>;
}

export interface ExportRawItem {
  id_barra: string;
  cod_articulo: string;
  peso: number;
  color: string;
}

export interface ExportPayload {
  header: ExportHeader;
  summary: ExportSummaryItem[];
  raw_data: ExportRawItem[];
}

export interface DeliveryExportPayload {
  header: {
    kind: 'delivery';
    device_id: string;
    operator: string;
    session_id: string;
    load_id: string;
    load_started_at: string;
    manifest_id?: string | null;
    manifest_version?: string | null;
    cliente_id: string;
    cliente_nombre: string;
    timestamp: string;
  };
  delivered: Array<{
    id_barra: string;
    cod_articulo: string;
    descripcion: string;
    peso: number;
    color: string;
    load_id: string;
    scanned_at: string;
  }>;
  exceptions: Array<{
    id_barra: string;
    status: ScanEventStatus;
    scanned_at: string;
  }>;
}

// ── Navigation Types ───────────────────────────────────────────

export type RootStackParamList = {
  Dashboard: undefined;
  Scanner: { sessionId: string; mode: WorkMode };
  Review: { sessionId: string; mode: WorkMode };
};
