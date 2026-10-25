-- schema_resumen.sql
CREATE TABLE IF NOT EXISTS sentencias_resumen (
  id                TEXT PRIMARY KEY,
  problema_juridico TEXT,
  ratio_decidendi   TEXT,
  decision_texto    TEXT,
  sentido           TEXT CHECK (sentido IN ('concede','niega','modula','mixto','indeterminado')),
  derechos          TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'regex_v1',
  extracted_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resumen_sentido ON sentencias_resumen(sentido);
CREATE INDEX IF NOT EXISTS idx_resumen_method  ON sentencias_resumen(extraction_method);

CREATE VIRTUAL TABLE IF NOT EXISTS resumen_fts USING fts5(
  problema_juridico,
  ratio_decidendi,
  content='sentencias_resumen',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_resumen_ai AFTER INSERT ON sentencias_resumen BEGIN
  INSERT INTO resumen_fts(rowid, problema_juridico, ratio_decidendi)
  VALUES (new.rowid, new.problema_juridico, new.ratio_decidendi);
END;

CREATE TRIGGER IF NOT EXISTS trg_resumen_ad AFTER DELETE ON sentencias_resumen BEGIN
  INSERT INTO resumen_fts(resumen_fts, rowid, problema_juridico, ratio_decidendi)
  VALUES ('delete', old.rowid, old.problema_juridico, old.ratio_decidendi);
END;

CREATE TRIGGER IF NOT EXISTS trg_resumen_au AFTER UPDATE ON sentencias_resumen BEGIN
  INSERT INTO resumen_fts(resumen_fts, rowid, problema_juridico, ratio_decidendi)
  VALUES ('delete', old.rowid, old.problema_juridico, old.ratio_decidendi);
  INSERT INTO resumen_fts(rowid, problema_juridico, ratio_decidendi)
  VALUES (new.rowid, new.problema_juridico, new.ratio_decidendi);
END;
