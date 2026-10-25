import { readFileSync } from 'fs';

const raw = JSON.parse(readFileSync('data/test_t.json', 'utf8'));
// wrangler --json devuelve [{results:[...]}]
const rows = Array.isArray(raw) ? (raw[0]?.results ?? []) : (raw.results ?? []);

console.log(`Probando ${rows.length} URLs...\n`);

let ok = 0, ko = 0;
const fallos = [];

for (const r of rows) {
  const fecha = (r.fecha || '').slice(0, 4);
  const [tipo, num, yy] = r.id.split('-');
  const url = `https://www.corteconstitucional.gov.co/relatoria/${fecha}/${tipo}-${num}-${yy}.htm`;

  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) { ok++; console.log(`✅ ${r.id}  (${res.status})`); }
    else { ko++; fallos.push({ id: r.id, status: res.status, url }); console.log(`❌ ${r.id}  (${res.status})`); }
  } catch (e) {
    ko++; fallos.push({ id: r.id, status: 'ERR', url, err: e.message });
    console.log(`❌ ${r.id}  (${e.message})`);
  }
  await new Promise(r => setTimeout(r, 1200)); // rate limit
}

console.log(`\n── Resultado ──`);
console.log(`OK: ${ok}  /  Fallos: ${ko}  /  Total: ${rows.length}`);
console.log(`Tasa de éxito: ${((ok / rows.length) * 100).toFixed(1)}%`);
if (fallos.length) {
  console.log(`\nFallos:`);
  for (const f of fallos) console.log(` - ${f.id} → ${f.status}`);
}