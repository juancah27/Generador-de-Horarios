# Generador de Horarios FIIS (Node.js + TypeScript)

Aplicacion web para organizar horarios de cursos FIIS con:

- Reglas de cruce configurables (T/T, T/P y P/P bloqueado).
- Parametros estrictos de horario (hora minima, hora maxima, dias libres).
- Optimizador con backtracking: busca la combinacion de secciones que coloca la
  mayor cantidad de cursos, no la primera que encuentra.
- Priorizacion por docente, dias libres, compactacion o horario tarde.
- Carga de cursos y notas docentes desde archivos Excel.
- Malla curricular: ciclo, tipo (obligatorio / electivo / complementario),
  creditos y prerequisitos de cada curso, con filtros por ciclo y por tipo.
- El horario armado se guarda en el navegador y se restaura al volver a entrar.

## Stack

- Node.js
- TypeScript
- Vite
- xlsx

## Estructura

- `index.html`: shell de la interfaz.
- `src/main.ts`: orquestacion UI + estado de aplicacion.
- `src/data-service.ts`: carga de JSON base y Excel.
- `src/conflicts.ts`: motor de cruces y violaciones.
- `src/optimizer.ts`: busqueda con backtracking y ranking de secciones.
- `src/curriculum.ts`: malla curricular (ciclos, tipos, creditos, prerequisitos).
- `src/grid-layout.ts`: carriles y rango horario de la grilla semanal.
- `src/params.ts`: normalizacion y lectura/escritura de parametros.
- `scripts/build-defaults.ts`: regenera los JSON de respaldo desde los Excel.
- `public/data/`: datasets JSON y archivos Excel usados por la app.

## Tests

- `npm test` (Vitest). 77 tests sobre el optimizador, el motor de cruces, la
  malla curricular, el layout de la grilla, el parser de Excel, la
  normalizacion de parametros y los utilitarios.

## Ejecutar en local

1. Instala dependencias:
   - `npm install`
2. Inicia en desarrollo:
   - `npm run dev`
3. Abre la URL que muestra Vite (normalmente `http://localhost:5173`).

## Build de produccion

- `npm run build`
- Salida: carpeta `dist/`

## Desplegar en Vercel

Este proyecto ya esta preparado para Vercel con build de Vite.

1. Sube el repo a GitHub/GitLab/Bitbucket.
2. Importa el repo en Vercel.
3. Vercel usara:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

## Datos Excel

La app intenta cargar automaticamente:

- `public/data/CARGA HORARIA PRELIMINAR 2026 - II.xlsx` — oferta del ciclo
- `public/data/Tabla de Encuesta Docente en Excel.xlsx` — notas de docentes
- `public/data/malla_curricular_uni.xlsx` — malla curricular

Las columnas se ubican por nombre, no por posicion: si el Excel de carga
horaria cambia de columnas (por ejemplo pierde `AULA`), la carga sigue
funcionando mientras existan `CODIGO`, `NOMBRE DEL CURSO`, `SECCION`,
`DOCENTE`, `TIPO`, `DIA`, `HORA INICIO` y `HORA FINAL`.

Si no encuentra algun Excel, usa los JSON por defecto en `public/data/` sin
avisar: es un caso previsto. Si el archivo existe pero no se puede leer (esta
corrupto, o le faltan columnas), muestra el motivo en pantalla y cae a los JSON.

La libreria `xlsx` se carga bajo demanda: la app pinta la grilla con los JSON
antes de bajar los ~430 kB del parser.

### Cambiar el Excel de carga horaria

1. Deja el archivo nuevo en `public/data/`.
2. Actualiza `EXCEL_COURSES_FILE` y `PERIOD_LABEL` en `src/constants.ts`.
3. Corre `npm run build:data` para regenerar los JSON de respaldo. Sin este
   paso el respaldo sigue siendo el del ciclo anterior.

## Malla curricular

`malla_curricular_uni.xlsx` tiene tres hojas:

- `Cursos`: `CodigoCurso`, `NombreCurso`, `Creditos`, `TipoCurso`
  (Obligatorio / Electivo / Complementario), `CicloPlan` (1-10, vacio en
  electivos y complementarios, que no pertenecen a un ciclo fijo).
- `Prerequisitos`: una fila por par curso/prerequisito. Un curso puede repetirse.
- `RequisitosGrado`: creditos minimos por tipo para egresar.

Con eso el catalogo muestra el ciclo, el tipo y los creditos de cada curso, se
puede filtrar por ciclo y por tipo, y el panel del horario suma los creditos
separados por tipo.

La carga horaria cubre mas de una carrera y la malla es solo la de Ingenieria
Industrial, asi que hay cursos ofertados sin datos de malla (los de Sistemas,
prefijos `SI` y `SW`). Esos cursos se pueden elegir igual: aparecen sin
insignias y se cuentan aparte en el panel de creditos.

## Parametros

Los parametros del optimizador se validan y se guardan en `localStorage` (`fiis_params`) para mantener tu configuracion entre sesiones.

Tambien se guardan en `localStorage`:

- `fiis_selected`: los cursos y secciones de tu horario.
- `fiis_panel_state`: que paneles laterales dejaste abiertos.

El generador automatico solo corre solo la primera vez. Despues respeta lo que
tengas guardado, y al pulsar **Mejor horario automatico** trabaja sobre los
cursos que vos elegiste en vez de reemplazarlos por la lista recomendada.

