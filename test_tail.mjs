const ID = 'T-233-26';
const URL = `https://www.corteconstitucional.gov.co/relatoria/2026/${ID}.htm`;

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

const r = await fetch(URL, { headers: { 'User-Agent': 'YellowTips/1.0 (contacto: mvx555@gmail.com)' } });
const html = await r.text();
const texto = extractText(html);

console.log(`ID:              ${ID}`);
console.log(`Re-extraido:     ${texto.length} chars`);
console.log(`En D1 (query):   30904 chars`);
console.log(`Match exacto:    ${texto.length === 30904}`);
console.log(`\nPrimeros 200 chars:\n${texto.slice(0, 200)}`);
console.log(`\nUltimos 200 chars:\n${texto.slice(-200)}`);