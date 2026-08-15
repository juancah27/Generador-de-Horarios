import { describe, expect, it } from "vitest";
import { buildCurriculum, creditsByKind, kindLabel } from "./curriculum";

const CURSOS = [
  ["CodigoCurso", "NombreCurso", "Creditos", "TipoCurso", "CicloPlan"],
  ["BMA01", "CALCULO DIFERENCIAL", 5, "Obligatorio", 1],
  ["BMA02", "CALCULO INTEGRAL", 4, "Obligatorio", 2],
  ["GE114", "TEORIA DE PRECIOS", 3, "Electivo", ""],
  ["TE121", "ERGONOMIA", 3, "Complementario", ""],
];

const PREREQ = [
  ["CodigoCurso", "CodigoPrerequisito", "NombrePrerequisito"],
  ["BMA02", "BMA01", "CALCULO DIFERENCIAL"],
];

const REQ = [
  ["TipoCurso", "CreditosMinimos", "Observación"],
  ["Obligatorio", 187, ""],
  ["Electivo", 6, ""],
  ["OtrasActividades", 5, "Practicas e idioma extranjero"],
];

const malla = buildCurriculum({ cursos: CURSOS, prerequisitos: PREREQ, requisitos: REQ });

describe("buildCurriculum", () => {
  it("indexa los cursos por codigo", () => {
    expect(Object.keys(malla.byCode).sort()).toEqual(["BMA01", "BMA02", "GE114", "TE121"]);
    expect(malla.byCode.BMA01.creditos).toBe(5);
    expect(malla.byCode.BMA01.nombre).toBe("CALCULO DIFERENCIAL");
  });

  it("distingue obligatorios, electivos y complementarios", () => {
    expect(malla.byCode.BMA01.tipo).toBe("Obligatorio");
    expect(malla.byCode.GE114.tipo).toBe("Electivo");
    expect(malla.byCode.TE121.tipo).toBe("Complementario");
  });

  it("deja el ciclo en null cuando el curso es libre", () => {
    expect(malla.byCode.BMA02.ciclo).toBe(2);
    expect(malla.byCode.GE114.ciclo).toBeNull();
    expect(malla.byCode.TE121.ciclo).toBeNull();
  });

  it("lista los ciclos presentes, ordenados y sin nulos", () => {
    expect(malla.cycles).toEqual([1, 2]);
  });

  it("engancha los prerequisitos al curso que los exige", () => {
    expect(malla.byCode.BMA02.prereqs).toEqual([
      { codigo: "BMA01", nombre: "CALCULO DIFERENCIAL" },
    ]);
    expect(malla.byCode.BMA01.prereqs).toEqual([]);
  });

  it("acumula varios prerequisitos y no los duplica", () => {
    const out = buildCurriculum({
      cursos: CURSOS,
      prerequisitos: [
        ...PREREQ,
        ["BMA02", "GE114", "TEORIA DE PRECIOS"],
        ["BMA02", "BMA01", "CALCULO DIFERENCIAL"],
      ],
      requisitos: REQ,
    });
    expect(out.byCode.BMA02.prereqs.map((p) => p.codigo)).toEqual(["BMA01", "GE114"]);
  });

  it("lee los requisitos de grado con su observacion", () => {
    expect(malla.requirements).toHaveLength(3);
    expect(malla.requirements[0]).toEqual({
      tipo: "Obligatorio",
      creditosMinimos: 187,
      observacion: "",
    });
    expect(malla.requirements[2].observacion).toContain("idioma");
  });

  it("ubica las columnas por nombre, no por posicion", () => {
    const reordenado = [
      ["CicloPlan", "TipoCurso", "NombreCurso", "CodigoCurso", "Creditos"],
      [3, "Obligatorio", "FISICA I", "BFI01", 4],
    ];
    const out = buildCurriculum({ cursos: reordenado, prerequisitos: [], requisitos: [] });
    expect(out.byCode.BFI01).toMatchObject({ nombre: "FISICA I", creditos: 4, ciclo: 3 });
  });

  it("devuelve vacio si la hoja no tiene las columnas esperadas", () => {
    const out = buildCurriculum({ cursos: [["a", "b"], [1, 2]], prerequisitos: [], requisitos: [] });
    expect(out.byCode).toEqual({});
    expect(out.cycles).toEqual([]);
  });

  it("ignora prerequisitos de cursos que no estan en la malla", () => {
    const out = buildCurriculum({
      cursos: CURSOS,
      prerequisitos: [...PREREQ, ["ZZ999", "BMA01", "CALCULO DIFERENCIAL"]],
      requisitos: REQ,
    });
    expect(out.byCode.ZZ999).toBeUndefined();
  });
});

describe("creditsByKind", () => {
  it("suma creditos separando por tipo", () => {
    const out = creditsByKind(malla, ["BMA01", "GE114", "TE121"]);
    expect(out.total).toBe(11);
    expect(out.byKind).toEqual({ Obligatorio: 5, Electivo: 3, Complementario: 3 });
    expect(out.sinMalla).toBe(0);
  });

  it("cuenta aparte los cursos que no estan en la malla", () => {
    // La carga horaria cubre varias carreras; la malla es solo de Industrial.
    const out = creditsByKind(malla, ["BMA01", "SI205", "SW101"]);
    expect(out.total).toBe(5);
    expect(out.sinMalla).toBe(2);
  });

  it("tolera codigos en minuscula o con espacios", () => {
    expect(creditsByKind(malla, [" bma01 "]).total).toBe(5);
  });
});

describe("kindLabel", () => {
  it("abrevia el tipo para las insignias", () => {
    expect(kindLabel("Obligatorio")).toBe("OBL");
    expect(kindLabel("Electivo")).toBe("ELE");
    expect(kindLabel("Complementario")).toBe("COMP");
  });
});
