const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://resultadoelectoral.onpe.gob.pe';
const ID_ELECCION = 10;

function buildUrl(endpoint, params) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('idEleccion', ID_ELECCION);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

const BASE_PARAMS_TOTALES = { idAmbitoGeografico: 1 };
const BASE_PARAMS_PARTICIPANTES = { idAmbitoGeografico: 1, listRegiones: 'TODOS,PERÚ,EXTRANJERO' };

const ubigeos = JSON.parse(fs.readFileSync('ubigeos.json', 'utf8'));
const ubigeosExt = JSON.parse(fs.readFileSync('ubigeos_extranjero.json', 'utf8'));

const urlsTotales = [];
const urlsParticipantes = [];

console.log('Generando URLs...\n');

console.log('=== TOTALIZADORES ===\n');

console.log('1. Totales generales...');
urlsTotales.push({
  tipo: 'general',
  nombre: 'PERÚ',
  codigo: null,
  url: buildUrl('/presentacion-backend/resumen-general/totales', {
    tipoFiltro: 'eleccion',
    ...BASE_PARAMS_TOTALES
  })
});
console.log('   General: OK');

console.log('2. Departamentos...');
for (const dept of ubigeos.departamentos) {
  urlsTotales.push({
    tipo: 'departamento',
    nombre: dept.nombre,
    codigo: dept.codigo,
    url: buildUrl('/presentacion-backend/resumen-general/totales', {
      tipoFiltro: 'ubigeo_nivel_01',
      idAmbitoGeografico: 1,
      idUbigeoDepartamento: dept.codigo
    })
  });
}
console.log(`   ${ubigeos.departamentos.length} departamentos`);

console.log('3. Provincias...');
for (const dept of ubigeos.departamentos) {
  for (const prov of dept.provincias) {
    urlsTotales.push({
      tipo: 'provincia',
      nombre: `${dept.nombre} > ${prov.nombre}`,
      codigo: prov.codigo,
      codigoDepto: dept.codigo,
      url: buildUrl('/presentacion-backend/resumen-general/totales', {
        tipoFiltro: 'ubigeo_nivel_02',
        idAmbitoGeografico: 1,
        idUbigeoDepartamento: dept.codigo,
        idUbigeoProvincia: prov.codigo
      })
    });
  }
}
const totalProv = ubigeos.departamentos.reduce((s, d) => s + d.provincias.length, 0);
console.log(`   ${totalProv} provincias`);

console.log('4. Distritos...');
for (const dept of ubigeos.departamentos) {
  for (const prov of dept.provincias) {
    for (const dist of prov.distritos) {
      urlsTotales.push({
        tipo: 'distrito',
        nombre: `${dept.nombre} > ${prov.nombre} > ${dist.nombre}`,
        codigo: dist.codigo,
        codigoDepto: dept.codigo,
        codigoProv: prov.codigo,
        url: buildUrl('/presentacion-backend/resumen-general/totales', {
          tipoFiltro: 'ubigeo_nivel_03',
          idAmbitoGeografico: 1,
          idUbigeoDepartamento: dept.codigo,
          idUbigeoProvincia: prov.codigo,
          idUbigeoDistrito: dist.codigo
        })
      });
    }
  }
}
const totalDist = ubigeos.departamentos.reduce((s, d) => s + d.provincias.reduce((sp, p) => sp + p.distritos.length, 0), 0);
console.log(`   ${totalDist} distritos`);

console.log('\n5. Extranjero - Continentes...');
urlsTotales.push({
  tipo: 'extranjero_general',
  nombre: 'EXTRANJERO',
  codigo: null,
  url: buildUrl('/presentacion-backend/resumen-general/totales', {
    tipoFiltro: 'ambito_geografico',
    idAmbitoGeografico: 2
  })
});
for (const cont of ubigeosExt.continentes) {
  urlsTotales.push({
    tipo: 'continente',
    nombre: cont.nombre,
    codigo: cont.codigo,
    url: buildUrl('/presentacion-backend/resumen-general/totales', {
      tipoFiltro: 'ubigeo_nivel_01',
      idAmbitoGeografico: 2,
      idUbigeoDepartamento: cont.codigo
    })
  });
}
console.log(`   ${ubigeosExt.continentes.length} continentes`);

console.log('6. Extranjero - Paises...');
for (const cont of ubigeosExt.continentes) {
  for (const pais of cont.paises) {
    urlsTotales.push({
      tipo: 'pais',
      nombre: `${cont.nombre} > ${pais.nombre}`,
      codigo: pais.codigo,
      codigoCont: cont.codigo,
      url: buildUrl('/presentacion-backend/resumen-general/totales', {
        tipoFiltro: 'ubigeo_nivel_02',
        idAmbitoGeografico: 2,
        idUbigeoDepartamento: cont.codigo,
        idUbigeoProvincia: pais.codigo
      })
    });
  }
}
const totalPaises = ubigeosExt.continentes.reduce((s, c) => s + c.paises.length, 0);
console.log(`   ${totalPaises} paises`);

console.log('7. Extranjero - Ciudades...');
for (const cont of ubigeosExt.continentes) {
  for (const pais of cont.paises) {
    for (const ciudad of pais.ciudades) {
      urlsTotales.push({
        tipo: 'ciudad',
        nombre: `${cont.nombre} > ${pais.nombre} > ${ciudad.nombre}`,
        codigo: ciudad.codigo,
        codigoCont: cont.codigo,
        codigoPais: pais.codigo,
        url: buildUrl('/presentacion-backend/resumen-general/totales', {
          tipoFiltro: 'ubigeo_nivel_03',
          idAmbitoGeografico: 2,
          idUbigeoDepartamento: cont.codigo,
          idUbigeoProvincia: pais.codigo,
          idUbigeoDistrito: ciudad.codigo
        })
      });
    }
  }
}
const totalCiudades = ubigeosExt.continentes.reduce((s, c) => s + c.paises.reduce((sp, p) => sp + p.ciudades.length, 0), 0);
console.log(`   ${totalCiudades} ciudades`);

console.log('\n=== PARTICIPANTES ===\n');

console.log('1. Participantes generales...');
urlsParticipantes.push({
  tipo: 'general',
  nombre: 'PERÚ',
  codigo: null,
  url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
    tipoFiltro: 'eleccion',
    ...BASE_PARAMS_PARTICIPANTES
  })
});
console.log('   General: OK');

console.log('2. Departamentos...');
for (const dept of ubigeos.departamentos) {
  urlsParticipantes.push({
    tipo: 'departamento',
    nombre: dept.nombre,
    codigo: dept.codigo,
    url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
      tipoFiltro: 'ubigeo_nivel_01',
      idAmbitoGeografico: 1,
      ubigeoNivel1: dept.codigo,
      listRegiones: 'TODOS,PERÚ,EXTRANJERO'
    })
  });
}
console.log(`   ${ubigeos.departamentos.length} departamentos`);

console.log('3. Provincias...');
for (const dept of ubigeos.departamentos) {
  for (const prov of dept.provincias) {
    urlsParticipantes.push({
      tipo: 'provincia',
      nombre: `${dept.nombre} > ${prov.nombre}`,
      codigo: prov.codigo,
      codigoDepto: dept.codigo,
      url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
        tipoFiltro: 'ubigeo_nivel_02',
        idAmbitoGeografico: 1,
        ubigeoNivel1: dept.codigo,
        ubigeoNivel2: prov.codigo,
        listRegiones: 'TODOS,PERÚ,EXTRANJERO'
      })
    });
  }
}
console.log(`   ${totalProv} provincias`);

console.log('4. Distritos...');
for (const dept of ubigeos.departamentos) {
  for (const prov of dept.provincias) {
    for (const dist of prov.distritos) {
      urlsParticipantes.push({
        tipo: 'distrito',
        nombre: `${dept.nombre} > ${prov.nombre} > ${dist.nombre}`,
        codigo: dist.codigo,
        codigoDepto: dept.codigo,
        codigoProv: prov.codigo,
        url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
          tipoFiltro: 'ubigeo_nivel_03',
          idAmbitoGeografico: 1,
          ubigeoNivel1: dept.codigo,
          ubigeoNivel2: prov.codigo,
          ubigeoNivel3: dist.codigo,
          listRegiones: 'TODOS,PERÚ,EXTRANJERO'
        })
      });
    }
  }
}
console.log(`   ${totalDist} distritos`);

console.log('\n5. Extranjero - Continentes...');
urlsParticipantes.push({
  tipo: 'extranjero_general',
  nombre: 'EXTRANJERO',
  codigo: null,
  url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
    tipoFiltro: 'ambito_geografico',
    idAmbitoGeografico: 2,
    listRegiones: 'TODOS,PERÚ,EXTRANJERO'
  })
});
for (const cont of ubigeosExt.continentes) {
  urlsParticipantes.push({
    tipo: 'continente',
    nombre: cont.nombre,
    codigo: cont.codigo,
    url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
      tipoFiltro: 'ubigeo_nivel_01',
      idAmbitoGeografico: 2,
      ubigeoNivel1: cont.codigo,
      listRegiones: 'TODOS,PERÚ,EXTRANJERO'
    })
  });
}
console.log(`   ${ubigeosExt.continentes.length} continentes`);

console.log('6. Extranjero - Paises...');
for (const cont of ubigeosExt.continentes) {
  for (const pais of cont.paises) {
    urlsParticipantes.push({
      tipo: 'pais',
      nombre: `${cont.nombre} > ${pais.nombre}`,
      codigo: pais.codigo,
      codigoCont: cont.codigo,
      url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
        tipoFiltro: 'ubigeo_nivel_02',
        idAmbitoGeografico: 2,
        ubigeoNivel1: cont.codigo,
        ubigeoNivel2: pais.codigo,
        listRegiones: 'TODOS,PERÚ,EXTRANJERO'
      })
    });
  }
}
console.log(`   ${totalPaises} paises`);

console.log('7. Extranjero - Ciudades...');
for (const cont of ubigeosExt.continentes) {
  for (const pais of cont.paises) {
    for (const ciudad of pais.ciudades) {
      urlsParticipantes.push({
        tipo: 'ciudad',
        nombre: `${cont.nombre} > ${pais.nombre} > ${ciudad.nombre}`,
        codigo: ciudad.codigo,
        codigoCont: cont.codigo,
        codigoPais: pais.codigo,
        url: buildUrl('/presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre', {
          tipoFiltro: 'ubigeo_nivel_03',
          idAmbitoGeografico: 2,
          ubigeoNivel1: cont.codigo,
          ubigeoNivel2: pais.codigo,
          ubigeoNivel3: ciudad.codigo,
          listRegiones: 'TODOS,PERÚ,EXTRANJERO'
        })
      });
    }
  }
}
console.log(`   ${totalCiudades} ciudades`);

console.log('\n=== RESUMEN ===');
console.log(`URLs Totalizadores: ${urlsTotales.length}`);
console.log(`URLs Participantes: ${urlsParticipantes.length}`);
console.log(`Total: ${urlsTotales.length + urlsParticipantes.length}`);

fs.writeFileSync('urls_totales.json', JSON.stringify(urlsTotales, null, 2));
fs.writeFileSync('urls_participantes.json', JSON.stringify(urlsParticipantes, null, 2));

console.log('\nArchivos generados:');
console.log(`  urls_totales.json: ${(fs.statSync('urls_totales.json').size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  urls_participantes.json: ${(fs.statSync('urls_participantes.json').size / 1024 / 1024).toFixed(2)} MB`);
