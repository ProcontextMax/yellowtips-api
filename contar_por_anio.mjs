const DATASET = 'https://www.datos.gov.co/resource/v2k4-2t8s.json';

async function contar(where) {
  const url = `${DATASET}?$select=count(*)&$where=${encodeURIComponent(where)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return parseInt(json[0].count, 10);
}

async function main() {
  const años = [2026, 2025, 2024, 2023, 2022];
  console.log('Año | Total sentencias | Solo T | Solo C | Solo SU');
  console.log('----|------------------|--------|--------|--------');
  for (const año of años) {
    const base = `fecha_sentencia >= '${año}-01-01T00:00:00.000' AND fecha_sentencia < '${año + 1}-01-01T00:00:00.000'`;
    try {
      const total = await contar(base);
      const t   = await contar(`${base} AND sentencia_tipo='T'`);
      const c   = await contar(`${base} AND sentencia_tipo='C'`);
      const su  = await contar(`${base} AND sentencia_tipo='SU'`);
      console.log(`${año} | ${String(total).padStart(16)} | ${String(t).padStart(6)} | ${String(c).padStart(6)} | ${String(su).padStart(7)}`);
    } catch (e) {
      console.log(`${año} | ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });