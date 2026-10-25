// socrata_to_d1.mjs
// Genera archivos SQL para cargar metadatos de sentencias en D1.
// Uso: node socrata_to_d1.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Configuración ────────────────────────────────────────────────
const DATASET   = 'https://www.datos.gov.co/resource/v2k4-2t8s.json';
const PAGE      = 1000;   // filas por request a Socrata
const MAX_ROWS  = 300;    // tope total para la primera prueba (sube después)
const BATCH_SIZE = 250;   // filas por archivo SQL
const WHERE     = `fecha_sentencia >= '2024-01-01T00:00:00.000'`;
const ORDER     = 'fecha_sentencia DESC';
// ──────────────────────────────────────────────────────────────────

const esc = (v) =>
  v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

function parseSentencia(s) {
  // "T-012/92" → { tipo:'T', numero:'012', yearShort:'92', id:'T-012-92' }
  if (!s) return null;
  const m = String(s).match(/^([A-Z]+)-(\d+)\/(\d+)$/);
  if (!m) return null;
  const [, tipo, numero, yearShort] = m;
  return { tipo, numero, yearShort, id: `${tipo}-${numero}-${yearShort}` };
}

function buildRelatoriaUrl(sentencia, fecha) {
  const p = parseSentencia(sentencia);
  if (!p) return null;
  const yearFull = (fecha || '').slice(0, 4);
  if (!yearFull) return null;
  return `https://www.corteconstitucional.gov.co/relatoria/${yearFull}/${p.tipo}-${p.numero}-${p.yearShort}.htm`;
}

async function fetchPage(offset) {
  const url =
    `${DATASET}?$limit=${PAGE}&$offset=${offset}` +
    `&$where=${encodeURIComponent(WHERE)}` +
    `&$order=${encodeURIComponent(ORDER)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} en offset ${offset}`);
  return r.json();
}

async function main() {
  const all = [];

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await fetchPage(offset);
    all.push(...page);
    console.error(`Bajadas ${all.length} filas...`);
    if (page.length < PAGE) break;
    if (all.length >= MAX_ROWS) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const rows = all.slice(0, MAX_ROWS);
  console.error(`Total a procesar: ${rows.length} filas`);

  mkdirSync('data', { recursive: true });

  let written = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const fname = `batch_${String(i / BATCH_SIZE + 1).padStart(3, '0')}.sql`;
    const path  = join('data', fname);
    const lines = ['BEGIN TRANSACTION;'];

    for (const r of batch) {
      const p = parseSentencia(r.sentencia);
      if (!p) { skipped++; continue; }

      const fecha    = (r.fecha_sentencia || '').slice(0, 10);
      const radicado = `${r.expediente_tipo || ''}-${r.expediente_numero || ''}`;
      const url      = buildRelatoriaUrl(r.sentencia, r.fecha_sentencia);
      const titulo   = `Sentencia ${r.sentencia}${r.proceso ? ' – ' + r.proceso : ''}`;
      const salv     = r.sv_spv === 's.d.' ? null : r.sv_spv;
      const aclar    = r.av_apv === 's.d.' ? null : r.av_apv;

      const vals = [
        esc(p.id),
        `'CO'`,
        esc('Corte Constitucional'),
        esc(r.proceso),
        esc(p.tipo),
        esc(radicado),
        esc(fecha),
        esc(r.magistrado_a),
        esc(r.sala),
        esc(titulo),
        'NULL',       // resumen
        'NULL',       // texto
        esc(url),
        `'dominio_publico'`,
        esc(salv),
        esc(aclar),
      ];

      lines.push(
        `INSERT OR IGNORE INTO sentencias ` +
        `(id,pais,corte,tipo_proceso,tipo,radicado,fecha,ponente,sala,titulo,resumen,texto,fuente_url,licencia,salvamento,aclaracion) ` +
        `VALUES (${vals.join(',')});`
      );
      written++;
    }

    lines.push('COMMIT;');
    writeFileSync(path, lines.join('\n'));
    console.error(`✅ ${path} — ${written} filas acumuladas (${skipped} omitidas)`);
  }

  console.error(`\nListo. ${written} filas escritas, ${skipped} omitidas.`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });