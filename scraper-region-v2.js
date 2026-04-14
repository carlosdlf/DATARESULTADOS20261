const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const UBIGEOS_FILE = path.join(__dirname, 'ubigeos.json');
const OUTPUT_DIR = path.join(__dirname, 'resultados');

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
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    return null;
  }
}

function sanitize(nombre) {
  return nombre.replace(/[^a-zA-Z0-9]/g, '_');
}

function obtenerTotalizador(params) {
  const url = new URL(`${BASE_URL}/presentacion-backend/resumen-general/totales`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return fetchJSON(url.toString());
}

function obtenerResultados(params) {
  const url = new URL(`${BASE_URL}/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  url.searchParams.set('listRegiones', 'TODOS,PERÚ,EXTRANJERO');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return fetchJSON(url.toString());
}

function transformarCandidato(c) {
  return {
    partido: c.nombreAgrupacionPolitica,
    codigoPartido: c.codigoAgrupacionPolitica,
    candidato: c.nombreCandidato || null,
    votos: parseInt(c.totalVotosValidos) || 0,
    porcentajeVotos: parseFloat(c.porcentajeVotosValidos) || 0
  };
}

function getActas(data) {
  if (!data) return null;
  const v = data.actasContabilizadas;
  if (v !== null && v !== undefined) return v;
  const p = data.participacionCiudadana;
  if (p !== null && p !== undefined) return p;
  return null;
}

function calcularTotal(data) {
  const votos = {};
  for (const r of data) {
    for (const c of r.candidatos || []) {
      if (!votos[c.codigoPartido]) {
        votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
      }
      votos[c.codigoPartido].votos += c.votos;
    }
  }
  const lista = Object.values(votos).sort((a, b) => b.votos - a.votos);
  const total = lista.reduce((s, c) => s + c.votos, 0);
  for (const c of lista) c.porcentajeVotos = total > 0 ? parseFloat((c.votos / total * 100).toFixed(2)) : 0;
  return lista;
}

function guardarJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function guardarJsonMin(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data));
}

function procesarRegion(dept, idx) {
  const region = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'region_completa',
    region: { codigo: dept.codigo, nombre: dept.nombre },
    actasactualizadas: null,
    candidatos: [],
    provincias: []
  };
  
  console.log(`   Obteniendo totales region...`);
  const totalesRegion = obtenerTotalizador({
    tipoFiltro: 'ubigeo_nivel_01',
    idAmbitoGeografico: 1,
    idUbigeoDepartamento: dept.codigo
  });
  if (totalesRegion && totalesRegion.data) {
    region.actasactualizadas = getActas(totalesRegion.data);
  }
  
  console.log(`   Obteniendo candidatos region...`);
  const resRegion = obtenerResultados({
    tipoFiltro: 'ubigeo_nivel_01',
    idAmbitoGeografico: 1,
    ubigeoNivel1: dept.codigo
  });
  if (resRegion && resRegion.data) {
    region.candidatos = resRegion.data.map(transformarCandidato);
  }
  
   console.log(`   ${dept.provincias.length} provincias...`);
  for (let pi = 0; pi < dept.provincias.length; pi++) {
    const p = dept.provincias[pi];
    console.log(`      [${dept.nombre}] Provincia ${pi+1}/${dept.provincias.length}: ${p.nombre}`);
    const prov = {
      codigo: p.codigo,
      nombre: p.nombre,
      actasactualizadas: null,
      candidatos: [],
      distritos: []
    };
    
    const resProv = obtenerResultados({
      tipoFiltro: 'ubigeo_nivel_02',
      idAmbitoGeografico: 1,
      ubigeoNivel1: dept.codigo,
      ubigeoNivel2: p.codigo
    });
    if (resProv && resProv.data) {
      prov.candidatos = resProv.data.map(transformarCandidato);
    }
    
    const totalesProv = obtenerTotalizador({
      tipoFiltro: 'ubigeo_nivel_02',
      idAmbitoGeografico: 1,
      idUbigeoDepartamento: dept.codigo,
      idUbigeoProvincia: p.codigo
    });
    if (totalesProv && totalesProv.data) {
      prov.actasactualizadas = getActas(totalesProv.data);
    }
    
    for (let di = 0; di < p.distritos.length; di++) {
      const d = p.distritos[di];
      const resDist = obtenerResultados({
        tipoFiltro: 'ubigeo_nivel_03',
        idAmbitoGeografico: 1,
        ubigeoNivel1: dept.codigo,
        ubigeoNivel2: p.codigo,
        ubigeoNivel3: d.codigo
      });
      
      const totalesDist = obtenerTotalizador({
        tipoFiltro: 'ubigeo_nivel_03',
        idAmbitoGeografico: 1,
        idUbigeoDepartamento: dept.codigo,
        idUbigeoProvincia: p.codigo,
        idUbigeoDistrito: d.codigo
      });
      
      prov.distritos.push({
        codigo: d.codigo,
        nombre: d.nombre,
        actasactualizadas: getActas(totalesDist && totalesDist.data ? totalesDist.data : null),
        candidatos: (resDist && resDist.data) ? resDist.data.map(transformarCandidato) : []
      });
    }
    console.log(`         -> ${p.distritos.length} distritos OK`);
    
    region.provincias.push(prov);
  }
  
  region.total = calcularTotal(region.provincias);
  return region;
}

function main() {
  const idx = process.argv.indexOf('--region');
  const regionIdx = idx !== -1 ? parseInt(process.argv[idx + 1]) : -1;
  
  const ubigeos = JSON.parse(fs.readFileSync(UBIGEOS_FILE, 'utf8'));
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  if (regionIdx >= 0) {
    if (regionIdx >= ubigeos.departamentos.length) {
      console.error(`Region ${regionIdx} no existe`);
      return;
    }
    const dept = ubigeos.departamentos[regionIdx];
    console.log(`\nProcesando region ${regionIdx}: ${dept.nombre}`);
    
    const t0 = Date.now();
    const region = procesarRegion(dept, regionIdx);
    
    const filename = `region_${String(regionIdx).padStart(2, '0')}_${dept.codigo}_${sanitize(dept.nombre)}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    guardarJson(filepath, region);
    
    console.log(`\nGuardado: ${filename}`);
    console.log(`Tiempo: ${(Date.now()-t0)/1000}s`);
    return;
  }
  
  console.log(`\n=== ONPE: SCRAPING REGIONES ===`);
  console.log(`Total regiones: ${ubigeos.departamentos.length}\n`);
  
  const peru = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'peru_completo',
    actasactualizadas: null,
    regiones: []
  };
  
  for (let i = 0; i < ubigeos.departamentos.length; i++) {
    const dept = ubigeos.departamentos[i];
    const filepath = path.join(OUTPUT_DIR, `region_${String(i).padStart(2, '0')}_${dept.codigo}_${sanitize(dept.nombre)}.json`);
    
    if (false && fs.existsSync(filepath)) {
      console.log(`[${i+1}/${ubigeos.departamentos.length}] ${dept.nombre} - YA EXISTE`);
      const regionData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      peru.regiones.push(regionData);
      continue;
    }
    
    console.log(`\n[${i+1}/${ubigeos.departamentos.length}] ${dept.nombre}...`);
    const t0 = Date.now();
    
    try {
      const region = procesarRegion(dept, i);
      guardarJson(filepath, region);
      peru.regiones.push(region);
      const totalDist = region.provincias.reduce((s, p) => s + p.distritos.length, 0);
      console.log(`   OK - ${region.actasactualizadas}% - ${region.provincias.length} provincias, ${totalDist} distritos (${(Date.now()-t0)/1000}s)`);
    } catch (e) {
      console.log(`   ERROR: ${e.message}`);
    }
  }
  
  const totalesPeru = obtenerTotalizador({ tipoFiltro: 'ambito_geografico', idAmbitoGeografico: 1 });
  if (totalesPeru && totalesPeru.data) {
    peru.actasactualizadas = getActas(totalesPeru.data);
  }
  peru.total = calcularTotal(peru.regiones);
  
  console.log('\n5. Guardando consolidado...');
  guardarJson('peru.json', peru);
  guardarJsonMin('peru.min.json', peru);
  
  const totalVotos = peru.total.reduce((s, c) => s + c.votos, 0);
  console.log(`\n=== COMPLETADO ===`);
  console.log(`Actas actualizadas Peru: ${peru.actasactualizadas}%`);
  console.log(`Regiones procesadas: ${peru.regiones.length}`);
  console.log(`Total votos: ${totalVotos.toLocaleString()}`);
  console.log(`Archivos: peru.json, peru.min.json`);
}

main();