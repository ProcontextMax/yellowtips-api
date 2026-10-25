const BASE = 'https://api.yellowtips.com';
const KEY  = 'yt_live_test_abc123abc123abc123abc123abc123abc123abc';

async function call(label, path, headers = {}, expectStatus = 200) {
  const url = `${BASE}${path}`;
  try {
    const r = await fetch(url, { headers });
    const status = r.status;
    const body = await r.json();
    const ok = status === expectStatus;
    console.log(`\n${ok ? '✅' : '❌'} ${label}`);
    console.log(`   ${path}`);
    console.log(`   Status: ${status} (esperado: ${expectStatus})`);
    console.log(`   Body: ${JSON.stringify(body).slice(0, 400)}${JSON.stringify(body).length > 400 ? '...' : ''}`);
    return { label, status, body, ok };
  } catch (e) {
    console.log(`\n❌ ${label}`);
    console.log(`   ERROR: ${e.message}`);
    return { label, status: 'ERR', body: e.message, ok: false };
  }
}

async function main() {
  const results = [];

  // 1. Búsqueda frase exacta
  results.push(await call(
    'Búsqueda frase exacta',
    '/v1/legal/search?q=despido%20sin%20justa%20causa&limit=3',
    { 'X-API-Key': KEY }
  ));

  // 2. Búsqueda con filtro tipo=T
  results.push(await call(
    'Búsqueda con filtro tipo=T',
    '/v1/legal/search?q=pensi%C3%B3n&tipo=T&limit=5',
    { 'X-API-Key': KEY }
  ));

  // 3. Búsqueda palabra simple
  results.push(await call(
    'Búsqueda palabra simple',
    '/v1/legal/search?q=salud&limit=2',
    { 'X-API-Key': KEY }
  ));

  // 4. Sin parámetro q → 400
  results.push(await call(
    'Sin q → 400',
    '/v1/legal/search',
    { 'X-API-Key': KEY },
    400
  ));

  // 5. Sin API key → 401
  results.push(await call(
    'Sin API key → 401',
    '/v1/legal/search?q=despido',
    {},
    401
  ));

  // 6. Tipo inválido → 400
  results.push(await call(
    'Tipo inválido → 400',
    '/v1/legal/search?q=despido&tipo=XYZ',
    { 'X-API-Key': KEY },
    400
  ));

  // 7. Query con caracteres especiales que rompen FTS5
  results.push(await call(
    'Query con caracteres FTS5 (comillas, AND)',
    '/v1/legal/search?q=' + encodeURIComponent('despido "sin AND causa*'),
    { 'X-API-Key': KEY }
  ));

  console.log('\n\n══════════════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  console.log(`RESUMEN: ${passed}/${results.length} tests pasaron`);
  if (passed < results.length) {
    console.log('Tests fallidos:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.label} (status: ${r.status})`));
  }
}

main();