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
    const child = spawnSync('curl', ['-s', '-A', USER_AGENT, url], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) return [];
    const text = child.stdout;
    if (!text || text.startsWith('<!doctype')) return [];
    const data = JSON.parse(text);
    return data.data || [];
  } catch (e) {
    return [];
  }
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
    if (r.provincias) {
      for (const p of r.provincias) {
        for (const c of p.candidatos) {
          if (!votos[c.codigoPartido]) {
            votos[c.codigoPartido] = { partido: c.partido, codigoPartido: c.codigoPartido, candidato: c.candidato, votos: 0 };
          }
          votos[c.codigoPartido].votos += c.votos;
        }
      }
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
    region: {
      codigo: dept.codigo,
      nombre: dept.nombre
    },
    candidatos: [],
    provincias: []
  };
  
  console.log(`   Obteniendo candidatos...`);
  const candidatos = obtenerResultados('ubigeo_nivel_01', { ubigeoNivel1: dept.codigo });
  region.candidatos = candidatos.map(transformar);
  
  console.log(`   ${dept.provincias.length} provincias...`);
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
  const idx = process.argv.indexOf('--region');
  const regionIdx = idx !== -1 ? parseInt(process.argv[idx + 1]) : -1;
  
  const ubigeos = JSON.parse(fs.readFileSync(UBIGEOS_FILE, 'utf8'));
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  if (regionIdx >= 0) {
    // Procesar una sola region
    if (regionIdx >= ubigeos.departamentos.length) {
      console.error(`Región ${regionIdx} no existe. Máximo: ${ubigeos.departamentos.length - 1}`);
      return;
    }
    const dept = ubigeos.departamentos[regionIdx];
    console.log(`\nProcesando región ${regionIdx}: ${dept.nombre}`);
    console.log(`Provincias: ${dept.provincias.length}`);
    console.log(`Distritos: ${dept.provincias.reduce((s,p) => s + p.distritos.length, 0)}`);
    
    const t0 = Date.now();
    const region = procesarRegion(dept);
    
    const filename = `region_${String(regionIdx).padStart(2, '0')}_${dept.codigo}_${dept.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(region, null, 2));
    
    console.log(`\nGuardado: ${filename}`);
    console.log(`Tiempo: ${(Date.now()-t0)/1000}s`);
    return;
  }
  
  // Procesar todas las regiones
  console.log(`\n=== ONPE: Obteniendo datos por región ===`);
  console.log(`Total regiones: ${ubigeos.departamentos.length}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);
  
  for (let i = 0; i < ubigeos.departamentos.length; i++) {
    const dept = ubigeos.departamentos[i];
    const filename = `region_${String(i).padStart(2, '0')}_${dept.codigo}_${dept.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    // Skip si ya existe
    if (fs.existsSync(filepath)) {
      console.log(`[${i+1}/${ubigeos.departamentos.length}] ${dept.nombre} - YA EXISTE, SALTEANDO`);
      continue;
    }
    
    console.log(`\n[${i+1}/${ubigeos.departamentos.length}] ${dept.nombre}...`);
    const t0 = Date.now();
    
    try {
      const region = procesarRegion(dept);
      fs.writeFileSync(filepath, JSON.stringify(region, null, 2));
      console.log(`   OK - ${region.provincias.length} provincias, ${region.provincias.reduce((s,p) => s + p.distritos.length, 0)} distritos (${(Date.now()-t0)/1000}s)`);
    } catch(e) {
      console.log(`   ERROR: ${e.message}`);
    }
  }
  
  console.log(`\n=== COMPLETADO ===`);
  console.log(`Archivos en: ${OUTPUT_DIR}`);
}

main();