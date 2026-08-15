import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLORS, DOT_COLORS } from "./constants";

/**
 * Guarda el contraste de la paleta.
 *
 * Los colores no viven en TypeScript sino en `styles.css`, asi que el test lee
 * el CSS y calcula los ratios reales. Si alguien baja el brillo de un token,
 * este test falla antes de que el texto se vuelva ilegible en producción.
 *
 * Umbrales WCAG 2.1: 4.5:1 para texto normal (1.4.3) y 3:1 para grafismo no
 * textual como iconos o barras de scroll (1.4.11).
 */
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`));
  if (!match) throw new Error(`Token ${name} no encontrado en styles.css`);
  return match[1];
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Compone `fg` con opacidad `alpha` sobre `bg`, como haria el navegador. */
function composite(fg: number[], alpha: number, bg: number[]): number[] {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function contrast(fg: number[], bg: number[]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const BG = toRgb(token("--bg"));
const SURFACE = toRgb(token("--surface"));
const SURFACE2 = toRgb(token("--surface2"));
const WHITE = toRgb("#ffffff");

/** Cada superficie sobre la que se apoya texto secundario. */
const SURFACES: Array<[string, number[]]> = [
  ["--bg", BG],
  ["--surface", SURFACE],
  ["--surface2", SURFACE2],
];

describe("contraste del texto", () => {
  it.each(SURFACES)("--muted es legible sobre %s", (_name, surface) => {
    expect(contrast(toRgb(token("--muted")), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("--text es legible sobre %s", (_name, surface) => {
    expect(contrast(toRgb(token("--text")), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--accent-text", "--ok-text", "--warn-text", "--danger-text"])(
    "%s es legible sobre la superficie mas clara",
    (name) => {
      // --surface2 es la mas clara: si pasa ahi, pasa en las otras dos.
      expect(contrast(toRgb(token(name)), SURFACE2)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("contraste de los rellenos con texto blanco", () => {
  it.each(["--accent-fill", "--accent2-fill", "--danger-fill"])(
    "%s admite texto blanco encima",
    (name) => {
      expect(contrast(WHITE, toRgb(token(name)))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("los tonos de marca NO se usan como relleno con texto blanco", () => {
    // Documenta por que existen los tokens -fill: los de marca no llegan a AA.
    expect(contrast(WHITE, toRgb(token("--accent")))).toBeLessThan(4.5);
    expect(contrast(WHITE, toRgb(token("--danger")))).toBeLessThan(4.5);
  });
});

describe("contraste del grafismo no textual", () => {
  it.each(SURFACES)("--decor se distingue sobre %s", (_name, surface) => {
    expect(contrast(toRgb(token("--decor")), surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("colores de curso de la grilla", () => {
  // El texto de cada bloque se lee sobre su propio fondo translucido al 20%.
  const blocks = [...css.matchAll(/\.color-(\d+) \{ background: rgba\(([\d, ]+), 0\.2\); border-color: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); \}/g)];

  it("encuentra las 14 clases de color", () => {
    expect(blocks).toHaveLength(14);
  });

  it.each(blocks.map((m) => [m[1], m[2], m[4]]))(
    "color-%s tiene texto legible sobre su fondo",
    (_i, rgbList, textHex) => {
      const tint = String(rgbList).split(",").map((n) => Number(n.trim()));
      const bg = composite(tint, 0.2, SURFACE);
      expect(contrast(toRgb(String(textHex)), bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("sincronia entre TS y CSS", () => {
  it("DOT_COLORS coincide con el border-color de cada .color-N", () => {
    // El punto del resumen y el bloque de la grilla deben ser el mismo color:
    // son la misma clave visual para el mismo curso, en dos paneles distintos.
    const cssBorders = [...css.matchAll(/\.color-(\d+) \{[^}]*border-color: (#[0-9a-f]{6})/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2]);

    expect(cssBorders).toEqual(DOT_COLORS.map((c) => c.toLowerCase()));
  });

  it("hay una clase .color-N por cada entrada de COLORS", () => {
    expect(COLORS).toHaveLength(DOT_COLORS.length);
    for (const name of COLORS) expect(css).toContain(`.${name} {`);
  });
});

describe("escala tipografica", () => {
  it("no quedan tamaños de fuente sueltos fuera de la escala", () => {
    const literals = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    // Los unicos px crudos permitidos son los del propio bloque de tokens y el
    // icono de estado vacio, que es un grafico y no texto.
    const allowed = new Set([10, 11, 12, 13, 16, 20, 28, 32]);
    const outliers = [...new Set(literals)].filter((n) => !allowed.has(n));
    expect(outliers).toEqual([]);
  });

  it("ya no se usa texto de 9px", () => {
    expect(css).not.toMatch(/font-size:\s*9px/);
  });
});
