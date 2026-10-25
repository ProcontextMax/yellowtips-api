// socrata_anual.mjs
// Uso: node socrata_anual.mjs <año> <tipo>
// Ejemplo: node socrata_anual.mjs 2025 T
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATASET   = 'https://www.datos.gov.co/resource/v2k4-2t8s.json';
const PAGE      = 1000;
const BATCH_SIZE = 250;

const año  = process.argv[2];
const tipo = process.argv[3];

if (!año || !tipo) {
  console.error('Uso: node socrata_anual.mjs <año> <tipo>');
  console.error('Ejemplo: node socrata_anual.mjs 2025 T');
  process.exit(1);
}

const WHERE = `fecha_sentencia >= '${año}-01-01T00:00:00.000' AND fecha_sentencia < '${parseInt(año) + 1}-01-01T00:00:00.000' AND sentencia_tipo='${tipo}'`;
const ORDER = 'fecha_sentencia DESC';

const esc = (v) =>
  v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

function parseSentencia(s) {
  if (!s) return null;
  const m = String(s).match(/^([A-Z]+)-(\d+)\/(\d+)$/);
  if (!m) return null;
  const [, t, numero, yearShort] = m;
  return { tipo: t, numero, yearShort, id: `${t}-${numero}-${yearShort}` };
}

function buildRelatoriaUrl(sentencia, fecha) {
  const p = parseSentencia(sentencia);
  if (!p) return null;
  const yearFull = (fecha || '').slice(0, 4);
  if (!yearFull) return null;
  return `https://www.corteconstitucional.gov.co/relatoria/${yearFull}/${p.tipo}-${p.numero}-${p.yearShort}.htm`;
}

async function fetchPage(offset) {
  const url = `${DATASET}?$limit=${PAGE}&$offset=${offset}`
    + `&$where=${encodeURIComponent(WHERE)}`
    + `&$order=${encodeURIComponent(ORDER)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} en offset ${offset}`);
  return r.json();
}

async function main() {
  console.log(`Descargando ${tipo} de ${año}...`);
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(offset);
    all.push(...page);
    console.error(`Bajadas ${all.length} filas...`);
    if (page.length < PAGE) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Total a procesar: ${all.length} filas`);

  mkdirSync('data', { recursive: true });

  let written = 0, skipped = 0;
  for (let i = 0, b = 1; i < all.length; i += BATCH_SIZE, b++) {
    const batch = all.slice(i, i + BATCH_SIZE);
    const fname = `socrata_${año}_${tipo}_${String(b).padStart(3, '0')}.sql`;
    const path  = join('data', fname);
    const lines = [];

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
        esc(p.id), `'CO'`, esc('Corte Constitucional'),
        esc(r.proceso), esc(p.tipo), esc(radicado), esc(fecha),
        esc(r.magistrado_a), esc(r.sala), esc(titulo),
        'NULL', 'NULL', esc(url), `'dominio_publico'`,
        esc(salv), esc(aclar)
      ];

      lines.push(
        `INSERT OR IGNORE INTO sentencias ` +
        `(id,pais,corte,tipo_proceso,tipo,radicado,fecha,ponente,sala,titulo,resumen,texto,fuente_url,licencia,salvamento,aclaracion) ` +
        `VALUES (${vals.join(',')});`
      );
      written++;
    }

    writeFileSync(path, lines.join('\n'));
    console.log(`✅ ${path} — ${batch.length} filas`);
  }

  console.log(`\nListo. ${written} INSERTs generados, ${skipped} omitidas.`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });