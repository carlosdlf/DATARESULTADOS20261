const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;
const ID_AMBITO = 1;
const OUTPUT_FILE = path.join(__dirname, 'ubigeos.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchJSON(url) {
  try {
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return [];
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return [];
    const data = JSON.parse(text);
    return data.data || [];
  } catch (e) {
    console.error('Fetch error:', e.message);
    return [];
  }
}

function obtenerDepartamentos() {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO}`);
}

function obtenerProvincias(codDepto) {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/provincias?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO}&idUbigeoDepartamento=${codDepto}`);
}

function obtenerDistritos(codProv) {
  return fetchJSON(`${BASE_URL}/presentacion-backend/ubigeos/distritos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${ID_AMBITO}&idUbigeoProvincia=${codProv}`);
}

function scrape() {
  const t0 = Date.now();
  console.log('=== Obteniendo estructura completa de ubigeos ===\n');
  
  console.log('1. Departamentos...');
  const deptos = obtenerDepartamentos();
  console.log(`   ${deptos.length} departamentos`);
  
  const ubigeos = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    departamentos: []
  };
  
  console.log('2. Provincias y distritos...\n');
  for (let i = 0; i < deptos.length; i++) {
    const d = deptos[i];
    process.stdout.write(`   [${i+1}/${deptos.length}] ${d.nombre}...`);
    
    const dept = {
      codigo: d.ubigeo,
      nombre: d.nombre,
      provincias: []
    };
    
    const provs = obtenerProvincias(d.ubigeo);
    console.log(` ${provs.length} provincias`);
    
    for (const p of provs) {
      const prov = {
        codigo: p.ubigeo,
        nombre: p.nombre,
        distritos: []
      };
      
      const dists = obtenerDistritos(p.ubigeo);
      for (const dist of dists) {
        prov.distritos.push({
          codigo: dist.ubigeo,
          nombre: dist.nombre
        });
      }
      
      dept.provincias.push(prov);
    }
    
    ubigeos.departamentos.push(dept);
    
    // Progress cada 5
    if ((i+1) % 5 === 0) {
      console.log(`\n   [${i+1}/${deptos.length}] guardado parcial...`);
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ubigeos, null, 2));
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ubigeos, null, 2));
  console.log(`\n\nGuardado: ${OUTPUT_FILE}`);
  
  // Resumen
  const totalProv = ubigeos.departamentos.reduce((sum, d) => sum + d.provincias.length, 0);
  const totalDist = ubigeos.departamentos.reduce((sum, d) => 
    sum + d.provincias.reduce((s, p) => s + p.distritos.length, 0), 0);
  
  console.log(`\nResumen:`);
  console.log(`  Departamentos: ${ubigeos.departamentos.length}`);
  console.log(`  Provincias: ${totalProv}`);
  console.log(`  Distritos: ${totalDist}`);
  console.log(`  Tiempo: ${(Date.now()-t0)/1000}s`);
}

scrape();