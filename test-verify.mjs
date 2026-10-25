const BASE = 'https://api.yellowtips.com';
const KEY  = 'yt_live_test_abc123abc123abc123abc123abc123abc123abc';

async function verify(label, body, expectStatus = 200) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📝 ${label}`);
  console.log(`   Body: ${JSON.stringify(body)}`);
  try {
    const r = await fetch(`${BASE}/v1/legal/verify-citation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    const ok = r.status === expectStatus;
    console.log(`   ${ok ? '✅' : '❌'} Status: ${r.status} (esperado: ${expectStatus})`);
    console.log(`   Response: ${JSON.stringify(json).slice(0, 350)}${JSON.stringify(json).length > 350 ? '...' : ''}`);
    return ok;
  } catch (e) {
    console.log(`   ❌ ERROR: ${e.message}`);
    return false;
  }
}

async function main() {
  const results = [];

  // 1. Cita REAL de 2026 en la DB → debe ser confirmed + valid
  results.push(await verify(
    'Cita real 2026 (formato "de año")',
    { citation: 'Sentencia T-123 de 2026', jurisdiction: 'CO' }
  ));

  // 2. Misma cita, formato compacto
  results.push(await verify(
    'Cita real 2026 (formato "T-123-2026")',
    { citation: 'T-123-2026', jurisdiction: 'CO' }
  ));

  // 3. Cita real 2026 con proposition (test relevance)
  results.push(await verify(
    'Cita real + proposition',
    { citation: 'Sentencia T-123 de 2026', jurisdiction: 'CO', proposition: 'despido sin justa causa' }
  ));

  // 4. Cita DEMO existente (C-567-2019)
  results.push(await verify(
    'Cita demo existente (C-567-2019)',
    { citation: 'Sentencia C-567 de 2019', jurisdiction: 'CO' }
  ));

  // 5. Cita INEXISTENTE → partial + not_found
  results.push(await verify(
    'Cita inexistente (T-9999 de 2099)',
    { citation: 'Sentencia T-9999 de 2099', jurisdiction: 'CO' }
  ));

  // 6. Jurisdicción no soportada → 400
  results.push(await verify(
    'Jurisdicción inválida (XX)',
    { citation: 'Sentencia T-123 de 2026', jurisdiction: 'XX' },
    400
  ));

  // 7. Sin API key → 401
  console.log(`\n${'─'.repeat(60)}`);
  console.log('📝 Sin API key → 401');
  const r = await fetch(`${BASE}/v1/legal/verify-citation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citation: 'T-123-2026', jurisdiction: 'CO' }),
  });
  const j = await r.json();
  const okNoKey = r.status === 401;
  console.log(`   ${okNoKey ? '✅' : '❌'} Status: ${r.status} (esperado: 401)`);
  console.log(`   Response: ${JSON.stringify(j)}`);
  results.push(okNoKey);

  console.log(`\n${'═'.repeat(60)}`);
  const passed = results.filter(r => r).length;
  console.log(`RESUMEN: ${passed}/${results.length} tests pasaron`);
}

main();