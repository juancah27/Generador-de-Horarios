import "./styles.css";
import {
  COLORS,
  DAY_NAME,
  DAYS,
  DEFAULT_PARAMS,
  DOT_COLORS,
  PERIOD_LABEL,
  RECOMMENDED,
} from "./constants";
import { causesViolation, clashReport, getViolators, hardViolationsForSection } from "./conflicts";
import { filterCourses, type FilterMode } from "./course-filter";
import { creditsByKind, kindLabel } from "./curriculum";
import { layoutBlocks, visibleHours } from "./grid-layout";
import {
  loadCoursesFromExcel,
  loadCurriculumFromExcel,
  loadDefaultData,
  loadTeacherScoresFromExcel,
} from "./data-service";
import { runOptimizer, lookupTeacherScore } from "./optimizer";
import { fillModalFromParams, normalizeParams, readParamsFromModal } from "./params";
import { escapeHtml, normalizeCourseName } from "./utils";
import type {
  CoursesData,
  Curriculum,
  CurriculumCourse,
  DayCode,
  OptimizerReport,
  ScheduleParams,
  SectionData,
  TeacherScores,
} from "./types";


/** Marca un icono del sprite de index.html. */
function icon(name: string, extraClass = ""): string {
  return `<svg class="ic ${extraClass}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

let coursesData: CoursesData = {};
let teacherScores: TeacherScores = {};
/** Malla curricular. Null si el Excel no esta: la app funciona igual, sin ciclos ni creditos. */
let curriculum: Curriculum | null = null;
/** Filtros de la malla: "" = sin filtrar. */
let cycleFilter = "";
let kindFilter = "";
let selected: Record<string, SectionData> = {};
let colorMap: Record<string, string> = {};
let colorIdx = 0;
let filter: FilterMode = "all";
let searchQ = "";
/**
 * Cursos que el usuario quiere en su horario, incluidos los que el optimizador
 * no pudo colocar. Sin esto, un curso descartado por un cambio de parametros
 * desaparecia para siempre de los intentos siguientes.
 */
let desiredTargets: string[] = [];
let courseNameLookup: Record<string, string> = {};
let panelState: { sidebar: boolean; summary: boolean } = { sidebar: true, summary: true };
let params: ScheduleParams = loadParamsState();
let notifTimer = 0;

const SELECTED_KEY = "fiis_selected";

/** Alto de fila de la grilla. Vive en `--row-h` (styles.css) para no duplicar el valor. */
function rowHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--row-h");
  return parseFloat(raw) || 44;
}

/** Guarda solo curso -> seccion; las clases se rehidratan desde `coursesData`. */
function saveSelectedState(): void {
  try {
    const map: Record<string, string> = {};
    for (const [course, sec] of Object.entries(selected)) {
      if (sec.secId) map[course] = sec.secId;
    }
    localStorage.setItem(SELECTED_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Rehidrata el horario guardado.
 * Devuelve true si existia estado guardado — incluso vacio — para no
 * regenerar automaticamente encima de un horario que el usuario limpio.
 */
function restoreSelectedState(): boolean {
  let map: Record<string, string>;
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    if (!raw) return false;
    map = JSON.parse(raw) as Record<string, string>;
  } catch {
    return false;
  }

  selected = {};
  colorMap = {};
  colorIdx = 0;

  for (const [savedName, secId] of Object.entries(map)) {
    const course = resolveCourseName(savedName);
    const sec = coursesData[course]?.[secId];
    if (!sec) continue;
    selected[course] = { ...sec, secId };
    colorMap[course] = COLORS[colorIdx % COLORS.length];
    colorIdx++;
  }

  desiredTargets = Object.keys(selected);
  return true;
}

function loadParamsState(): ScheduleParams {
  try {
    const raw = localStorage.getItem("fiis_params");
    if (!raw) return { ...DEFAULT_PARAMS };
    const parsed = JSON.parse(raw) as Partial<ScheduleParams>;
    return normalizeParams(parsed);
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

function saveParamsState(): void {
  try {
    localStorage.setItem("fiis_params", JSON.stringify(params));
  } catch {
    // Ignore storage errors
  }
}

function refreshCourseLookup(): void {
  courseNameLookup = {};
  for (const name of Object.keys(coursesData)) {
    courseNameLookup[normalizeCourseName(name)] = name;
  }
}

function resolveCourseName(name: string): string {
  return courseNameLookup[normalizeCourseName(name)] ?? name;
}

/** Codigo del curso segun la carga horaria (todas sus secciones comparten codigo). */
function courseCode(courseName: string): string {
  const sections = coursesData[courseName];
  if (!sections) return "";
  return Object.values(sections)[0]?.codigo?.trim().toUpperCase() ?? "";
}

/**
 * Datos de malla de un curso.
 * Null cuando el curso no esta en la malla: la carga horaria cubre varias
 * carreras y la malla es solo la de Ingenieria Industrial.
 */
function courseCurriculum(courseName: string): CurriculumCourse | null {
  if (!curriculum) return null;
  return curriculum.byCode[courseCode(courseName)] ?? null;
}

function updateTotalCoursesCount(): void {
  const el = document.getElementById("total-courses-count");
  if (el) el.textContent = `${Object.keys(coursesData).length} cursos`;
}

function loadPanelState(): void {
  try {
    const raw = localStorage.getItem("fiis_panel_state");
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<typeof panelState>;
    panelState.sidebar = parsed.sidebar !== false;
    panelState.summary = parsed.summary !== false;
  } catch {
    // Ignore storage errors
  }
}

function savePanelState(): void {
  try {
    localStorage.setItem("fiis_panel_state", JSON.stringify(panelState));
  } catch {
    // Ignore storage errors
  }
}

function applyPanelState(): void {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.toggle("hide-sidebar", !panelState.sidebar);
  app.classList.toggle("hide-summary", !panelState.summary);

  const sidebarBtn = document.getElementById("toggle-sidebar-btn");
  const summaryBtn = document.getElementById("toggle-summary-btn");
  const reopenSidebarBtn = document.getElementById("reopen-sidebar-btn");
  const reopenSummaryBtn = document.getElementById("reopen-summary-btn");
  sidebarBtn?.setAttribute("aria-expanded", String(panelState.sidebar));
  summaryBtn?.setAttribute("aria-expanded", String(panelState.summary));
  reopenSidebarBtn?.toggleAttribute("hidden", panelState.sidebar);
  reopenSummaryBtn?.toggleAttribute("hidden", panelState.summary);
}

function togglePanel(which: "sidebar" | "summary"): void {
  panelState[which] = !panelState[which];
  applyPanelState();
  savePanelState();

  // En pantallas angostas los paneles tapan el horario: al abrir uno, cierra el otro.
  if (panelState[which] && window.matchMedia("(max-width: 900px)").matches) {
    const other = which === "sidebar" ? "summary" : "sidebar";
    if (panelState[other]) {
      panelState[other] = false;
      applyPanelState();
      savePanelState();
    }
  }

  // Devolver el foco al control que queda visible evita perderlo en el body.
  const target = panelState[which]
    ? document.getElementById(which === "sidebar" ? "toggle-sidebar-btn" : "toggle-summary-btn")
    : document.getElementById(which === "sidebar" ? "reopen-sidebar-btn" : "reopen-summary-btn");
  target?.focus();
}

function showNotif(message: string, type: "success" | "error" | "warning" = "success"): void {
  const node = document.getElementById("notification");
  if (!node) return;
  node.textContent = message;
  node.className = `notification ${type} show`;
  if (notifTimer) window.clearTimeout(notifTimer);
  notifTimer = window.setTimeout(() => node.classList.remove("show"), 3200);
}

function getTeacherScore(docente: string): number | null {
  return lookupTeacherScore(docente, teacherScores);
}

function scoreClass(score: number | null): string {
  if (score === null) return "";
  if (score >= 17) return "score-high";
  if (score >= 15) return "score-mid";
  return "score-low";
}

/** Color de un numero de nota, en clases con tokens en vez de hex sueltos. */
function scoreValueClass(score: number | null): string {
  if (score === null) return "";
  if (score >= 17) return "val-ok";
  if (score >= 15) return "val-warn";
  return "val-danger";
}

function avgScore(): number | null {
  const values = Object.values(selected)
    .map((s) => getTeacherScore(s.docente))
    .filter((n): n is number => Number.isFinite(n));
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function totalHours(): number {
  return Object.values(selected)
    .flatMap((s) => s.clases)
    .reduce((acc, c) => acc + (c.fin - c.inicio), 0);
}

function calcMetrics():
  | {
      daysUsed: number;
      freeDays: DayCode[];
      minH: number;
      maxH: number;
      ttOv: number;
      tpOv: number;
    }
  | null {
  if (!Object.keys(selected).length) return null;

  const usedDays = new Set<DayCode>();
  let minH = 99;
  let maxH = 0;
  let ttOv = 0;
  let tpOv = 0;

  for (const sec of Object.values(selected)) {
    for (const cls of sec.clases) {
      const day = String(cls.dia).trim() as DayCode;
      usedDays.add(day);
      if (cls.inicio < minH) minH = cls.inicio;
      if (cls.fin > maxH) maxH = cls.fin;
    }
  }

  const list = Object.values(selected);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (const clash of clashReport(list[i].clases, list[j].clases, params)) {
        if (clash.ov <= 0) continue;
        if (clash.kind === "TT") ttOv += clash.ov;
        if (clash.kind === "TP") tpOv += clash.ov;
      }
    }
  }

  return {
    daysUsed: usedDays.size,
    freeDays: DAYS.filter((d) => !usedDays.has(d)),
    minH,
    maxH,
    ttOv,
    tpOv,
  };
}

function updateMetricsBar(): void {
  const scoreBar = document.getElementById("opt-score-bar");
  const detailBar = document.getElementById("conflict-detail-bar");
  if (!scoreBar || !detailBar) return;

  const metrics = calcMetrics();
  if (!metrics) {
    scoreBar.toggleAttribute("hidden", true);
    detailBar.toggleAttribute("hidden", true);
    return;
  }

  scoreBar.toggleAttribute("hidden", false);
  const mDays = document.getElementById("m-days");
  const mFree = document.getElementById("m-free");
  const mStart = document.getElementById("m-start");
  const mEnd = document.getElementById("m-end");
  const mTt = document.getElementById("m-tt");
  const mTp = document.getElementById("m-tp");
  if (mDays) mDays.textContent = String(metrics.daysUsed);
  if (mFree) mFree.textContent = metrics.freeDays.length ? metrics.freeDays.map((d) => DAY_NAME[d].slice(0, 3)).join(", ") : "—";
  if (mStart) mStart.textContent = `${metrics.minH}:00`;
  if (mEnd) mEnd.textContent = `${metrics.maxH}:00`;
  // El color sale de clases con tokens, no de hex sueltos en el JS.
  const overlapClass = (ov: number, limit: number) =>
    ov > limit ? "val val-danger" : ov > 0 ? "val val-warn" : "val val-ok";
  if (mTt) {
    mTt.textContent = `${metrics.ttOv}h`;
    mTt.className = overlapClass(metrics.ttOv, params.ruleTT);
  }
  if (mTp) {
    mTp.textContent = `${metrics.tpOv}h`;
    mTp.className = overlapClass(metrics.tpOv, params.ruleTP);
  }

  const msgs: string[] = [];
  const list = Object.entries(selected);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (const clash of clashReport(list[i][1].clases, list[j][1].clases, params)) {
        if (!clash.violated) continue;
        const day = DAY_NAME[String(clash.c1.dia).trim() as DayCode] ?? String(clash.c1.dia).trim();
        msgs.push(
          `${list[i][0].slice(0, 18)}… ↔ ${list[j][0].slice(0, 18)}… [${clash.kind} ${clash.ov}h>${clash.maxOk}h · ${day}]`,
        );
      }
    }
  }

  detailBar.toggleAttribute("hidden", msgs.length === 0);
  if (msgs.length) {
    detailBar.innerHTML = icon("alert") + " " + msgs.map(escapeHtml).join(" &nbsp;·&nbsp; ");
  }
}

function showTooltip(event: MouseEvent, block: { course: string; sec: SectionData; cls: { inicio: number; fin: number; tipo: string } }): void {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  const teacherScore = getTeacherScore(block.sec.docente);
  const issues = hardViolationsForSection(block.sec, params);
  tooltip.innerHTML =
    `<div class="tooltip-title">${escapeHtml(block.course)}</div>` +
    `<div class="tooltip-row">Docente <span>${escapeHtml(block.sec.docente)}</span></div>` +
    (teacherScore !== null
      ? `<div class="tooltip-row">Nota <span class="val-ok">${teacherScore.toFixed(2)} / 20</span></div>`
      : "") +
    `<div class="tooltip-row">Sección <span>${escapeHtml(block.sec.secId ?? "-")}</span></div>` +
    `<div class="tooltip-row">Horario <span>${block.cls.inicio}:00–${block.cls.fin}:00 · ${escapeHtml(block.cls.tipo)}</span></div>` +
    (issues.length ? `<div class="tooltip-warn">${escapeHtml(issues.join(" · "))}</div>` : "") +
    '<div class="tooltip-hint">Clic para quitarlo del horario</div>';

  tooltip.toggleAttribute("hidden", false);
  moveTooltip(event);
}

function moveTooltip(event: MouseEvent): void {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;
  let x = event.clientX + 12;
  let y = event.clientY + 12;
  if (x + 230 > window.innerWidth) x = event.clientX - 230;
  if (y + 220 > window.innerHeight) y = event.clientY - 220;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip(): void {
  document.getElementById("tooltip")?.toggleAttribute("hidden", true);
}

function updateHeader(): void {
  const selectedCount = document.getElementById("selected-count");
  if (selectedCount) selectedCount.textContent = `${Object.keys(selected).length} seleccionados`;
}

/**
 * Creditos del horario armado, separados por tipo de curso, mas los requisitos
 * de grado como referencia. El horario es de un ciclo: los minimos de egreso
 * son de toda la carrera, por eso se muestran aparte y no como progreso.
 */
function creditsBlock(): string {
  if (!curriculum) return "";

  const codes = Object.keys(selected).map(courseCode);
  const { total, byKind, sinMalla } = creditsByKind(curriculum, codes);

  const chips = (["Obligatorio", "Electivo", "Complementario"] as const)
    .filter((kind) => byKind[kind] > 0)
    .map(
      (kind) =>
        `<span class="malla-tag kind-${kind.toLowerCase()}">${kindLabel(kind)} ${byKind[kind]} cr</span>`,
    )
    .join("");

  const requisitos = curriculum.requirements
    .map(
      (r) =>
        `<div class="req-row"><span>${escapeHtml(r.tipo)}</span><span>${r.creditosMinimos} cr</span></div>` +
        (r.observacion ? `<div class="req-note">${escapeHtml(r.observacion)}</div>` : ""),
    )
    .join("");

  return (
    '<div class="credits-box">' +
    '<div class="credits-top"><span class="label">Créditos del horario</span>' +
    `<span class="value">${total}</span></div>` +
    (chips ? `<div class="credits-chips">${chips}</div>` : "") +
    (sinMalla
      ? `<div class="credits-note">${sinMalla} curso${sinMalla > 1 ? "s" : ""} fuera de la malla (otra carrera)</div>`
      : "") +
    (requisitos
      ? `<details class="req-details"><summary>Requisitos para egresar</summary>${requisitos}</details>`
      : "") +
    "</div>"
  );
}

function updateSummary(): void {
  const container = document.getElementById("summary-content");
  if (!container) return;

  const bad = getViolators(selected, params);
  const selectedEntries = Object.entries(selected);

  if (!selectedEntries.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      icon("pin", "empty-icon") +
      "<p>Todavía no elegiste cursos.</p>" +
      '<p class="hint">Buscalos en el catálogo o pulsá <strong>Mejor horario automático</strong>.</p>' +
      "</div>";
    return;
  }

  const average = avgScore();
  let html =
    '<div class="score-avg"><div class="label">Promedio docentes</div>' +
    `<div class="value ${scoreValueClass(average)}">${average !== null ? average.toFixed(2) : "—"}</div>` +
    '<div class="sub">sobre 20 puntos</div></div>' +
    `<div class="total-hours"><span class="label">Horas por semana</span><span class="value">${totalHours()}h</span></div>` +
    creditsBlock();

  for (const [course, sec] of selectedEntries) {
    const sc = getTeacherScore(sec.docente);
    const isBad = bad.has(course);
    const cn = colorMap[course];
    const dot = DOT_COLORS[cn ? Number(cn.split("-")[1]) : 0] ?? "#3b82f6";
    const issues = hardViolationsForSection(sec, params);
    const clashes: string[] = [];

    for (const [otherCourse, otherSec] of selectedEntries) {
      if (otherCourse === course) continue;
      for (const report of clashReport(sec.clases, otherSec.clases, params)) {
        if (!report.violated) continue;
        clashes.push(`↔ ${otherCourse.slice(0, 20)} [${report.kind} ${report.ov}h>${report.maxOk}h]`);
      }
    }

    html +=
      `<div class="selected-course-item${isBad ? " is-bad" : ""}">` +
      `<button type="button" class="sci-remove" data-course="${encodeURIComponent(course)}">` +
      icon("x") +
      `<span class="sr-only">Quitar ${escapeHtml(course)} del horario</span></button>` +
      `<div class="sci-name"><span class="sci-color-dot" style="background:${dot}"></span>${escapeHtml(course)}</div>` +
      `<div class="sci-detail">Sec. ${escapeHtml(sec.secId ?? "-")} · ${escapeHtml(sec.docente.split(",")[0])}</div>` +
      `<div class="sci-detail">${escapeHtml(
        sec.clases
          .map((c) => `${DAY_NAME[String(c.dia).trim() as DayCode] ?? c.dia} ${c.inicio}–${c.fin} ${c.tipo}`)
          .join(" · "),
      )}</div>` +
      (sc !== null ? `<div class="sci-score ${scoreValueClass(sc)}">${sc.toFixed(2)} / 20</div>` : "") +
      clashes
        .map((m) => `<p class="sci-issue clash">${icon("ban")}${escapeHtml(m)}</p>`)
        .join("") +
      issues.map((m) => `<p class="sci-issue warn">${icon("alert")}${escapeHtml(m)}</p>`).join("") +
      "</div>";
  }

  container.innerHTML = html;
  container.querySelectorAll<HTMLButtonElement>(".sci-remove[data-course]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const encoded = btn.dataset.course;
      if (!encoded) return;
      removeCourse(decodeURIComponent(encoded));
    });
  });
}

function renderGrid(): void {
  const body = document.getElementById("grid-body");
  const badge = document.getElementById("conflict-badge");
  if (!body || !badge) return;

  body.innerHTML = "";
  const bad = getViolators(selected, params);
  const blocks = layoutBlocks(selected, colorMap, bad);
  const rowH = rowHeight();

  for (const hour of visibleHours(params, selected)) {
    const label = document.createElement("div");
    label.className = `time-label${hour === params.minHour ? " hour-start" : ""}`;
    label.textContent = `${hour}:00`;
    body.appendChild(label);

    for (const day of DAYS) {
      const cell = document.createElement("div");
      cell.className = `grid-cell${params.freeDays.includes(day) ? " free-day" : ""}`;

      for (const block of blocks[`${day}-${hour}`] ?? []) {
        const duration = block.cls.fin - block.cls.inicio;
        // Boton real: navegable con Tab y activable con Enter o Espacio.
        const el = document.createElement("button");
        el.type = "button";
        el.className = `class-block ${block.color}${block.isBad ? " conflict-block" : ""}`;
        el.style.top = `${(block.cls.inicio - hour) * rowH + 2}px`;
        el.style.height = `${duration * rowH - 4}px`;

        if (block.lanes > 1) {
          const width = 96 / block.lanes;
          el.style.left = `${block.lane * width + 2}%`;
          el.style.right = `${(block.lanes - 1 - block.lane) * width + 2}%`;
        }

        const shortName = block.course.length > 25 ? `${block.course.slice(0, 23)}…` : block.course;
        const score = getTeacherScore(block.sec.docente);
        const dayName = DAY_NAME[day] ?? day;
        el.setAttribute(
          "aria-label",
          `${block.course}, sección ${block.sec.secId ?? "-"}, ${block.cls.tipo}, ` +
            `${dayName} de ${block.cls.inicio} a ${block.cls.fin} horas` +
            `${block.isBad ? ", con cruce inválido" : ""}. Activar para quitarlo del horario.`,
        );
        el.innerHTML =
          `<span class="cb-course">${escapeHtml(shortName)}</span>` +
          `<span class="cb-info">${escapeHtml(block.sec.docente.split(",")[0])}</span>` +
          `<span class="cb-type">${escapeHtml(block.cls.tipo)} · ${escapeHtml(block.sec.secId ?? "-")}${score !== null ? ` · ${score.toFixed(1)}` : ""}</span>`;
        el.addEventListener("mouseenter", (event) => showTooltip(event as MouseEvent, block));
        el.addEventListener("mousemove", (event) => moveTooltip(event as MouseEvent));
        el.addEventListener("mouseleave", hideTooltip);
        el.addEventListener("blur", hideTooltip);
        el.addEventListener("click", () => removeCourse(block.course));
        cell.appendChild(el);
      }

      body.appendChild(cell);
    }
  }

  badge.toggleAttribute("hidden", bad.size === 0);
  saveSelectedState();
  updateMetricsBar();
  updateSummary();
  updateHeader();
  renderCourseList();
}

function selectSection(courseName: string, secId: string): void {
  const sec = coursesData[courseName]?.[secId];
  if (!sec) return;
  if (!colorMap[courseName]) {
    colorMap[courseName] = COLORS[colorIdx % COLORS.length];
    colorIdx++;
  }

  selected[courseName] = { ...sec, secId };
  if (!desiredTargets.includes(courseName)) desiredTargets.push(courseName);
  renderGrid();

  const bad = getViolators(selected, params);
  const issues = hardViolationsForSection(selected[courseName], params);
  if (bad.has(courseName)) showNotif(`⛔ Cruce inválido en ${courseName.slice(0, 25)}`, "error");
  else if (issues.length) showNotif(`⚠ Agregado con aviso: ${issues[0]}`, "warning");
  else showNotif(`✓ ${courseName.slice(0, 28)} · Sec. ${secId}`, "success");
}

function removeCourse(courseName: string): void {
  delete selected[courseName];
  delete colorMap[courseName];
  desiredTargets = desiredTargets.filter((c) => c !== courseName);
  renderGrid();
  showNotif(`Eliminado: ${courseName.slice(0, 30)}`, "warning");
}

function clearAll(): void {
  selected = {};
  colorMap = {};
  colorIdx = 0;
  desiredTargets = [];
  renderGrid();
  showNotif("Horario limpiado", "warning");
}

function renderCourseList(): void {
  const container = document.getElementById("courses-list");
  if (!container) return;

  updateTotalCoursesCount();
  const normalizedQuery = searchQ.trim().toLowerCase();
  const bad = getViolators(selected, params);
  const recommendedSet = new Set(RECOMMENDED.map(resolveCourseName));

  const allCourses = Object.keys(coursesData).sort();
  const courseList = filterCourses(
    allCourses,
    {
      query: searchQ,
      mode: filter,
      cycle: cycleFilter,
      kind: kindFilter,
      recommended: recommendedSet,
      selected: new Set(Object.keys(selected)),
    },
    { code: courseCode, malla: courseCurriculum },
  );

  syncFilterControls(courseList.length, allCourses.length);

  if (!courseList.length) {
    const hint =
      cycleFilter || kindFilter
        ? '<p class="hint">Ningún curso ofertado este ciclo coincide con los filtros de malla.</p>'
        : '<p class="hint">Probá con otro nombre o con el código del curso.</p>';
    container.innerHTML =
      `<div class="empty-state">${icon("search", "empty-icon")}<p>Sin resultados</p>${hint}</div>`;
    return;
  }

  container.innerHTML = courseList
    .map((courseName) => {
      const secs = coursesData[courseName];
      const isSelected = Boolean(selected[courseName]);
      const isBad = bad.has(courseName);
      const isOpen = isSelected || (normalizedQuery && courseName.toLowerCase().includes(normalizedQuery));
      const isRecommended = recommendedSet.has(courseName);
      const code = Object.values(secs)[0]?.codigo ?? "";
      const cid = `ci-${courseName.replace(/\W/g, "_")}`;

      const sectionsHtml = Object.entries(secs)
        .map(([sid, sd]) => {
          const sec = { ...sd, secId: sid };
          const sc = getTeacherScore(sec.docente);
          const isActive = isSelected && selected[courseName].secId === sid;
          const issues = hardViolationsForSection(sec, params);
          const wouldViolate = !isActive && Object.keys(selected).length > 0 && causesViolation(courseName, sec, selected, params);

          const chips = sec.clases
            .map((c) => {
              const d = String(c.dia).trim() as DayCode;
              const issue = c.inicio < params.minHour || c.fin > params.maxHour || params.freeDays.includes(d);
              return (
                `<span class="schedule-chip day-${escapeHtml(d)}">${escapeHtml(d)} ${c.inicio}–${c.fin} ${escapeHtml(c.tipo)}` +
                `${issue ? icon("alert") : ""}</span>`
              );
            })
            .join("");

          let warn = "";
          if (wouldViolate) {
            warn = `<span class="warn-danger">${icon("ban")}Cruza con lo que ya elegiste</span>`;
          } else if (issues.length) {
            warn = `<span class="warn-soft">${icon("alert")}${escapeHtml(issues[0])}</span>`;
          }

          return (
            `<button type="button" class="section-card${isActive ? " active" : ""}${wouldViolate && !isActive ? " conflict" : ""}" ` +
            `data-course="${encodeURIComponent(courseName)}" data-sec="${escapeHtml(sid)}" ` +
            `aria-pressed="${isActive}">` +
            '<span class="sec-top">' +
            `<span class="sec-label">Sec. ${escapeHtml(sid)}</span>` +
            `<span class="teacher-name">${escapeHtml(sec.docente.includes("NN") ? "Por asignar" : sec.docente.split(",")[0])}</span>` +
            (sc !== null ? `<span class="teacher-score ${scoreClass(sc)}">${sc.toFixed(1)}</span>` : "") +
            "</span>" +
            `<span class="sec-schedule">${chips}</span>` +
            (warn ? `<span class="sec-warn">${warn}</span>` : "") +
            "</button>"
          );
        })
        .join("");

      const malla = courseCurriculum(courseName);
      const mallaTags = malla
        ? `<span class="malla-tag kind-${malla.tipo.toLowerCase()}">${kindLabel(malla.tipo)}</span>` +
          (malla.ciclo ? `<span class="malla-tag cycle">C${malla.ciclo}</span>` : "") +
          `<span class="malla-tag credits">${malla.creditos} cr</span>`
        : "";
      const prereqs =
        malla && malla.prereqs.length
          ? `<p class="malla-prereqs"><strong>Requiere:</strong> ${escapeHtml(
              malla.prereqs.map((p) => `${p.codigo} ${p.nombre}`).join(" · "),
            )}</p>`
          : "";

      const panelId = `${cid}-secs`;
      return (
        `<div class="course-item${isSelected ? " selected" : ""}${isBad ? " conflict-course" : ""}${isOpen ? " open" : ""}" id="${cid}">` +
        `<button type="button" class="course-header" data-toggle="${encodeURIComponent(courseName)}" ` +
        `aria-expanded="${Boolean(isOpen)}" aria-controls="${panelId}">` +
        `<span class="course-code">${escapeHtml(code)}</span>` +
        `<span class="course-name">${escapeHtml(courseName)}${isRecommended ? `<span class="rec-tag">${icon("star")}REC</span>` : ""}</span>` +
        mallaTags +
        (isSelected ? `<span class="course-selected-mark">${icon("check")}<span class="sr-only">En tu horario</span></span>` : "") +
        `<span class="course-toggle">${icon("chevron")}</span></button>` +
        `<div class="sections-panel" id="${panelId}">${prereqs}${sectionsHtml}</div>` +
        "</div>"
      );
    })
    .join("");

  container.querySelectorAll<HTMLElement>("[data-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      const encoded = el.dataset.toggle;
      if (!encoded) return;
      const courseName = decodeURIComponent(encoded);
      const item = document.getElementById(`ci-${courseName.replace(/\W/g, "_")}`);
      const open = item?.classList.toggle("open") ?? false;
      el.setAttribute("aria-expanded", String(open));
    });
  });

  container.querySelectorAll<HTMLElement>(".section-card[data-course]").forEach((el) => {
    el.addEventListener("click", () => {
      const courseEncoded = el.dataset.course;
      const secId = el.dataset.sec;
      if (!courseEncoded || !secId) return;
      selectSection(decodeURIComponent(courseEncoded), secId);
    });
  });
}

function showOptimizerReport(report: OptimizerReport): void {
  const body = document.getElementById("opt-report-body");
  const modal = document.getElementById("modal-report");
  if (!body || !modal) return;

  const placedCount = Object.keys(report.placed).length;
  const droppedCount = report.dropped.length;
  const hardCount = report.hardMisses.length;

  if (!droppedCount && !hardCount) {
    showNotif(`${placedCount} cursos colocados, sin cruces ni restricciones rotas`, "success");
    return;
  }

  const droppedHtml = report.dropped
    .map(
      (d) =>
        '<div class="report-item bad">' +
        `<h4>${icon("ban")}${escapeHtml(d.course)}</h4>` +
        `<p>${escapeHtml(d.reason)}</p>` +
        `<p>${d.checked} secciones evaluadas</p>` +
        "</div>",
    )
    .join("");

  const hardHtml = report.hardMisses
    .map(
      (m) =>
        '<div class="report-item warn">' +
        `<h4>${icon("alert")}${escapeHtml(m.course)}</h4>` +
        `<p>${escapeHtml(m.issues.join(" · "))}</p>` +
        "</div>",
    )
    .join("");

  body.innerHTML =
    '<div class="report-stats">' +
    `<div class="report-stat ok"><div class="n">${placedCount}</div><div class="t">Colocados</div></div>` +
    `<div class="report-stat bad"><div class="n">${droppedCount}</div><div class="t">Descartados</div></div>` +
    `<div class="report-stat warn"><div class="n">${hardCount}</div><div class="t">Restricciones</div></div>` +
    "</div>" +
    (droppedCount ? `<h3 class="report-group-title bad">Cursos descartados</h3>${droppedHtml}` : "") +
    (hardCount ? `<h3 class="report-group-title warn">Restricciones no cumplidas</h3>${hardHtml}` : "") +
    `<p class="report-tip">${icon("bulb")}<span>Aflojá los límites en <strong>Parámetros</strong> para intentar incluir los cursos descartados.</span></p>`;

  openModal("modal-report");
}

function closeReport(): void {
  closeModal("modal-report");
}

/**
 * Cursos que el optimizador debe intentar colocar.
 * Si el usuario ya eligio cursos, esos mandan: el generador reordena sus
 * secciones en vez de reemplazarle el horario por la lista recomendada.
 */
function optimizerTargets(): string[] {
  const userPicked = [...new Set([...Object.keys(selected), ...desiredTargets])].filter(
    (c) => coursesData[c],
  );
  if (userPicked.length) return userPicked;

  const recommended: string[] = [];
  for (const c of RECOMMENDED) {
    const resolved = resolveCourseName(c);
    if (coursesData[resolved] && !recommended.includes(resolved)) recommended.push(resolved);
  }
  if (recommended.length) return recommended.slice(0, params.maxCourses);

  return Object.keys(coursesData).slice(0, params.maxCourses);
}

function autoSelectBest(): void {
  const targets = optimizerTargets();
  if (!targets.length) {
    showNotif("No hay cursos cargados", "warning");
    return;
  }

  // El tope de cursos no debe recortar una lista que el propio usuario armo.
  const effective =
    targets.length > params.maxCourses ? { ...params, maxCourses: targets.length } : params;

  const report = runOptimizer(targets, coursesData, teacherScores, effective);
  desiredTargets = targets;
  selected = report.placed;
  colorMap = report.colorMap;
  colorIdx = report.colorIdx;
  renderGrid();
  showOptimizerReport(report);
}

/** Control que tenia el foco antes de abrir el modal, para devolverselo al cerrar. */
let modalOpener: HTMLElement | null = null;

function openModal(id: string): void {
  const modal = document.getElementById(id);
  if (!modal) return;
  modalOpener = document.activeElement as HTMLElement | null;
  modal.toggleAttribute("hidden", false);
  // Un frame de espera: el elemento debe estar visible para que la transicion corra.
  requestAnimationFrame(() => modal.classList.add("open"));
  modal.querySelector<HTMLElement>("button, [href], input, select")?.focus();
}

function closeModal(id: string): void {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("open");
  modal.toggleAttribute("hidden", true);
  modalOpener?.focus();
  modalOpener = null;
}

function openOptimizer(): void {
  fillModalFromParams(params);
  openModal("modal-overlay");
}

function closeOptimizer(): void {
  closeModal("modal-overlay");
}

/** Mantiene el foco dentro del modal abierto mientras se navega con Tab. */
function trapFocus(event: KeyboardEvent): void {
  const modal = document.querySelector<HTMLElement>(".modal-overlay.open .modal");
  if (!modal) return;

  const focusables = [...modal.querySelectorAll<HTMLElement>("button, input, select, textarea, [href]")].filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function resetParams(): void {
  params = normalizeParams(DEFAULT_PARAMS);
  fillModalFromParams(params);
  saveParamsState();
  showNotif("Parámetros restablecidos", "warning");
}

function applyAndGenerate(): void {
  params = normalizeParams(readParamsFromModal());
  saveParamsState();
  closeOptimizer();
  autoSelectBest();
}

function exportSchedule(): void {
  if (!Object.keys(selected).length) {
    showNotif("Sin cursos seleccionados", "warning");
    return;
  }

  const m = calcMetrics();
  let txt = `HORARIO FIIS ${PERIOD_LABEL}\n${"=".repeat(50)}\n\n`;
  txt += `RESTRICCIONES:\n  T+T: máx ${params.ruleTT}h | T+P: máx ${params.ruleTP}h | P+P: PROHIBIDO\n`;
  txt += `  Clases: ${params.minHour}:00-${params.maxHour}:00 | Días libres: ${params.freeDays.map((d) => DAY_NAME[d]).join(", ") || "Ninguno"}\n\n`;

  for (const [course, sec] of Object.entries(selected)) {
    const sc = getTeacherScore(sec.docente);
    txt += `📚 ${course}\n   Sec: ${sec.secId ?? "-"} | ${sec.docente}${sc !== null ? ` | ★${sc.toFixed(3)}` : ""}\n`;
    sec.clases.forEach((c) => {
      const d = DAY_NAME[String(c.dia).trim() as DayCode] ?? c.dia;
      txt += `   ${d} ${c.inicio}:00-${c.fin}:00 [${c.tipo}]\n`;
    });
    const issues = hardViolationsForSection(sec, params);
    if (issues.length) txt += `   ⚠ ${issues.join(" | ")}\n`;
    txt += "\n";
  }

  if (m) {
    const avg = avgScore();
    txt += `RESUMEN:\n  Promedio: ${avg !== null ? avg.toFixed(2) : "N/A"}/20 | Horas: ${totalHours()}h/sem\n`;
    txt += `  Días libres: ${m.freeDays.map((d) => DAY_NAME[d]).join(", ") || "Ninguno"}\n`;
    txt += `  Cruces T/T: ${m.ttOv}h | T/P: ${m.tpOv}h\n`;
  }

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `horario_FIIS_${PERIOD_LABEL}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  showNotif(`Horario exportado como horario_FIIS_${PERIOD_LABEL}.txt`, "success");
}

/** Muestra y cablea los filtros de ciclo/tipo. Sin malla quedan ocultos. */
function setupMallaFilters(): void {
  const box = document.getElementById("malla-filters");
  const cycleSel = document.getElementById("filter-cycle") as HTMLSelectElement | null;
  const chips = document.getElementById("kind-chips");
  const clearBtn = document.getElementById("filter-clear");
  if (!box || !cycleSel || !chips || !clearBtn) return;

  if (!curriculum) {
    box.toggleAttribute("hidden", true);
    return;
  }

  cycleSel.innerHTML =
    '<option value="">Todos los ciclos</option>' +
    curriculum.cycles.map((c) => `<option value="${c}">Ciclo ${c}</option>`).join("");

  cycleSel.addEventListener("change", () => {
    cycleFilter = cycleSel.value;
    renderCourseList();
  });

  // Los chips alternan: volver a pulsar el activo quita el filtro.
  chips.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-kind]");
    if (!chip?.dataset.kind) return;
    kindFilter = kindFilter === chip.dataset.kind ? "" : chip.dataset.kind;
    renderCourseList();
  });

  clearBtn.addEventListener("click", () => {
    cycleFilter = "";
    kindFilter = "";
    cycleSel.value = "";
    renderCourseList();
  });

  box.toggleAttribute("hidden", false);
}

/** Refleja en los controles que filtros estan activos. */
function syncFilterControls(shown: number, total: number): void {
  const cycleSel = document.getElementById("filter-cycle") as HTMLSelectElement | null;
  const clearBtn = document.getElementById("filter-clear");
  const count = document.getElementById("course-count");
  const active = Boolean(cycleFilter || kindFilter);

  cycleSel?.classList.toggle("active", Boolean(cycleFilter));
  document.querySelectorAll<HTMLElement>(".kind-chip[data-kind]").forEach((chip) => {
    const on = chip.dataset.kind === kindFilter;
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", String(on));
  });
  clearBtn?.toggleAttribute("hidden", !active);

  if (!count) return;
  const filtering = active || searchQ.trim().length > 0;
  count.toggleAttribute("hidden", !filtering);
  if (filtering) count.textContent = `${shown} de ${total} cursos`;
}

/** Conecta los controles fijos del HTML. Antes vivian en atributos onclick. */
function wireControls(): void {
  const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", fn);

  on("btn-auto", autoSelectBest);
  on("btn-params", openOptimizer);
  on("btn-clear", clearAll);
  on("btn-export", exportSchedule);
  on("btn-reset-params", resetParams);
  on("btn-apply", applyAndGenerate);
  on("btn-report-params", () => {
    closeReport();
    openOptimizer();
  });
  on("toggle-sidebar-btn", () => togglePanel("sidebar"));
  on("reopen-sidebar-btn", () => togglePanel("sidebar"));
  on("toggle-summary-btn", () => togglePanel("summary"));
  on("reopen-summary-btn", () => togglePanel("summary"));

  document.querySelectorAll<HTMLElement>("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close as string));
  });

  // Clic fuera del cuadro cierra el modal.
  document.querySelectorAll<HTMLElement>(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal(overlay.id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const open = document.querySelector<HTMLElement>(".modal-overlay.open");
      if (open) closeModal(open.id);
    } else if (event.key === "Tab") {
      trapFocus(event);
    }
  });
}

async function init(): Promise<void> {
  loadPanelState();
  // En pantallas angostas los paneles son cajones que tapan el horario:
  // arrancan cerrados para que se vea la grilla primero.
  if (window.matchMedia("(max-width: 900px)").matches) {
    panelState.sidebar = false;
    panelState.summary = false;
  }
  applyPanelState();
  fillModalFromParams(params);
  wireControls();

  document.querySelectorAll<HTMLElement>(".day-check").forEach((label) => {
    const cb = label.querySelector<HTMLInputElement>("input");
    if (!cb) return;
    label.classList.toggle("checked", cb.checked);
    cb.addEventListener("change", () => label.classList.toggle("checked", cb.checked));
  });

  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      searchQ = target.value;
      renderCourseList();
    });
  }

  const tabs = document.getElementById("filter-tabs");
  if (tabs) {
    tabs.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-filter]");
      const next = target?.dataset.filter as FilterMode | undefined;
      if (!next || !target) return;
      filter = next;
      document.querySelectorAll<HTMLElement>(".tab-btn").forEach((b) => {
        const on = b === target;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      renderCourseList();
    });
  }

  const defaults = await loadDefaultData();
  coursesData = defaults.courses;
  teacherScores = defaults.scores;

  const [excelCourses, excelScores, excelCurriculum] = await Promise.all([
    loadCoursesFromExcel(),
    loadTeacherScoresFromExcel(),
    loadCurriculumFromExcel(),
  ]);
  if (excelCourses.data) coursesData = excelCourses.data;
  if (excelScores.data) teacherScores = excelScores.data;
  curriculum = excelCurriculum.data;
  setupMallaFilters();

  refreshCourseLookup();
  updateTotalCoursesCount();

  const restored = restoreSelectedState();
  renderCourseList();
  renderGrid();

  // Un Excel ausente es normal (se usa el JSON base); uno ilegible hay que avisarlo.
  const excelErrors = [excelCourses.error, excelScores.error, excelCurriculum.error].filter(
    (e): e is string => Boolean(e),
  );
  if (excelErrors.length) {
    console.warn("[horarios] Excel no utilizable:", excelErrors.join(" · "));
    showNotif(`${excelErrors[0]}. Se usan los datos por defecto.`, "warning");
  } else if (excelCourses.data && excelScores.data) {
    showNotif("Cursos y notas cargados desde Excel", "success");
  } else if (excelCourses.data) {
    showNotif("Cursos cargados desde Excel", "success");
  } else if (excelScores.data) {
    showNotif("Notas de docentes cargadas desde Excel", "success");
  }

  // Solo genera automatico en el primer arranque; si habia horario guardado, se respeta.
  const restoredCount = Object.keys(selected).length;
  if (!restored) window.setTimeout(autoSelectBest, 150);
  else if (restoredCount) showNotif(`Horario restaurado con ${restoredCount} cursos`, "success");
}

void init();
