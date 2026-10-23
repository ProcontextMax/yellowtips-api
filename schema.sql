-- Tabla de citas legales
CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jurisdiction TEXT NOT NULL,
  citation_id TEXT NOT NULL,
  citation_text TEXT NOT NULL,
  court TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'valid',
  superseded_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(jurisdiction, citation_id)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_jurisdiction ON citations(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_citation_id ON citations(citation_id);
CREATE INDEX IF NOT EXISTS idx_status ON citations(status);

-- Datos de prueba (Colombia)
INSERT OR IGNORE INTO citations (jurisdiction, citation_id, citation_text, court, year, status, superseded_by, notes) VALUES
  ('CO', 'C-1234-2014', 'Sentencia C-1234 de 2014', 'Corte Constitucional', 2014, 'dead_law', 'C-567-2019', 'Derogada por Sentencia C-567 de 2019'),
  ('CO', 'C-567-2019', 'Sentencia C-567 de 2019', 'Corte Constitucional', 2019, 'valid', NULL, 'Vigente. Reemplaza a C-1234 de 2014'),
  ('CO', 'T-760-2008', 'Sentencia T-760 de 2008', 'Corte Constitucional', 2008, 'valid', NULL, 'Vigente. Derecho a la salud');

-- Datos de prueba (México)
INSERT OR IGNORE INTO citations (jurisdiction, citation_id, citation_text, court, year, status, superseded_by, notes) VALUES
  ('MX', '1a-J-45-2023', 'Tesis 1a./J. 45/2023', 'SCJN Primera Sala', 2023, 'fabricated', NULL, 'Esta tesis no existe en el SJF');

-- Datos de prueba (Argentina)
INSERT OR IGNORE INTO citations (jurisdiction, citation_id, citation_text, court, year, status, superseded_by, notes) VALUES
  ('AR', 'Mendoza-340-1234', 'CSJN, Mendoza, Fallos: 340:1234', 'CSJN', 2017, 'valid', NULL, 'Vigente. Derecho a la salud');