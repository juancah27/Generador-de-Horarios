# Generador de Horarios FIIS (Node.js + TypeScript)

Aplicacion web para organizar horarios de cursos FIIS con:

- Reglas de cruce configurables (T/T, T/P y P/P bloqueado).
- Parametros estrictos de horario (hora minima, hora maxima, dias libres).
- Optimizador automatico con priorizacion por docente, dias libres, compactacion o horario tarde.
- Carga de cursos y notas docentes desde archivos Excel.

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
- `src/optimizer.ts`: seleccion automatica y ranking.
- `src/params.ts`: normalizacion y lectura/escritura de parametros.
- `public/data/`: datasets JSON y archivos Excel usados por la app.

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

- `public/data/CARGA HORARIA 2026-1 PRELIMINAR.xlsx`
- `public/data/Tabla de Encuesta Docente en Excel.xlsx`

Si no encuentra algun Excel, usa los JSON por defecto en `public/data/`.

## Parametros

Los parametros del optimizador se validan y se guardan en `localStorage` (`fiis_params`) para mantener tu configuracion entre sesiones.
