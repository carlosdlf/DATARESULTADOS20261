const fs = require('fs');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = [
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
  'Connection: keep-alive'
];

function fetchJSON(url) {
  try {
    const args = ['-s', '-A', USER_AGENT];
    for (const h of HEADERS) args.push('-H', h);
    args.push(url);
    const child = spawnSync('curl', args, { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return null;
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return null;
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function guardarJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function guardarJsonMin(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data));
}

function getActas(data) {
  if (!data) return null;
  const v = data.actasContabilizadas;
  if (v !== null && v !== undefined) return v;
  const p = data.participacionCiudadana;
  if (p !== null && p !== undefined) return p;
  return null;
}

function main() {
  console.log('\n=== ONPE: GLOBAL ===\n');
  
  const totales = fetchJSON(`${BASE_URL}/presentacion-backend/resumen-general/totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`);
  const resultados = fetchJSON(`${BASE_URL}/presentacion-backend/resumen-general/participantes?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`);
  
  if (!totales || !totales.data) {
    console.log('Error obteniendo totales globales');
    return;
  }
  
  if (!resultados || !resultados.data) {
    console.log('Error obteniendo resultados globales');
    return;
  }
  
  const global = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'global',
    actasactualizadas: getActas(totales.data),
    participacionCiudadana: totales.data.participacionCiudadana || null,
    totalVotosValidos: totales.data.totalVotosValidos || 0,
    totalVotosEmitidos: totales.data.totalVotosEmitidos || 0,
    candidatos: resultados.data.map(c => ({
      partido: c.nombreAgrupacionPolitica,
      codigoPartido: c.codigoAgrupacionPolitica,
      candidato: c.nombreCandidato || null,
      votos: parseInt(c.totalVotosValidos) || 0,
      porcentajeVotos: parseFloat(c.porcentajeVotosValidos) || 0
    }))
  };
  
  console.log('actasContabilizadas:', global.actasactualizadas);
  console.log('participacionCiudadana:', global.participacionCiudadana);
  console.log('totalVotosValidos:', global.totalVotosValidos);
  console.log('candidatos:', global.candidatos.length);
  
  console.log('\n--- Top 5 ---');
  global.candidatos.slice(0, 5).forEach(c => {
    console.log(`${c.porcentajeVotos.toString().padStart(6)}% | ${c.votos.toString().padStart(8)} | ${c.partido}`);
  });
  
  console.log('\nGuardando global.json y global.min.json...');
  guardarJson('global.json', global);
  guardarJsonMin('global.min.json', global);
  
  console.log('\n=== COMPLETADO ===');
  console.log('Archivos: global.json, global.min.json');
}

main();