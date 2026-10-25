const BASE = 'https://api.yellowtips.com';
const KEY  = 'yt_live_test_abc123abc123abc123abc123abc123abc123abc';

async function call(label, path, headers = {}, expectStatus = 200, validate = null) {
  const url = `${BASE}${path}`;
  try {
    const r = await fetch(url, { headers });
    const status = r.status;
    const body = await r.json();
    const statusOk = status === expectStatus;
    const validateOk = validate ? validate(body) : true;
    const ok = statusOk && validateOk;
    console.log(`\n${ok ? '✅' : '❌'} ${label}`);
    console.log(`   ${path}`);
    console.log(`   Status: ${status} (esperado: ${expectStatus})`);
    if (validate && !validateOk) console.log(`   ⚠️  Validación de body falló`);
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

  // ─── CASOS FELICES ───
  results.push(await call(
    'Búsqueda simple q=pension',
    '/v1/legal/argument?q=pension&limit=3',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Filtro sentido=concede',
    '/v1/legal/argument?q=pension&sentido=concede&limit=3',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Filtro sentido=niega',
    '/v1/legal/argument?q=pension&sentido=niega&limit=3',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Filtro sentido=indeterminado',
    '/v1/legal/argument?q=pension&sentido=indeterminado&limit=2',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Filtro derecho=estabilidad',
    '/v1/legal/argument?q=estabilidad&derecho=estabilidad&limit=2',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Filtro derecho=discapacidad',
    '/v1/legal/argument?q=discapacidad&derecho=discapacidad&limit=2',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Multi-palabra q="pension de vejez"',
    '/v1/legal/argument?q=' + encodeURIComponent('pension de vejez') + '&limit=2',
    { 'X-API-Key': KEY }
  ));

  results.push(await call(
    'Query con tilde (pensión) → expansion',
    '/v1/legal/argument?q=' + encodeURIComponent('pensión') + '&limit=2',
    { 'X-API-Key': KEY }
  ));

  // ─── VALIDACIONES DE BODY ───
  results.push(await call(
    'Query expansion: fts_query="pensi*"',
    '/v1/legal/argument?q=pension&limit=1',
    { 'X-API-Key': KEY },
    200,
    (body) => body?.data?.fts_query === 'pensi*'
  ));

  results.push(await call(
    'Limit capeado a 20 (limit=100)',
    '/v1/legal/argument?q=pension&limit=100',
    { 'X-API-Key': KEY },
    200,
    (body) => body?.data?.limit === 20
  ));

  results.push(await call(
    'Limit default 10 (limit=0)',
    '/v1/legal/argument?q=pension&limit=0',
    { 'X-API-Key': KEY },
    200,
    (body) => body?.data?.limit === 10
  ));

  // ─── CASOS DE ERROR ───
  results.push(await call(
    'Sin q → 400',
    '/v1/legal/argument',
    { 'X-API-Key': KEY },
    400
  ));

  results.push(await call(
    'sentido inválido → 400',
    '/v1/legal/argument?q=pension&sentido=garchado',
    { 'X-API-Key': KEY },
    400
  ));

  results.push(await call(
    'Sin API key → 401',
    '/v1/legal/argument?q=pension',
    {},
    401
  ));

  results.push(await call(
    'Query solo stopwords → 400',
    '/v1/legal/argument?q=' + encodeURIComponent('de la el los'),
    { 'X-API-Key': KEY },
    400
  ));

  console.log('\n\n═══════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  console.log(`RESUMEN: ${passed}/${results.length} tests pasaron`);
  if (passed < results.length) {
    console.log('Tests fallidos:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.label} (status: ${r.status})`));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});