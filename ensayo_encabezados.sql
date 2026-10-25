SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN upper(texto) LIKE '%PROBLEMA JUR%DICO%' THEN 1 ELSE 0 END) AS con_problema,
  SUM(CASE WHEN upper(texto) LIKE '%RATIO DECIDENDI%' THEN 1 ELSE 0 END) AS con_ratio,
  SUM(CASE WHEN upper(texto) LIKE '%RESUELVE%' THEN 1 ELSE 0 END) AS con_resuelve,
  SUM(CASE WHEN upper(texto) LIKE '%CONSIDERACIONES%' THEN 1 ELSE 0 END) AS con_consideraciones
FROM sentencias
WHERE tipo = 'T' AND texto IS NOT NULL;