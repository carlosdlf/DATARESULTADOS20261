const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const OUTPUT_DIR = path.join(__dirname, 'resultados_extranjero');
const UBIGEOS_FILE = path.join(__dirname, 'ubigeos_extranjero.json');

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

function obtenerMapaContinentes() {
  console.log('1. Obteniendo estructura de continentes...');
  const data = fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=2`);
  
  if (!data || !data.data || !Array.isArray(data.data)) {
    console.log('No se pudo obtener estructura');
    return null;
  }
  
  const continentes = data.data;
  console.log(`   ${continentes.length} continentes`);
  return continentes.map(c => ({
    codigo: c.ubigeo,
    nombre: c.nombre
  }));
}

function construirMapa() {
  const continentes = obtenerMapaContinentes();
  if (!continentes) return null;
  
  const ubigeos = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    ambito: 'extranjero',
    continentes: []
  };
  
  console.log('\n2. Obteniendo paises y ciudades...');
  
  for (let i = 0; i < continentes.length; i++) {
    const cont = continentes[i];
    console.log(`   [${i+1}/${continentes.length}] ${cont.nombre}`);
    
    const continente = {
      codigo: cont.codigo,
      nombre: cont.nombre,
      paises: []
    };
    
    const paisesData = fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/provincias?idEleccion=${ID_ELECCION}&idAmbitoGeografico=2&idUbigeoDepartamento=${cont.codigo}`);
    
    if (paisesData && paisesData.data) {
      for (const p of paisesData.data) {
        const pais = {
          codigo: p.ubigeo,
          nombre: p.nombre,
          ciudades: []
        };
        
        const ciudadesData = fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/distritos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=2&idUbigeoProvincia=${p.ubigeo}`);
        
        if (ciudadesData && ciudadesData.data) {
          for (const c of ciudadesData.data) {
            pais.ciudades.push({
              codigo: c.ubigeo,
              nombre: c.nombre
            });
          }
        }
        
        continente.paises.push(pais);
      }
    }
    
    ubigeos.continentes.push(continente);
    console.log(`      -> ${continente.paises.length} paises, ${continente.paises.reduce((s, p) => s + p.ciudades.length, 0)} ciudades`);
  }
  
  return ubigeos;
}

function procesarContinente(cont, idx) {
  const continenteData = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'continente_completo',
    continente: { codigo: cont.codigo, nombre: cont.nombre },
    actasactualizadas: null,
    candidatos: [],
    paises: []
  };
  
  console.log(`   Obteniendo totales continente...`);
  const totalesCont = obtenerTotalizador({
    tipoFiltro: 'ubigeo_nivel_01',
    idAmbitoGeografico: 2,
    idUbigeoDepartamento: cont.codigo
  });
  if (totalesCont && totalesCont.data) {
    continenteData.actasactualizadas = getActas(totalesCont.data);
  }
  
  console.log(`   Obteniendo candidatos continente...`);
  const resCont = obtenerResultados({
    tipoFiltro: 'ubigeo_nivel_01',
    idAmbitoGeografico: 2,
    ubigeoNivel1: cont.codigo
  });
  if (resCont && resCont.data) {
    continenteData.candidatos = resCont.data.map(transformarCandidato);
  }
  
  console.log(`   ${cont.paises.length} paises...`);
  for (let pi = 0; pi < cont.paises.length; pi++) {
    const p = cont.paises[pi];
    console.log(`      [${cont.nombre}] Pais ${pi+1}/${cont.paises.length}: ${p.nombre}`);
    const paisData = {
      codigo: p.codigo,
      nombre: p.nombre,
      actasactualizadas: null,
      candidatos: [],
      ciudades: []
    };
    
    const resPais = obtenerResultados({
      tipoFiltro: 'ubigeo_nivel_02',
      idAmbitoGeografico: 2,
      ubigeoNivel1: cont.codigo,
      ubigeoNivel2: p.codigo
    });
    if (resPais && resPais.data) {
      paisData.candidatos = resPais.data.map(transformarCandidato);
    }
    
    const totalesPais = obtenerTotalizador({
      tipoFiltro: 'ubigeo_nivel_02',
      idAmbitoGeografico: 2,
      idUbigeoDepartamento: cont.codigo,
      idUbigeoProvincia: p.codigo
    });
    if (totalesPais && totalesPais.data) {
      paisData.actasactualizadas = getActas(totalesPais.data);
    }
    
    for (let ci = 0; ci < p.ciudades.length; ci++) {
      const c = p.ciudades[ci];
      const resCiudad = obtenerResultados({
        tipoFiltro: 'ubigeo_nivel_03',
        idAmbitoGeografico: 2,
        ubigeoNivel1: cont.codigo,
        ubigeoNivel2: p.codigo,
        ubigeoNivel3: c.codigo
      });
      
      const totalesCiudad = obtenerTotalizador({
        tipoFiltro: 'ubigeo_nivel_03',
        idAmbitoGeografico: 2,
        idUbigeoDepartamento: cont.codigo,
        idUbigeoProvincia: p.codigo,
        idUbigeoDistrito: c.codigo
      });
      
      paisData.ciudades.push({
        codigo: c.codigo,
        nombre: c.nombre,
        actasactualizadas: getActas(totalesCiudad.data),
        candidatos: (resCiudad && resCiudad.data) ? resCiudad.data.map(transformarCandidato) : []
      });
    }
    console.log(`         -> ${p.ciudades.length} ciudades OK`);
    
    continenteData.paises.push(paisData);
  }
  
  continenteData.total = calcularTotal([continenteData]);
  return continenteData;
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  let ubigeos;
  if (fs.existsSync(UBIGEOS_FILE)) {
    console.log('\nUsando mapa existente...');
    ubigeos = JSON.parse(fs.readFileSync(UBIGEOS_FILE, 'utf8'));
  } else {
    console.log('\n=== ONPE: CONSTRUYENDO MAPA EXTRANJERO ===');
    ubigeos = construirMapa();
    if (!ubigeos) return;
    guardarJson(UBIGEOS_FILE, ubigeos);
    console.log(`   Guardado: ${UBIGEOS_FILE}`);
  }
  
  console.log('\n=== ONPE: SCRAPING EXTRANJERO ===\n');
  
  const extranjero = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'extranjero_completo',
    actasactualizadas: null,
    continentes: []
  };
  
  const totalesExt = obtenerTotalizador({ tipoFiltro: 'ambito_geografico', idAmbitoGeografico: 2 });
  if (totalesExt && totalesExt.data) {
    extranjero.actasactualizadas = getActas(totalesExt.data);
    console.log(`Actas extranjero: ${extranjero.actasactualizadas}%\n`);
  }
  
  for (let i = 0; i < ubigeos.continentes.length; i++) {
    const cont = ubigeos.continentes[i];
    console.log(`[${i+1}/${ubigeos.continentes.length}] ${cont.nombre}...`);
    
    const continenteData = procesarContinente(cont, i);
    
    const filename = `continente_${String(i).padStart(2, '0')}_${cont.codigo}_${sanitize(cont.nombre)}.json`;
    guardarJson(path.join(OUTPUT_DIR, filename), continenteData);
    
    const totalCiudades = continenteData.paises.reduce((s, p) => s + p.ciudades.length, 0);
    console.log(`   OK - ${continenteData.actasactualizadas}% - ${continenteData.paises.length} paises, ${totalCiudades} ciudades`);
    
    extranjero.continentes.push(continenteData);
  }
  
  extranjero.total = calcularTotal(extranjero.continentes);
  
  console.log('\n4. Guardando consolidado...');
  guardarJson('extranjero.json', extranjero);
  guardarJsonMin('extranjero.min.json', extranjero);
  guardarJson(path.join(OUTPUT_DIR, 'consolidado.json'), extranjero);
  guardarJsonMin(path.join(OUTPUT_DIR, 'consolidado.min.json'), extranjero);
  
  const totalVotos = extranjero.total.reduce((s, c) => s + c.votos, 0);
  const totalPaises = extranjero.continentes.reduce((s, cont) => s + cont.paises.length, 0);
  const totalCiudades = extranjero.continentes.reduce((s, cont) => s + cont.paises.reduce((ss, p) => ss + p.ciudades.length, 0), 0);
  
  console.log(`\n=== COMPLETADO ===`);
  console.log(`Actas actualizadas: ${extranjero.actasactualizadas}%`);
  console.log(`Continentes: ${extranjero.continentes.length}`);
  console.log(`Paises: ${totalPaises}`);
  console.log(`Ciudades: ${totalCiudades}`);
  console.log(`Total votos: ${totalVotos.toLocaleString()}`);
  console.log(`Archivos: ${OUTPUT_DIR}/`);
}

main();