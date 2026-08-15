import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { buildCoursesFromRows, loadCoursesFromExcel } from "./data-service";

// Cabecera real de "CARGA HORARIA 2026-1 Oficial.xlsx", con los saltos de linea
// y el padding que trae el archivo.
const HEADER = [
  "CÓDIGO",
  "NOMBRE DEL CURSO",
  "SECCIÓN",
  "SISTEMA DE\nEVALUACIÓN",
  "APELLIDOS Y NOMBRES\n DEL DOCENTE",
  "TIPO    ",
  "AULA",
  "DÍA",
  "HORA\nINICIO",
  "HORA\nFINAL",
  "VACANTES",
];

const row = (
  codigo: string,
  curso: string,
  sec: string,
  docente: string,
  tipo: string,
  dia: string,
  inicio: unknown,
  fin: unknown,
) => [codigo, curso, sec, "D", docente, tipo, "S4-205", dia, inicio, fin, 42];

describe("buildCoursesFromRows", () => {
  it("encuentra la cabecera aunque el Excel arranque con filas vacias", () => {
    const rows = [
      [],
      ["", "", ""],
      HEADER,
      row("BEF01", "ETICA Y FILOSOFIA POLITICA", "U", "CAMPANA, RILDO", "T", "SA", 8, 9),
    ];

    const out = buildCoursesFromRows(rows);
    expect(Object.keys(out)).toEqual(["ETICA Y FILOSOFIA POLITICA"]);
    expect(out["ETICA Y FILOSOFIA POLITICA"].U.clases).toEqual([
      { tipo: "T", dia: "SA", inicio: 8, fin: 9 },
    ]);
  });

  it("agrupa varias clases bajo la misma seccion", () => {
    const rows = [
      HEADER,
      row("BEF01", "ETICA", "U", "CAMPANA, RILDO", "T", "SA", 8, 9),
      row("BEF01", "ETICA", "U", "CAMPANA, RILDO", "P", "SA", 9, 11),
    ];

    expect(buildCoursesFromRows(rows).ETICA.U.clases).toHaveLength(2);
  });

  it("deduplica filas identicas", () => {
    const rows = [
      HEADER,
      row("BEF01", "ETICA", "U", "CAMPANA, RILDO", "T", "SA", 8, 9),
      row("BEF01", "ETICA", "U", "CAMPANA, RILDO", "T", "SA", 8, 9),
    ];

    expect(buildCoursesFromRows(rows).ETICA.U.clases).toHaveLength(1);
  });

  it("normaliza TEORIA y PRACTICA a T y P", () => {
    const rows = [
      HEADER,
      row("X1", "CURSO", "A", "N, N", "Teoria", "LU", 8, 10),
      row("X1", "CURSO", "B", "N, N", "Practica", "LU", 10, 12),
    ];

    const out = buildCoursesFromRows(rows);
    expect(out.CURSO.A.clases[0].tipo).toBe("T");
    expect(out.CURSO.B.clases[0].tipo).toBe("P");
  });

  it("descarta filas sin dia valido o con horario invertido", () => {
    const rows = [
      HEADER,
      row("X1", "CURSO", "A", "N, N", "T", "DOMINGO", 8, 10),
      row("X1", "CURSO", "A", "N, N", "T", "LU", 12, 10),
      row("X1", "CURSO", "A", "N, N", "T", "LU", 8, 10),
    ];

    expect(buildCoursesFromRows(rows).CURSO.A.clases).toHaveLength(1);
  });

  it("unifica el mismo curso escrito con tildes o espacios distintos", () => {
    const rows = [
      HEADER,
      row("X1", "AUTOMATIZACION", "A", "N, N", "T", "LU", 8, 10),
      row("X1", "Automatización ", "B", "N, N", "T", "MA", 8, 10),
    ];

    const out = buildCoursesFromRows(rows);
    expect(Object.keys(out)).toHaveLength(1);
    expect(Object.keys(out.AUTOMATIZACION)).toEqual(["A", "B"]);
  });

  it("pone un docente placeholder cuando la celda esta vacia", () => {
    const rows = [HEADER, row("X1", "CURSO", "A", "", "T", "LU", 8, 10)];
    expect(buildCoursesFromRows(rows).CURSO.A.docente).toContain("NN");
  });

  it("devuelve vacio si no hay cabecera reconocible", () => {
    expect(buildCoursesFromRows([["a", "b", "c"], ["1", "2", "3"]])).toEqual({});
  });
});

/** Respuesta minima que le alcanza a `readFirstSheetRows`. */
function fakeResponse(status: number, contentType: string, body: ArrayBuffer | string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => (typeof body === "string" ? new TextEncoder().encode(body).buffer : body),
  } as unknown as Response;
}

function xlsxBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Hoja1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("loadCoursesFromExcel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lee un Excel valido", async () => {
    const buf = xlsxBuffer([HEADER, row("X1", "CURSO", "A", "N, N", "T", "LU", 8, 10)]);
    vi.stubGlobal("fetch", async () => fakeResponse(200, "application/octet-stream", buf));

    const res = await loadCoursesFromExcel();
    expect(res.error).toBeUndefined();
    expect(Object.keys(res.data ?? {})).toEqual(["CURSO"]);
  });

  it("trata un 404 como archivo ausente, sin error", async () => {
    vi.stubGlobal("fetch", async () => fakeResponse(404, "text/html", ""));

    const res = await loadCoursesFromExcel();
    expect(res.data).toBeNull();
    expect(res.error).toBeUndefined();
  });

  it("trata el index.html del dev server como archivo ausente, sin error", async () => {
    // Vite responde 200 + HTML para archivos inexistentes.
    vi.stubGlobal("fetch", async () => fakeResponse(200, "text/html", "<!doctype html>"));

    const res = await loadCoursesFromExcel();
    expect(res.data).toBeNull();
    expect(res.error).toBeUndefined();
  });

  it("reporta un Excel corrupto", async () => {
    vi.stubGlobal("fetch", async () => fakeResponse(200, "application/octet-stream", "no soy un xlsx"));

    const res = await loadCoursesFromExcel();
    expect(res.data).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it("reporta un Excel cuyas columnas no se reconocen", async () => {
    const buf = xlsxBuffer([["a", "b"], ["1", "2"]]);
    vi.stubGlobal("fetch", async () => fakeResponse(200, "application/octet-stream", buf));

    const res = await loadCoursesFromExcel();
    expect(res.data).toBeNull();
    expect(res.error).toContain("no se reconocieron columnas");
  });
});
