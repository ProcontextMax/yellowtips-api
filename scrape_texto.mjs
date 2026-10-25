// scrape_texto.mjs v2
// Descarga textos de T pendientes, detecta soft-404 y stubs, genera UPDATEs.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const INPUT       = 'data/t_pendientes.json';
const BATCH       = 25;
const DELAY_MS    = 1500;
const MIN_CHARS   = 20000;   // descarta stubs (< 20k chars)
const STUB_LENGTH = 8603;    // firma conocida de página genérica

function esc(s) {
  if (s == null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

function isSoft404(html) {
  return /P[aá]gina\s+No\s+Encontrada/i.test(html)
      || /Page\s+Not\s+Found/i.test(html);
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/\s+/g, ' ').trim();
}

async function main() {
  const raw = JSON.parse(readFileSync(INPUT, 'utf8'));
  const rows = Array.isArray(raw) ? (raw[0]?.results ?? []) : (raw.results ?? []);
  console.log(`Filas a procesar: ${rows.length}\n`);

  const results = [];
  const fallidos = [];
  let ok = 0, soft = 0, stub = 0, err = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const n = `[${i + 1}/${rows.length}]`;
    try {
      const res = await fetch(r.fuente_url, {
        headers: { 'User-Agent': 'YellowTips/1.0 (contacto: mvx555@gmail.com)' }
      });
      if (!res.ok) {
        err++; fallidos.push({ id: r.id, motivo: `HTTP ${res.status}` });
        console.log(`${n} ❌ ${r.id} (HTTP ${res.status})`);
      } else {
                const buf = await res.arrayBuffer();
        const html = new TextDecoder('iso-8859-1').decode(buf);
        if (isSoft404(html)) {
          soft++; fallidos.push({ id: r.id, motivo: 'soft 404' });
          console.log(`${n} 🚫 ${r.id} (soft 404)`);
        } else if (html.length === STUB_LENGTH || html.length < MIN_CHARS) {
          stub++; fallidos.push({ id: r.id, motivo: `stub (${html.length} chars)` });
          console.log(`${n} ⚠️  ${r.id} (stub, ${html.length} chars)`);
        } else {
          const texto = extractText(html);
          results.push({ id: r.id, texto });
          ok++;
          console.log(`${n} ✅ ${r.id} (${texto.length} chars texto)`);
        }
      }
    } catch (e) {
      err++; fallidos.push({ id: r.id, motivo: e.message });
      console.log(`${n} ❌ ${r.id} (${e.message})`);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n── Resumen descarga ──`);
  console.log(`OK: ${ok}  /  Soft404: ${soft}  /  Stubs: ${stub}  /  Errores: ${err}  /  Total: ${rows.length}`);
  console.log(`Tasa real de texto útil: ${((ok / rows.length) * 100).toFixed(1)}%`);

  if (fallidos.length) {
    writeFileSync('data/t_fallidos.txt', fallidos.map(f => `${f.id}\t${f.motivo}`).join('\n'));
    console.log(`\nFallidos guardados en data/t_fallidos.txt`);
  }

  if (results.length === 0) { console.log('Nada que escribir.'); return; }

  mkdirSync('data', { recursive: true });
  for (let i = 0, b = 1; i < results.length; i += BATCH, b++) {
    const batch = results.slice(i, i + BATCH);
    const path = join('data', `updates_t_${String(b).padStart(3, '0')}.sql`);
    writeFileSync(path, batch.map(r =>
      `UPDATE sentencias SET texto = ${esc(r.texto)} WHERE id = ${esc(r.id)};`
    ).join('\n'));
    console.log(`✅ ${path} — ${batch.length} UPDATEs`);
  }
  console.log(`\nListo. ${results.length} textos listos para cargar.`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });