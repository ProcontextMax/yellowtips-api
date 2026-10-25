import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CHUNK_CHARS   = 20000;  // chars por fragmento (~60 KB máx en UTF-8)
const BATCH_UPDATES = 500;    // statements por archivo de salida
const INPUT_FILES = [
  'data/updates_t_001.sql',
  'data/updates_t_002.sql',
  'data/updates_t_003.sql',
  'data/updates_t_004.sql',
  'data/updates_t_005.sql',
  'data/updates_t_006.sql',
  'data/updates_t_007.sql',
  'data/updates_t_008.sql',
  'data/updates_t_009.sql',
  'data/updates_t_010.sql',
  'data/updates_t_011.sql',
  'data/updates_t_012.sql',
  'data/updates_t_013.sql',
  'data/updates_t_014.sql',
  'data/updates_t_015.sql',
  'data/updates_t_016.sql',
];

function esc(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function parseUpdateLine(line) {
  const m = line.match(/^UPDATE sentencias SET texto = '(.*)' WHERE id = '([^']+)';\s*$/s);
  if (!m) return null;
  return { id: m[2], texto: m[1].replace(/''/g, "'") };
}

const statements = [];
let totalSent = 0, totalChunks = 0;

for (const file of INPUT_FILES) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().startsWith('UPDATE'));
  console.log(`${file}: ${lines.length} UPDATEs`);

  for (const line of lines) {
    const parsed = parseUpdateLine(line);
    if (!parsed) { console.log(`  SKIP: ${line.slice(0, 80)}...`); continue; }

    const chunks = [];
    for (let i = 0; i < parsed.texto.length; i += CHUNK_CHARS) {
      chunks.push(parsed.texto.slice(i, i + CHUNK_CHARS));
    }

    // Chunk 1: SET (sobrescribe NULL o valor previo)
    statements.push(
      `UPDATE sentencias SET texto = ${esc(chunks[0])} WHERE id = ${esc(parsed.id)};`
    );
    // Chunks 2..N: concatena
    for (let i = 1; i < chunks.length; i++) {
      statements.push(
        `UPDATE sentencias SET texto = texto || ${esc(chunks[i])} WHERE id = ${esc(parsed.id)};`
      );
    }
    totalSent++;
    totalChunks += chunks.length;
  }
}

// Reporte de tamaño máximo (debe ser <100KB)
let maxBytes = 0;
for (const s of statements) {
  const b = Buffer.byteLength(s, 'utf8');
  if (b > maxBytes) maxBytes = b;
}

console.log(`\nTotal: ${totalSent} sentencias → ${totalChunks} chunks → ${statements.length} UPDATEs`);
console.log(`Statement más grande: ${(maxBytes/1024).toFixed(1)} KB (límite D1: ~100 KB)`);
if (maxBytes > 100 * 1024) {
  console.error('⚠️  ALGÚN STATEMENT EXCEDE 100KB. Baja CHUNK_CHARS y reintenta.');
  process.exit(1);
}

mkdirSync('data', { recursive: true });
let fileNum = 1;
for (let i = 0; i < statements.length; i += BATCH_UPDATES) {
  const batch = statements.slice(i, i + BATCH_UPDATES);
  const path = join('data', `frag_${String(fileNum).padStart(3, '0')}.sql`);
  writeFileSync(path, batch.join('\n'));
  console.log(`✅ ${path} — ${batch.length} statements`);
  fileNum++;
}
console.log(`\nListo. ${fileNum - 1} archivos generados.`);