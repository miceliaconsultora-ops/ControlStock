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

// ── Navigation Types ───────────────────────────────────────────

export type RootStackParamList = {
  Dashboard: undefined;
  Scanner: { sessionId: string };
  Review: { sessionId: string };
};
