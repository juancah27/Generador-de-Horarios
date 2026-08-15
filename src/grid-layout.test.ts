import { describe, expect, it } from "vitest";
import { layoutBlocks, visibleHours } from "./grid-layout";
import { DEFAULT_PARAMS } from "./constants";
import type { SectionData } from "./types";

const sec = (dia: string, inicio: number, fin: number): SectionData => ({
  docente: "X, Y",
  codigo: "C01",
  secId: "1",
  clases: [{ tipo: "T", dia, inicio, fin }],
});

const noBad = new Set<string>();

describe("layoutBlocks", () => {
  it("separa en carriles clases que se pisan con inicios distintos", () => {
    // Este es el caso que la version anterior dibujaba una encima de la otra.
    const blocks = layoutBlocks({ A: sec("LU", 8, 10), B: sec("LU", 9, 11) }, {}, noBad);

    const a = blocks["LU-8"][0];
    const b = blocks["LU-9"][0];
    expect(a.lanes).toBe(2);
    expect(b.lanes).toBe(2);
    expect(new Set([a.lane, b.lane])).toEqual(new Set([0, 1]));
  });

  it("reutiliza el carril cuando no hay solape", () => {
    const blocks = layoutBlocks({ A: sec("LU", 8, 10), B: sec("LU", 10, 12) }, {}, noBad);

    expect(blocks["LU-8"][0].lanes).toBe(1);
    expect(blocks["LU-10"][0].lanes).toBe(1);
  });

  it("encadena solapes transitivos en un mismo grupo", () => {
    // A-B se pisan, B-C se pisan, A-C no: los tres comparten ancho.
    const blocks = layoutBlocks(
      { A: sec("MA", 8, 10), B: sec("MA", 9, 12), C: sec("MA", 11, 13) },
      {},
      noBad,
    );

    expect(blocks["MA-8"][0].lanes).toBe(2);
    expect(blocks["MA-11"][0].lanes).toBe(2);
    expect(blocks["MA-11"][0].lane).toBe(0);
  });

  it("no mezcla dias distintos", () => {
    const blocks = layoutBlocks({ A: sec("LU", 8, 10), B: sec("MA", 8, 10) }, {}, noBad);

    expect(blocks["LU-8"][0].lanes).toBe(1);
    expect(blocks["MA-8"][0].lanes).toBe(1);
  });
});

describe("visibleHours", () => {
  it("mantiene la ventana base por defecto", () => {
    expect(visibleHours(DEFAULT_PARAMS, {})).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
  });

  it("se estira hasta minHour", () => {
    expect(visibleHours({ ...DEFAULT_PARAMS, minHour: 7 }, {})[0]).toBe(7);
  });

  it("se estira para no ocultar una clase elegida", () => {
    const hours = visibleHours(DEFAULT_PARAMS, { A: sec("LU", 6, 8) });
    expect(hours[0]).toBe(6);
  });
});
