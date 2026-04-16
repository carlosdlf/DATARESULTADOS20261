const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const ID_AMBITO_EXTRANJERO = 2;
const OUTPUT_FILE = path.join(__dirname, 'extranjero.json');
const OUTPUT_DIR = path.join(__dirname, 'resultados_extranjero');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchJSON(url) {
  try {
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, '-H', 'Accept: application/json', url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return [];
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return [];
    const data = JSON.parse(text);
    return data.data || data || [];
  } catch (e) {
    console.error('Fetch error:', e.message);
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

function obtenerContinentes() {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO_EXTRANJERO}`);
}

function obtenerPaisesPorContinente(codContinente) {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/provincias?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO_EXTRANJERO}&idUbigeoDepartamento=${codContinente}`);
}

function obtenerCiudadesPorPais(codPais) {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/distritos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO_EXTRANJERO}&idUbigeoProvincia=${codPais}`);
}

function obtenerResultados(nivel, params = {}) {
  const url = new URL(`${BASE_URL}/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  url.searchParams.set('tipoFiltro', nivel);
  url.searchParams.set('idAmbitoGeografico', ID_AMBITO_EXTRANJERO);
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

function calcularVotos(continentes) {
  const votos = {};
  for (const cont of continentes) {
    for (const c of cont.candidatos) {
      if (!votos[c.codigoPartido]) {
        votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
      }
      votos[c.codigoPartido].votos += c.votos;
    }
    if (cont.paises) {
      for (const pais of cont.paises) {
        for (const c of pais.candidatos) {
          if (!votos[c.codigoPartido]) {
            votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
          }
          votos[c.codigoPartido].votos += c.votos;
        }
        if (pais.ciudades) {
          for (const ciudad of pais.ciudades) {
            for (const c of ciudad.candidatos) {
              if (!votos[c.codigoPartido]) {
                votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
              }
              votos[c.codigoPartido].votos += c.votos;
            }
          }
        }
      }
    }
  }
  const lista = Object.values(votos).sort((a, b) => b.votos - a.votos);
  let total = lista.reduce((s, c) => s + c.votos, 0);
  for (const c of lista) c.porcentajeVotos = total > 0 ? parseFloat((c.votos / total * 100).toFixed(2)) : 0;
  return lista;
}

function sanitizar(nombre) {
  return nombre.replace(/[^a-zA-Z0-9]/g, '_');
}

function procesarContinente(contRaw, idx) {
  const codCont = contRaw.ubigeo || contRaw.codigo || contRaw.id;
  const nomCont = contRaw.nombre || contRaw.descripcion || `continente_${idx}`;
  
  console.log(`   ${nomCont}`);
  
  const continente = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'continente',
    continente: { codigo: codCont, nombre: nomCont },
    candidatos: [],
    paises: []
  };
  
  const candidatosCont = obtenerResultados('extranjero_nivel_01', { ubigeoNivel1: codCont });
  if (candidatosCont && candidatosCont.length > 0) {
    continente.candidatos = candidatosCont.map(transformar);
  }
  
  const paisesRaw = obtenerPaisesPorContinente(codCont);
  
  for (const p of paisesRaw) {
    const codPais = p.ubigeo || p.codigo || p.id;
    const nomPais = p.nombre || p.descripcion || 'Unknown';
    
    const pais = {
      codigo: codPais,
      nombre: nomPais,
      candidatos: [],
      ciudades: []
    };
    
    const candidatosPais = obtenerResultados('extranjero_nivel_02', { 
      ubigeoNivel1: codCont, 
      ubigeoNivel2: codPais 
    });
    if (candidatosPais && candidatosPais.length > 0) {
      pais.candidatos = candidatosPais.map(transformar);
    }
    
    const ciudadesRaw = obtenerCiudadesPorPais(codPais);
    
    for (const c of ciudadesRaw) {
      const codCiudad = c.ubigeo || c.codigo || c.id;
      const nomCiudad = c.nombre || c.descripcion || 'Unknown';
      
      const resultadosCiudad = obtenerResultados('extranjero_nivel_03', {
        ubigeoNivel1: codCont,
        ubigeoNivel2: codPais,
        ubigeoNivel3: codCiudad
      });
      
      pais.ciudades.push({
        codigo: codCiudad,
        nombre: nomCiudad,
        candidatos: resultadosCiudad.map(transformar)
      });
    }
    
    continente.paises.push(pais);
  }
  
  return continente;
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const t0 = Date.now();
  
  console.log('=== ONPE: Voto Extranjero ===\n');
  
  console.log('1. Obteniendo continentes...');
  const continentesRaw = obtenerContinentes();
  console.log(`   ${continentesRaw.length} continentes\n`);
  
  if (continentesRaw.length === 0) {
    console.log('No se pudieron obtener continentes');
    return;
  }
  
  const continentes = [];
  
  for (let i = 0; i < continentesRaw.length; i++) {
    const contRaw = continentesRaw[i];
    const codCont = contRaw.ubigeo || contRaw.codigo || contRaw.id;
    const nomCont = contRaw.nombre || contRaw.descripcion || `continente_${i}`;
    
    console.log(`[${i+1}/${continentesRaw.length}] ${nomCont}`);
    
    const continente = procesarContinente(contRaw, i);
    
    continente.total = calcularVotos([continente]);
    
    const filename = `continente_${String(i).padStart(2, '0')}_${codCont}_${sanitizar(nomCont)}.json`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(continente, null, 2));
    console.log(`   -> Guardado: ${filename}`);
    
    continentes.push(continente);
  }
  
  const extranjero = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    nivel: 'extranjero_completo',
    continentes: continentes,
    total: calcularVotos(continentes)
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(extranjero, null, 2));
  
  const totalVotos = extranjero.total.reduce((s, c) => s + c.votos, 0);
  const totalPaises = continentes.reduce((s, cont) => s + cont.paises.length, 0);
  const totalCiudades = continentes.reduce((s, cont) => s + cont.paises.reduce((ss, p) => ss + p.ciudades.length, 0), 0);
  
  console.log(`\n=== COMPLETADO ===`);
  console.log(`Continentes: ${continentes.length}`);
  console.log(`Paises: ${totalPaises}`);
  console.log(`Ciudades: ${totalCiudades}`);
  console.log(`Total votos extranjero: ${totalVotos.toLocaleString()}`);
  console.log(`Carpeta: ${OUTPUT_DIR}/`);
  console.log(`Consolidado: ${OUTPUT_FILE}`);
  console.log(`Tiempo: ${(Date.now()-t0)/1000}s`);
}

main();