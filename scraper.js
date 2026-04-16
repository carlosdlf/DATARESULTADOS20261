const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const ID_AMBITO = 1;
const UBIGEOS_FILE = path.join(__dirname, 'ubigeos.json');
const OUTPUT_DIR = path.join(__dirname, 'resultados');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchJSON(url) {
  try {
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, '-H', 'Accept: application/json', url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return [];
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return [];
    const data = JSON.parse(text);
    return data.data || [];
  } catch (e) {
    return [];
  }
}

function fetchJSONDirect(url) {
  try {
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, '-H', 'Accept: application/json', url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return null;
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return null;
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function obtenerTotalizador() {
  return fetchJSONDirect(`${BASE_URL}/presentacion-backend/resumen-general/totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`);
}

function obtenerTotalesPeru() {
  const url = new URL(`${BASE_URL}/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  url.searchParams.set('tipoFiltro', 'eleccion');
  return fetchJSONDirect(url.toString());
}

function obtenerResultados(nivel, params = {}) {
  const url = new URL(`${BASE_URL}/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  url.searchParams.set('tipoFiltro', nivel);
  url.searchParams.set('idAmbitoGeografico', ID_AMBITO);
  url.searchParams.set('listRegiones', 'TODOS,PERÚ,EXTRANJERO');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return fetchJSON(url.toString());
}

function transformar(c) {
  return {
    partido: c.nombreAgrupacionPolitica,
    codigoPartido: c.codigoAgrupacionPolitica,
    candidato: c.nombreCandidato || null,
    votos: parseInt(c.totalVotosValidos) || 0,
    porcentajeVotos: parseFloat(c.porcentajeVotosValidos) || 0
  };
}

function calcularVotos(data) {
  const votos = {};
  for (const r of data) {
    for (const c of r.candidatos) {
      if (!votos[c.codigoPartido]) {
        votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
      }
      votos[c.codigoPartido].votos += c.votos;
    }
  }
  const lista = Object.values(votos).sort((a,b) => b.votos - a.votos);
  let total = lista.reduce((s,c) => s + c.votos, 0);
  for (const c of lista) c.porcentajeVotos = total > 0 ? parseFloat((c.votos / total * 100).toFixed(2)) : 0;
  return lista;
}

function procesarRegion(dept) {
  const region = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'region_completa',
    region: { codigo: dept.codigo, nombre: dept.nombre },
    candidatos: [],
    provincias: []
  };
  
  const candidatos = obtenerResultados('ubigeo_nivel_01', { ubigeoNivel1: dept.codigo });
  region.candidatos = candidatos.map(transformar);
  
  for (const p of dept.provincias) {
    const pc = obtenerResultados('ubigeo_nivel_02', { 
      ubigeoNivel1: dept.codigo, 
      ubigeoNivel2: p.codigo 
    });
    const prov = {
      codigo: p.codigo,
      nombre: p.nombre,
      candidatos: pc.map(transformar),
      distritos: []
    };
    
    for (const dist of p.distritos) {
      const dc = obtenerResultados('ubigeo_nivel_03', {
        ubigeoNivel1: dept.codigo,
        ubigeoNivel2: p.codigo,
        ubigeoNivel3: dist.codigo
      });
      prov.distritos.push({
        codigo: dist.codigo,
        nombre: dist.nombre,
        candidatos: dc.map(transformar)
      });
    }
    region.provincias.push(prov);
  }
  
  region.total = calcularVotos(region.provincias);
  return region;
}

function main() {
  const ubigeos = JSON.parse(fs.readFileSync(UBIGEOS_FILE, 'utf8'));
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ONPE SCRAPER - ${new Date().toLocaleString('es-PE')}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total regiones: ${ubigeos.departamentos.length}`);
  console.log(`${'='.repeat(60)}\n`);

  const totalizadorData = obtenerTotalizador();
  const totalesPeru = obtenerTotalesPeru();
  
  if (totalizadorData && totalizadorData.data) {
    const d = totalizadorData.data;
    console.log(`  Totalizador obtenido`);
    console.log(`  Participacion: ${d.participacionCiudadana}%`);
    console.log(`  Votos emitidos: ${d.totalVotosEmitidos}`);
    console.log(`  Votos validos: ${d.totalVotosValidos}\n`);
  } else {
    console.log(`  No se pudo obtener totalizador\n`);
  }
  
  fs.writeFileSync('totalizador.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totales_peru: totalesPeru ? totalesPeru.data || totalesPeru : null,
    actas: totalizadorData && totalizadorData.data ? totalizadorData.data : null
  }, null, 2));
  
  const regionesProcesadas = [];
  
  for (let i = 0; i < ubigeos.departamentos.length; i++) {
    const dept = ubigeos.departamentos[i];
    const filename = `region_${String(i).padStart(2, '0')}_${dept.codigo}_${dept.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    console.log(`[${i+1}/${ubigeos.departamentos.length}] ${dept.nombre}`);
    
    try {
      const region = procesarRegion(dept);
      fs.writeFileSync(filepath, JSON.stringify(region, null, 2));
      regionesProcesadas.push({ index: i, nombre: dept.nombre, ok: true });
      console.log(`  ✓ ${region.provincias.length} provincias`);
    } catch(e) {
      console.log(`  ✗ ERROR: ${e.message}`);
      regionesProcesadas.push({ index: i, nombre: dept.nombre, ok: false });
    }
  }
  
  const exitosas = regionesProcesadas.filter(r => r.ok).length;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SCRAPING COMPLETO`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Regiones procesadas: ${exitosas}/${regionesProcesadas.length}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (regionesProcesadas.filter(r => r.ok).length === ubigeos.departamentos.length) {
    console.log(`${'='.repeat(60)}`);
    console.log(`  SUBIENDO A GITHUB`);
    console.log(`${'='.repeat(60)}\n`);
    const { execSync } = require('child_process');
    try {
      execSync('git add resultados/*.json *.json', { encoding: 'utf8' });
      const commitMsg = `Actualizacion: ${new Date().toISOString()}`;
      execSync(`git commit -m "${commitMsg}"`, { encoding: 'utf8' });
      execSync('git push', { encoding: 'utf8', timeout: 60000 });
      console.log(`\n  ✓ Subido a GitHub!`);
    } catch(e) {
      console.log(`\n  ✗ Error al subir: ${e.message}`);
    }
  } else {
    console.log('\nNo todas las regiones fueron procesadas. No se sube a GitHub.');
  }
}

main();
