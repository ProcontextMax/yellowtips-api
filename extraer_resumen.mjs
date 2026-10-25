#!/usr/bin/env node
// extraer_resumen.mjs — Capa 1: extracción regex pura (sin LLM)
// Uso:
//   node extraer_resumen.mjs --dump                # exporta sentencias a sentencias.json (paginado)
//   node extraer_resumen.mjs --extract             # procesa y escribe inserts_resumen_*.sql
//   node extraer_resumen.mjs --extract --limit=20  # solo 20 filas (validación)
//   node extraer_resumen.mjs --apply               # ejecuta los SQL con wrangler

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DB = 'yellowtips-db';
const CWD = process.cwd();
const INPUT_JSON = path.join(CWD, 'sentencias.json');
const OUT_GLOB = 'inserts_resumen';
const CHUNK = 100;
const MAX_TEXT = 50000;
const COLUMNAS_TEXTO = ['texto', 'texto_completo', 'content', 'body', 'contenido'];

const argv = process.argv.slice(2);
const opt  = (n) => argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n) => argv.includes(`--${n}`);

// ---------------- DUMP (paginado + retry) ----------------
const PAGE_SIZE = 150;        // baja a 50 si sigue fallando por 7010
const MAX_RETRIES = 5;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function wranglerJson(sql, retries = MAX_RETRIES) {
  const cmd = `wrangler d1 execute ${DB} --remote --json --command="${sql.replace(/"/g, '\\"')}"`;
  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      const out = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const parsed = JSON.parse(out);
      if (parsed?.error) throw new Error(parsed.error.text);
      return parsed;
    } catch (e) {
      lastErr = e;
      const msg = (e.stdout || e.message || '').toString();
      const esTransitorio = /7010|Service unavailable|Bad Gateway|timeout|overloaded|ECONNRESET/i.test(msg);
      if (!esTransitorio || i === retries) break;
      const wait = 800 * Math.pow(2, i - 1);
      console.log(`\n    ↻ error transitorio, retry ${i}/${retries} en ${wait}ms...`);
      sleepSync(wait);
      process.stdout.write('    ');
    }
  }
  throw lastErr;
}

function rowsOf(parsed) {
  return parsed?.[0]?.results ?? parsed?.results ?? [];
}

function dump() {
  console.log(`→ Dump paginado de sentencias (${DB})...`);

  // 1. Detectar columna de texto
  let col = null;
  for (const c of COLUMNAS_TEXTO) {
    try {
      const p = wranglerJson(`SELECT id, ${c} AS texto FROM sentencias WHERE ${c} IS NOT NULL AND length(${c}) > 200 LIMIT 1`);
      if (rowsOf(p).length) { col = c; break; }
    } catch { /* siguiente */ }
  }
  if (!col) { console.error('✗ No encontré columna de texto'); process.exit(1); }
  console.log(`  ✓ Columna detectada: ${col}`);

  // 2. Paginar por cursor (id > lastId)
  const all = [];
  let lastId = null;
  let page = 0;
  while (true) {
    const filtroBase = `${col} IS NOT NULL AND length(${col}) > 200`;
    const where = lastId === null
      ? filtroBase
      : `${filtroBase} AND id > '${String(lastId).replace(/'/g, "''")}'`;
    const sql = `SELECT id, ${col} AS texto FROM sentencias WHERE ${where} ORDER BY id ASC LIMIT ${PAGE_SIZE}`;
    process.stdout.write(`  · página ${String(page + 1).padStart(3, '0')} ... `);

    let p;
    try {
      p = wranglerJson(sql);
    } catch (e) {
      console.log('ERROR');
      console.error('  Detalle:', (e.stdout || e.message || '').toString().slice(0, 800));
      console.error('  → Baja PAGE_SIZE a 50 en la parte superior del archivo y reintenta.');
      process.exit(1);
    }

    const rows = rowsOf(p);
    if (!rows.length) { console.log('fin'); break; }

    all.push(...rows);
    lastId = rows[rows.length - 1].id;
    console.log(`${rows.length} filas (acum: ${all.length})`);

    if (rows.length < PAGE_SIZE) { console.log('  ✓ última página'); break; }
    page++;
    sleepSync(250);
  }

  if (!all.length) { console.error('✗ Dump vacío'); process.exit(1); }

  fs.writeFileSync(INPUT_JSON, JSON.stringify(all), 'utf-8');
  console.log(`  ✓ ${all.length} filas → ${INPUT_JSON}`);
}

// ---------------- EXTRACCIÓN ----------------
const RE_RESUELVE  = /R\s*E\s*S\s*U\s*E\s*L\s*V\s*E\s*:?\s*/gim;
const RE_DECISION_VERB = /\b(?:CONCEDER|AMPARAR|TUTELAR|NEGAR|DENEGAR|REVOCAR|CONFIRMAR|DECLARAR|ORDENAR|LEVANTAR|PREVENIR|MODIFICAR|ADICIONAR)\b/i;

function findDecisionStart(texto) {
  const matches = [...texto.matchAll(RE_RESUELVE)];
  if (!matches.length) return -1;
  // Preferir el ÚLTIMO RESUELVE cuyo siguiente ~500 chars contenga verbo decisorio
  for (let i = matches.length - 1; i >= 0; i--) {
    const start = matches[i].index + matches[i][0].length;
    const window = texto.slice(start, start + 500);
    if (RE_DECISION_VERB.test(window)) return start;
  }
  // Fallback: último match (comportamiento anterior)
  const last = matches[matches.length - 1];
  return last.index + last[0].length;
}
const RE_PROBLEMA  = /PROBLEMA[S]?\s+JUR[IÍ\uFFFD]DICO[S]?\s*:?\s*/im;
const RE_CONSIDER  = /CONSIDERACIONES(?:\s+Y\s+(?:FUNDAMENTOS|CONSIDERACIONES))?\s*:?\s*/im;
const RE_RATIO_EXPL = /RATIO\s+DECIDENDI[:\s]*\n([\s\S]{50,3000}?)(?=\n\s*\n\s*[A-ZÁÉÍÓÚÑ][A-Z\s]{3,}|\n\s*(?:\d+[\.\)\-]|R\s*E\s*S\s*U\s*E\s*L\s*V\s*E)|$)/i;

const DERECHOS = {
  trabajo:          /\btrabaj[oa]s?\b|\btrabajador(?:a|es)?\b/i,
  estabilidad:      /estabilidad(?: laboral)?(?: reforzada)?/i,
  discapacidad:     /discapacidad|discapacitad[oa]/i,
  contrato:         /\bcontrat(?:o|os|ual|uales|aci[oó]n)\b/i,
  embarazo:         /embaraz[oa]|gestaci[oó]n|lactancia/i,
  acoso:            /acoso(?: laboral| sexual)?/i,
  fuero:            /\bfuero\b|fuero (?:de|sindical|de maternidad|de estabilidad)/i,
  despido:          /\bdespid[oa]\b|desvinculaci[oó]n/i,
  pension:          /pensi[oó]n(?:al|es)?/i,
  sindical:         /sindicat[oa]|sindical|libertad sindical|asociaci[oó]n sindical/i,
  salud:            /\bsalud\b|servicios? de salud|SGSSS/i,
  seguridad_social: /seguridad social/i,
  minimo_vital:     /m[ií]nimo vital/i,
  igualdad:         /igualdad|no discriminaci[oó]n/i,
  debido_proceso:   /debido proceso/i,
  dignidad:         /dignidad humana/i,
};

function detectSentido(decision) {
  let d = (decision || '').toUpperCase();
  // Cortar en el primer footnote [N] en línea propia (fin de resolutiva)
  const fm = d.search(/\n\s*\[\d+\]/);
  if (fm > 30) d = d.slice(0, fm);

  // Patrón clásico: "REVOCAR ... En su lugar, CONCEDER/AMPARAR/TUTELAR"
  if (/EN\s+SU\s+LUGAR\s*,?\s*(?:CONCEDER|CONCEDIENDO|AMPARAR|AMPARANDO|TUTELAR|TUTELANDO)/.test(d)) return 'concede';

  const concede = /\b(?:CONCEDER|CONCEDIENDO|AMPARAR|AMPARANDO|TUTELAR|TUTELANDO)\b/.test(d);
  const niega   = /\b(?:NEGAR|NEGANDO|DENEGAR|DENEGANDO)\b/.test(d);
  const modula  = /\b(?:MODIFICAR|MODIFICANDO|ADICIONAR|ADICIONANDO)\b/.test(d)
               || /\b(?:REVOCAR|CONFIRMAR)\s+PARCIALMENTE\b/.test(d);
  const carencia = /CARENCIA\s+ACTUAL\s+DE\s+OBJETO|HECHO\s+SUPERADO/.test(d);
  const improcedente = /\bIMPROCEDENTE\b/.test(d);

  if (carencia) return 'indeterminado';
  if (concede && niega) return 'mixto';
  if (concede && modula) return 'modula';
  if (concede) return 'concede';
  if (niega) return 'niega';
  if (modula) return 'modula';
  if (improcedente) return 'niega';
  return 'indeterminado';
}

function detectDerechos(texto) {
  const hits = [];
  for (const [k, re] of Object.entries(DERECHOS)) if (re.test(texto)) hits.push(k);
  return hits;
}

function extract(row) {
  let texto = row.texto || '';
  if (texto.length < 200) return null;
 const MAX_SCAN = 5000000;  // 5 MB: tope de seguridad anti-patológico
if (texto.length > MAX_SCAN) texto = texto.slice(0, MAX_SCAN);

  let resuelveIdx = -1;
  resuelveIdx = findDecisionStart(texto);
  const decision     = resuelveIdx >= 0 ? texto.slice(resuelveIdx).trim() : '';
  const preDecision  = resuelveIdx >= 0 ? texto.slice(0, resuelveIdx) : texto;

  const mProb = preDecision.match(RE_PROBLEMA);
  let problema = '';
  let method = 'regex_v1';
  if (mProb) {
    problema = preDecision.slice(mProb.index + mProb[0].length).trim();
    const mCons = problema.match(RE_CONSIDER);
    if (mCons && mCons.index > 50) problema = problema.slice(0, mCons.index).trim();
  } else {
    const mCons = preDecision.match(RE_CONSIDER);
    if (mCons) {
      problema = preDecision.slice(mCons.index + mCons[0].length).trim();
      method = 'regex_v1_fallback';
    }
  }

  let ratio = '';
  const mRatio = problema.match(RE_RATIO_EXPL);
  if (mRatio) ratio = mRatio[1].trim();

  const sentido  = detectSentido(decision);
  const derechos = detectDerechos((problema + ' ' + decision).slice(0, 8000));

  if (!problema && !decision) return null;

  return {
    id: row.id,
    problema_juridico: problema.slice(0, 5000),
    ratio_decidendi:   ratio.slice(0, 3000),
    decision_texto:    decision.slice(0, 3000),
    sentido,
    derechos,
    extraction_method: method,
  };
}

// ---------------- SQL ----------------
function sqlEscape(s) {
  if (s == null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

function rowToSql(r) {
  return `INSERT OR REPLACE INTO sentencias_resumen (id, problema_juridico, ratio_decidendi, decision_texto, sentido, derechos, extraction_method) VALUES (${sqlEscape(r.id)}, ${sqlEscape(r.problema_juridico)}, ${sqlEscape(r.ratio_decidendi)}, ${sqlEscape(r.decision_texto)}, ${sqlEscape(r.sentido)}, ${sqlEscape(JSON.stringify(r.derechos))}, ${sqlEscape(r.extraction_method)});`;
}

function extractAndWrite() {
  if (!fs.existsSync(INPUT_JSON)) { console.error(`✗ Falta ${INPUT_JSON}. Corre primero --dump`); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf-8'));
  const limit = opt('limit') ? parseInt(opt('limit'), 10) : rows.length;
  const slice = rows.slice(0, limit);

  const stats = { total: slice.length, ok: 0, skipped: 0, bySentido: {}, byMethod: {} };
  const out = [];

  for (const row of slice) {
    const r = extract(row);
    if (!r) { stats.skipped++; continue; }
    out.push(r);
    stats.ok++;
    stats.bySentido[r.sentido] = (stats.bySentido[r.sentido] || 0) + 1;
    stats.byMethod[r.extraction_method] = (stats.byMethod[r.extraction_method] || 0) + 1;
  }

  for (const f of fs.readdirSync(CWD)) {
    if (f.startsWith(OUT_GLOB) && f.endsWith('.sql')) fs.unlinkSync(path.join(CWD, f));
  }

  let fileIdx = 0;
  for (let i = 0; i < out.length; i += CHUNK) {
    const chunk = out.slice(i, i + CHUNK);
    const file = `${OUT_GLOB}_${String(fileIdx).padStart(3, '0')}.sql`;
    fs.writeFileSync(path.join(CWD, file), chunk.map(rowToSql).join('\n'), 'utf-8');
    fileIdx++;
  }

  console.log('─── RESUMEN EXTRACCIÓN ───');
  console.log(`Total input:    ${stats.total}`);
  console.log(`Extraídos OK:   ${stats.ok}`);
  console.log(`Saltados:       ${stats.skipped}`);
  console.log(`Archivos SQL:   ${fileIdx}`);
  console.log(`Por sentido:    ${JSON.stringify(stats.bySentido)}`);
  console.log(`Por método:     ${JSON.stringify(stats.byMethod)}`);
}

function apply() {
  const files = fs.readdirSync(CWD).filter(f => f.startsWith(OUT_GLOB) && f.endsWith('.sql')).sort();
  if (!files.length) { console.error('✗ No hay archivos inserts_*.sql'); process.exit(1); }
  console.log(`→ Aplicando ${files.length} archivos a ${DB} remoto...`);
  for (const f of files) {
    process.stdout.write(`  ${f} ... `);
    try {
      execSync(`wrangler d1 execute ${DB} --remote --file=./${f}`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
      console.log('OK');
    } catch (e) {
      console.log('ERROR');
      console.error(e.stdout || e.message);
      process.exit(1);
    }
  }
  console.log('✓ Aplicación completa');
}

// ---------------- main ----------------
if (flag('dump'))         dump();
else if (flag('extract')) extractAndWrite();
else if (flag('apply'))   apply();
else {
  console.log('Uso:');
  console.log('  node extraer_resumen.mjs --dump                # exporta sentencias a sentencias.json (paginado)');
  console.log('  node extraer_resumen.mjs --extract             # procesa y escribe inserts_resumen_*.sql');
  console.log('  node extraer_resumen.mjs --extract --limit=20  # solo 20 filas (validación)');
  console.log('  node extraer_resumen.mjs --apply               # ejecuta los SQL con wrangler');
}