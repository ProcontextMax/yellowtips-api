import { readFileSync } from 'fs';

const raw = JSON.parse(readFileSync('data/test_t.json', 'utf8'));
const rows = Array.isArray(raw) ? (raw[0]?.results ?? []) : (raw.results ?? []);
console.log(`Probando ${rows.length} URLs (GET + inspección de body)...\n`);

function isSoft404(html) {
  return /P[aá]gina\s+No\s+Encontrada/i.test(html)
      || /Page\s+Not\s+Found/i.test(html)
      || /<title>[^<]*404[^<]*<\/title>/i.test(html);
}

let ok = 0, soft = 0, err = 0;

for (const r of rows) {
  try {
    const res = await fetch(r.fuente_url, {
      headers: { 'User-Agent': 'YellowTips/1.0 (contacto: mvx555@gmail.com)' }
    });
    const html = await res.text();

    if (!res.ok) {
      err++;  console.log(`❌ ${r.id} (HTTP ${res.status})`);
    } else if (isSoft404(html)) {
      soft++; console.log(`🚫 ${r.id} (soft 404 — "Página No Encontrada")`);
    } else if (html.length < 5000) {
      err++;  console.log(`⚠️  ${r.id} (body sospechosamente corto: ${html.length} chars)`);
    } else {
      ok++;   console.log(`✅ ${r.id} (${html.length} chars — real)`);
    }
  } catch (e) {
    err++; console.log(`❌ ${r.id} (${e.message})`);
  }
  await new Promise(r => setTimeout(r, 1200));
}

console.log(`\n── Resultado ──`);
console.log(`OK real: ${ok}  /  Soft404: ${soft}  /  Errores: ${err}  /  Total: ${rows.length}`);
console.log(`Tasa real: ${((ok / rows.length) * 100).toFixed(1)}%`);