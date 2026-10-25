-- Poblar citations desde sentencias (300 filas).
-- Convierte id "T-123-26" → citation_id "T-123-2026" (año completo).
-- Respeta las 5 filas existentes (no colisionan).

WITH parsed AS (
  SELECT 
    s.pais,
    substr(s.id, 1, instr(s.id, '-') - 1) AS tipo,
    substr(s.id, instr(s.id, '-') + 1, instr(substr(s.id, instr(s.id, '-') + 1), '-') - 1) AS numero,
    '20' || substr(s.id, -2) AS anio,
    s.corte,
    CAST(substr(s.fecha, 1, 4) AS INTEGER) AS year,
    s.id AS sentencia_id
  FROM sentencias s
  WHERE s.fecha IS NOT NULL
)
INSERT INTO citations (jurisdiction, citation_id, citation_text, court, year, status, notes, created_at)
SELECT 
  p.pais,
  p.tipo || '-' || p.numero || '-' || p.anio,
  'Sentencia ' || p.tipo || '-' || p.numero || ' de ' || p.anio,
  p.corte,
  p.year,
  'valid',
  'Imported from sentencias: ' || p.sentencia_id,
  datetime('now')
FROM parsed p
WHERE NOT EXISTS (
  SELECT 1 FROM citations c 
  WHERE c.jurisdiction = p.pais 
    AND c.citation_id = p.tipo || '-' || p.numero || '-' || p.anio
);