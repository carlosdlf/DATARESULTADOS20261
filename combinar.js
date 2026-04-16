const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'resultados');

function combinar() {
  console.log('Combinando archivos...\n');
  
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith('region_') && f.endsWith('.json'))
    .sort();
  
  console.log(`Archivos: ${files.length}`);
  
  const candidatosDict = {};
  
  const combinado = {
    timestamp: new Date().toISOString(),
    eleccion: 'presidenciales 2026',
    fuente: 'ONPE',
    totalRegiones: files.length,
    regiones: []
  };
  
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf8'));
    
    for (const c of data.candidatos) {
      if (!candidatosDict[c.codigoPartido]) {
        candidatosDict[c.codigoPartido] = {
          partido: c.partido,
          candidato: c.candidato
        };
      }
    }
    
    combinado.regiones.push({
      codigo: data.region.codigo,
      nombre: data.region.nombre,
      candidatos: data.candidatos.map(c => ({ codigo: c.codigoPartido, votos: c.votos, porcentaje: c.porcentajeVotos })),
      provincias: data.provincias.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        candidatos: p.candidatos.map(c => ({ codigo: c.codigoPartido, votos: c.votos, porcentaje: c.porcentajeVotos })),
        distritos: p.distritos.map(d => ({
          codigo: d.codigo,
          nombre: d.nombre,
          candidatos: d.candidatos.map(c => ({ codigo: c.codigoPartido, votos: c.votos, porcentaje: c.porcentajeVotos }))
        }))
      }))
    });
    console.log(`   ${data.region.nombre}: ${data.provincias.length} provincias`);
  }
  
  fs.writeFileSync('candidatos.json', JSON.stringify(candidatosDict, null, 2));
  fs.writeFileSync('resultados_completo.json', JSON.stringify(combinado));
  
  console.log(`\nGuardado:`);
  console.log(`   candidatos.json: ${(fs.statSync('candidatos.json').size / 1024).toFixed(2)} KB`);
  console.log(`   resultados_completo.json: ${(fs.statSync('resultados_completo.json').size / 1024 / 1024).toFixed(2)} MB`);
}

combinar();