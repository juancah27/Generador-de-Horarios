# Generador de Horarios FIIS (Node.js + TypeScript)

Aplicacion web para organizar horarios de cursos FIIS con:

- Reglas de cruce configurables (T/T, T/P y P/P bloqueado).
- Parametros estrictos de horario (hora minima, hora maxima, dias libres).
- Optimizador con backtracking: busca la combinacion de secciones que coloca la
  mayor cantidad de cursos, no la primera que encuentra.
- Priorizacion por docente, dias libres, compactacion o horario tarde.
- Carga de cursos y notas docentes desde archivos Excel.
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
- `src/grid-layout.ts`: carriles y rango horario de la grilla semanal.
- `src/params.ts`: normalizacion y lectura/escritura de parametros.
- `public/data/`: datasets JSON y archivos Excel usados por la app.

## Tests

- `npm test` (Vitest). 63 tests sobre el optimizador, el motor de cruces, el
  layout de la grilla, el parser de Excel, la normalizacion de parametros y los
  utilitarios.

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

- `public/data/CARGA HORARIA 2026-1 Oficial.xlsx`
- `public/data/Tabla de Encuesta Docente en Excel.xlsx`

Si no encuentra algun Excel, usa los JSON por defecto en `public/data/` sin
avisar: es un caso previsto. Si el archivo existe pero no se puede leer (esta
corrupto, o le faltan las columnas `CODIGO` / `NOMBRE DEL CURSO` / `SECCION`),
muestra el motivo en pantalla y cae a los JSON.

La libreria `xlsx` se carga bajo demanda: la app pinta la grilla con los JSON
antes de bajar los ~430 kB del parser.

## Parametros

Los parametros del optimizador se validan y se guardan en `localStorage` (`fiis_params`) para mantener tu configuracion entre sesiones.

Tambien se guardan en `localStorage`:

- `fiis_selected`: los cursos y secciones de tu horario.
- `fiis_panel_state`: que paneles laterales dejaste abiertos.

El generador automatico solo corre solo la primera vez. Despues respeta lo que
tengas guardado, y al pulsar **Mejor horario automatico** trabaja sobre los
cursos que vos elegiste en vez de reemplazarlos por la lista recomendada.

