-- Tabla principal de sentencias
CREATE TABLE IF NOT EXISTS sentencias (
  id            TEXT PRIMARY KEY,
  pais          TEXT NOT NULL DEFAULT 'CO',
  corte         TEXT NOT NULL,
  tipo_proceso  TEXT,
  tipo          TEXT,
  radicado      TEXT,
  fecha         TEXT,
  ponente       TEXT,
  sala          TEXT,
  titulo        TEXT NOT NULL,
  resumen       TEXT,
  texto         TEXT,
  fuente_url    TEXT,
  licencia      TEXT DEFAULT 'dominio_publico',
  salvamento    TEXT,
  aclaracion    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sent_pais_fecha ON sentencias(pais, fecha);
CREATE INDEX IF NOT EXISTS idx_sent_tipo       ON sentencias(tipo);
CREATE INDEX IF NOT EXISTS idx_sent_corte      ON sentencias(corte);

CREATE VIRTUAL TABLE IF NOT EXISTS sentencias_fts USING fts5(
  titulo, resumen, texto,
  content='sentencias', content_rowid='rowid'
);