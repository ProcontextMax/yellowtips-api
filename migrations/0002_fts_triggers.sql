-- 0002_fts_triggers.sql
-- Mantiene sentencias_fts sincronizado con sentencias (external content mode).

CREATE TRIGGER IF NOT EXISTS sentencias_ai
AFTER INSERT ON sentencias BEGIN
  INSERT INTO sentencias_fts(rowid, titulo, resumen, texto)
  VALUES (new.rowid, new.titulo, new.resumen, new.texto);
END;

CREATE TRIGGER IF NOT EXISTS sentencias_ad
AFTER DELETE ON sentencias BEGIN
  INSERT INTO sentencias_fts(sentencias_fts, rowid, titulo, resumen, texto)
  VALUES ('delete', old.rowid, old.titulo, old.resumen, old.texto);
END;

CREATE TRIGGER IF NOT EXISTS sentencias_au
AFTER UPDATE ON sentencias BEGIN
  INSERT INTO sentencias_fts(sentencias_fts, rowid, titulo, resumen, texto)
  VALUES ('delete', old.rowid, old.titulo, old.resumen, old.texto);
  INSERT INTO sentencias_fts(rowid, titulo, resumen, texto)
  VALUES (new.rowid, new.titulo, new.resumen, new.texto);
END; 
