# Generador de Horarios FIIS (Node.js + TypeScript)

Aplicacion web para organizar horarios de cursos FIIS con:

- Reglas de cruce configurables (T/T, T/P y P/P bloqueado).
- Parametros estrictos de horario (hora minima, hora maxima, dias libres).
- Optimizador con backtracking: busca la combinacion de secciones que coloca la
  mayor cantidad de cursos, no la primera que encuentra.
- Alternativas: varios horarios con el mismo maximo de cursos y distinto reparto
  de docentes, comparables lado a lado, con cursos fijables.
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
- `src/styles.css`: tokens y estilos. Los colores son tokens, no hex sueltos.
- `src/conflicts.ts`: motor de cruces y violaciones.
- `src/optimizer.ts`: busqueda con backtracking, ranking de secciones y
  generacion de alternativas.
- `src/curriculum.ts`: malla curricular (ciclos, tipos, creditos, prerequisitos).
- `src/grid-layout.ts`: carriles y rango horario de la grilla semanal.
- `src/params.ts`: normalizacion y lectura/escritura de parametros.
- `scripts/build-defaults.ts`: regenera los JSON de respaldo desde los Excel.
- `public/data/`: datasets JSON y archivos Excel usados por la app.

## Interfaz

Dos temas, oscuro por defecto, con un conmutador en la cabecera. La eleccion se
guarda en `localStorage` (`fiis_theme`); si no hay ninguna, se sigue lo que
pida el sistema. Un script en el `<head>` fija el tema antes del primer
pintado para que no haya destello.

Los colores viven en `:root` (oscuro) y `:root[data-theme="light"]` (claro) de
`src/styles.css`. Tres reglas que conviene no romper:

- El tema claro solo redefine color. Tamaños, radios y espaciados son unicos:
  los dos temas son el mismo diseño con distinta piel.
- Los tokens `--accent`, `--danger` y `--accent3` son para bordes y fondos
  translucidos. Para un relleno solido con texto blanco encima van
  `--accent-fill`, `--accent2-fill` y `--danger-fill`: los de marca se quedan
  en 3.7:1 y no llegan al minimo AA de 4.5:1.
- El texto secundario usa `--muted`; los estados usan `--ok-text`,
  `--warn-text` y `--danger-text`.

Los 14 colores de curso se declaran una sola vez, como `--c` en cada clase
`.color-N`. El bloque de la grilla deriva fondo, borde y texto con `color-mix`
contra `--surface` y `--text`, asi que el mismo curso conserva su color en los
dos temas sin listar la paleta dos veces. Los porcentajes de mezcla
(`--c-bg`, `--c-border`, `--c-text`) cambian con el tema porque la direccion de
la mezcla se invierte.

`src/tokens.test.ts` recalcula todos los ratios leyendo el CSS, en ambos temas,
asi que bajar el brillo de un token rompe el test antes que la legibilidad.

Los tamaños de fuente son siete tokens (`--fs-2xs` a `--fs-2xl`). El test
tambien falla si aparece un `font-size` fuera de la escala.

`color-mix` necesita Chrome 111, Safari 16.2 o Firefox 113 en adelante.

La app es utilizable con teclado: los cursos, las secciones y los bloques de la
grilla son `<button>`, hay anillo de foco en todo control, los modales atrapan
el foco y se cierran con Escape. En pantallas de menos de 900px los paneles
laterales pasan a ser cajones y la columna de horas de la grilla queda fija.

## Tests

- `npm test` (Vitest). 241 tests sobre el optimizador, el motor de cruces, la
  malla curricular, los filtros del catalogo, el layout de la grilla, el parser
  de Excel, la normalizacion de parametros, los utilitarios y el contraste de
  la paleta en los dos temas.

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

## Primer uso

La primera vez que se abre la app en un navegador aparece un asistente de tres
pasos: carrera, ciclo y un resumen de lo que se puede hacer (buscar cursos de
cualquier ciclo, ajustar **Parametros**, comparar **Alternativas**). El boton de
ayuda de la cabecera lo reabre cuando se quiera.

La carrera es informativa: no existe como dato en la carga horaria ni en la
malla, y la unica malla cargada es la de Ingenieria Industrial.

El ciclo si hace algo: filtra el catalogo, igual que el selector del panel
lateral, y se guarda para las proximas visitas. Solo se ofrecen ciclos **con
cursos ofertados** (`offeredCycles` en `src/curriculum.ts`): los ciclos salen de
la malla y los cursos de la carga horaria, asi que elegir un ciclo sin oferta
dejaria el catalogo vacio.

En el primer arranque el horario se arma en silencio, sin el modal de reporte
del optimizador: dos modales abiertos a la vez se pelean la trampa de foco.

## Alternativas de horario

El boton **Alternativas** corre la misma busqueda que **Mejor horario
automatico**, pero en vez de quedarse con la mejor combinacion retiene una por
cada reparto distinto de docentes. La galeria muestra hasta seis, con el
promedio de notas, los cursos, las horas, los dias usados y una vista previa de
la semana. **Usar este horario** aplica la elegida.

Todas las alternativas colocan la misma cantidad de cursos: una con menos cursos
no es una alternativa, es un horario peor. Si con los cursos y parametros
actuales solo hay un reparto posible, el modal lo dice en vez de mostrar una
sola tarjeta sin explicacion.

Como las mejores por puntaje suelen diferir en un solo docente, se prefiere
completar la galeria con las que cambian al menos dos antes de caer en las que
cambian una: seis tarjetas casi iguales no ayudan a decidir.

El boton de chincheta de cada curso en **Mi horario** lo fija: su seccion se
mantiene en todas las alternativas y el resto varia alrededor. Se guarda el
curso, no la seccion, asi que cambiar de seccion a mano no deja un ancla vieja
apuntando a la anterior.

## Parametros

Los parametros del optimizador se validan y se guardan en `localStorage` (`fiis_params`) para mantener tu configuracion entre sesiones.

Tambien se guardan en `localStorage`:

- `fiis_selected`: los cursos y secciones de tu horario.
- `fiis_pinned`: los cursos fijados para el generador de alternativas.
- `fiis_intro`: version del tutorial ya visto y el ciclo elegido. Subir
  `INTRO_VERSION` en `src/main.ts` lo vuelve a mostrar una vez a todos.
- `fiis_panel_state`: que paneles laterales dejaste abiertos.
- `fiis_theme`: si elegiste tema claro u oscuro.

El generador automatico solo corre solo la primera vez. Despues respeta lo que
tengas guardado, y al pulsar **Mejor horario automatico** trabaja sobre los
cursos que vos elegiste en vez de reemplazarlos por la lista recomendada.

