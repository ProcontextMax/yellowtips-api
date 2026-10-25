import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CHUNK_SIZE = 40000; // 40 KB por fragmento (muy por debajo del límite de 100 KB)
const INPUT_FILES = [
  'data/updates_t_001.sql',
  'data/updates_t_002.sql',
  // ... añade todos los archivos que generaste
];

// Esta función extrae el id y el texto de una línea UPDATE original
function parseUpdateLine(line) {
  const match = line.match(/UPDATE sentencias SET texto = '(.*)' WHERE id = '([^']+)';/s);
  if (!match) return null;
  return { id: match[2], texto: match[1].replace(/''/g, "'") };
}

function esc(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

let batchNum = 1;
const outputLines = [];

for (const file of INPUT_FILES) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().startsWith('UPDATE'));

  for (const line of lines) {
    const parsed = parseUpdateLine(line);
    if (!parsed) continue;

    // Primer fragmento: actualiza el texto (sobrescribe)
    const chunks = [];
    for (let i = 0; i < parsed.texto.length; i += CHUNK_SIZE) {
      chunks.push(parsed.texto.slice(i, i + CHUNK_SIZE));
    }

    // Genera un UPDATE por cada fragmento
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (i === 0) {
        // Primer fragmento: SET texto = '...'
        outputLines.push(`UPDATE sentencias SET texto = ${esc(chunk)} WHERE id = ${esc(parsed.id)};`);
      } else {
        // Fragmentos siguientes: concatenan
        outputLines.push(`UPDATE sentencias SET texto = texto || ${esc(chunk)} WHERE id = ${esc(parsed.id)};`);
      }
    }
  }
}

// Escribe el resultado en un solo archivo (o divídelo si es muy grande)
mkdirSync('data', { recursive: true });
const outputPath = join('data', 'updates_fragmentados.sql');
writeFileSync(outputPath, outputLines.join('\n'));
console.log(`✅ Generado ${outputPath} con ${outputLines.length} declaraciones UPDATE.`);