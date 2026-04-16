const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const OUTPUT_FILE = path.join(__dirname, 'totalizador.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchJSON(url) {
  try {
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return null;
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return null;
    const data = JSON.parse(text);
    return data.data || null;
  } catch (e) {
    return null;
  }
}

function obtenerTotalizador() {
  return fetchJSON(`${BASE_URL}/presentacion-backend/resumen-general/totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`);
}

function main() {
  console.log('Obteniendo totalizador nacional...');
  const data = obtenerTotalizador();
  
  if (!data) {
    console.error('Error al obtener datos');
    return;
  }
  
  const totalizador = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    fuente: 'ONPE resumen-general/totales',
    actas: {
      totalActas: data.totalActas,
      actasContabilizadas: data.contabilizadas,
      actasContabilizadasPorcentaje: data.actasContabilizadas,
      actasEnviadasJee: data.enviadasJee,
      actasEnviadasJeePorcentaje: data.actasEnviadasJee,
      actasPendientesJee: data.pendientesJee,
      actasPendientesJeePorcentaje: data.actasPendientesJee
    },
    participacion: {
      participacionCiudadana: data.participacionCiudadana,
      totalVotosEmitidos: data.totalVotosEmitidos,
      totalVotosValidos: data.totalVotosValidos,
      porcentajeVotosEmitidos: data.porcentajeVotosEmitidos,
      porcentajeVotosValidos: data.porcentajeVotosValidos
    },
    ubicacion: {
      idUbigeoDepartamento: data.idUbigeoDepartamento,
      idUbigeoProvincia: data.idUbigeoProvincia,
      idUbigeoDistrito: data.idUbigeoDistrito,
      idUbigeoDistritoElectoral: data.idUbigeoDistritoElectoral
    },
    fechaActualizacion: new Date(data.fechaActualizacion).toISOString()
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(totalizador, null, 2));
  console.log(`Guardado: ${OUTPUT_FILE}`);
  console.log(JSON.stringify(totalizador, null, 2));
}

main();