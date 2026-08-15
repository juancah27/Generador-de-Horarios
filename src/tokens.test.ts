import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLORS, DOT_COLORS } from "./constants";

/**
 * Guarda el contraste de la paleta, en los dos temas.
 *
 * Los colores no viven en TypeScript sino en `styles.css`, asi que el test lee
 * el CSS, resuelve los tokens de cada tema y calcula los ratios reales. Si
 * alguien baja el brillo de un token, este test falla antes de que el texto se
 * vuelva ilegible en producción.
 *
 * Umbrales WCAG 2.1: 4.5:1 para texto normal (1.4.3) y 3:1 para grafismo no
 * textual como iconos o barras de scroll (1.4.11).
 */
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Bloque ${selector} no encontrado`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

/** Tokens del tema oscuro (`:root`) y del claro, que solo redefine color. */
const DARK_BLOCK = block(":root {");
const LIGHT_BLOCK = block(':root[data-theme="light"]');

function readToken(source: string, name: string): string | null {
  const match = source.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  return match ? match[1] : null;
}

function readPercent(theme: "dark" | "light", name: string): number {
  const source = theme === "light" ? LIGHT_BLOCK : DARK_BLOCK;
  const match = source.match(new RegExp(`${name}:\\s*(\\d+)%`));
  if (!match) throw new Error(`Token ${name} no encontrado en el tema ${theme}`);
  return Number(match[1]);
}

/** El tema claro hereda del oscuro todo lo que no redefine. */
function token(theme: "dark" | "light", name: string): string {
  const value =
    theme === "light"
      ? readToken(LIGHT_BLOCK, name) ?? readToken(DARK_BLOCK, name)
      : readToken(DARK_BLOCK, name);
  if (!value) throw new Error(`Token ${name} no encontrado en el tema ${theme}`);
  return value;
}

function toRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: number[], bg: number[]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Replica `color-mix(in srgb, a p%, b)`: interpolacion lineal en sRGB. */
function mix(a: Rgb, percent: number, b: Rgb): Rgb {
  const p = percent / 100;
  return a.map((c, i) => Math.round(c * p + b[i] * (1 - p))) as Rgb;
}

const THEMES = ["dark", "light"] as const;
/** Superficies sobre las que se apoya texto en cada tema. */
const SURFACE_TOKENS = ["--bg", "--surface", "--surface2", "--surface3"];

/** Producto cartesiano tema x superficie, para it.each. */
const themeSurfaces = THEMES.flatMap((theme) => SURFACE_TOKENS.map((s) => [theme, s] as const));

describe("contraste del texto", () => {
  it.each(themeSurfaces)("[%s] --muted es legible sobre %s", (theme, surface) => {
    expect(contrast(toRgb(token(theme, "--muted")), toRgb(token(theme, surface)))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(themeSurfaces)("[%s] --text es legible sobre %s", (theme, surface) => {
    expect(contrast(toRgb(token(theme, "--text")), toRgb(token(theme, surface)))).toBeGreaterThanOrEqual(4.5);
  });

  const stateTokens = ["--accent-text", "--ok-text", "--warn-text", "--danger-text"];
  it.each(THEMES.flatMap((t) => stateTokens.map((n) => [t, n] as const)))(
    "[%s] %s es legible sobre la superficie mas contrastante",
    (theme, name) => {
      // Peor caso: --surface2 en oscuro (la mas clara), --surface en claro (blanco).
      const worst = theme === "dark" ? "--surface2" : "--surface";
      expect(contrast(toRgb(token(theme, name)), toRgb(token(theme, worst)))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("contraste de los rellenos con texto blanco", () => {
  const fills = ["--accent-fill", "--accent2-fill", "--danger-fill"];
  it.each(THEMES.flatMap((t) => fills.map((n) => [t, n] as const)))(
    "[%s] %s admite texto blanco encima",
    (theme, name) => {
      expect(contrast(toRgb("#ffffff"), toRgb(token(theme, name)))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("contraste del grafismo no textual", () => {
  it.each(themeSurfaces)("[%s] --decor se distingue sobre %s", (theme, surface) => {
    expect(contrast(toRgb(token(theme, "--decor")), toRgb(token(theme, surface)))).toBeGreaterThanOrEqual(3);
  });

  // El borde separa paneles del fondo; --surface3 es un color de hover, no
  // una superficie que se bordee, asi que queda fuera del chequeo.
  const borderSurfaces = THEMES.flatMap((t) =>
    ["--bg", "--surface", "--surface2"].map((s) => [t, s] as const),
  );
  it.each(borderSurfaces)("[%s] --border se distingue sobre %s", (theme, surface) => {
    expect(contrast(toRgb(token(theme, "--border")), toRgb(token(theme, surface)))).toBeGreaterThanOrEqual(1.1);
  });
});

/** Un `--c` por clase `.color-N`, en orden. */
const courseColors = [...css.matchAll(/\.color-(\d+) \{ --c: (#[0-9a-f]{6}); \}/g)]
  .sort((a, b) => Number(a[1]) - Number(b[1]))
  .map((m) => m[2]);

/** Distancia euclidea en sRGB entre dos colores. */
function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt(a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0));
}

const courseCases = THEMES.flatMap((t) => courseColors.map((c, i) => [t, i, c] as const));

describe("colores de curso de la grilla", () => {
  it("hay 14 colores de curso", () => {
    expect(courseColors).toHaveLength(14);
  });

  it.each(courseCases)("[%s] color-%i tiene texto legible sobre su propio fondo", (theme, _i, hex) => {
    const c = toRgb(hex);
    const bg = mix(c, readPercent(theme, "--c-bg"), toRgb(token(theme, "--surface")));
    const fg = mix(c, readPercent(theme, "--c-text"), toRgb(token(theme, "--text")));
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * El nombre del docente es texto secundario: hereda el color del bloque con
   * transparencia, asi que su contraste efectivo mezcla el texto con el fondo.
   * Se pide 3:1 (umbral de grafismo), menos que los 4.5:1 del curso, que es
   * lo que debe destacar.
   */
  const infoOpacity = Number(css.match(/\.cb-info \{[^}]*opacity:\s*([\d.]+)/)?.[1] ?? 1);
  it.each(courseCases)("[%s] color-%i el docente se lee sobre su fondo", (theme, _i, hex) => {
    const c = toRgb(hex);
    const bg = mix(c, readPercent(theme, "--c-bg"), toRgb(token(theme, "--surface")));
    const fg = mix(c, readPercent(theme, "--c-text"), toRgb(token(theme, "--text")));
    const eff = fg.map((v, i) => Math.round(v * infoOpacity + bg[i] * (1 - infoOpacity))) as Rgb;
    expect(contrast(eff, bg)).toBeGreaterThanOrEqual(3);
  });

  it("el docente usa transparencia, no un color fijo", () => {
    const info = css.match(/\.cb-info \{([^}]*)\}/)?.[1] ?? "";
    expect(info).toMatch(/opacity:/);
    expect(info).not.toMatch(/color:/);
  });

  /*
   * El bloque tiene que despegarse del panel. La razon de luminancia no sirve
   * para esto: un cian brillante sobre panel blanco tiene poca diferencia de
   * luminancia y aun asi se distingue perfecto, porque la diferencia es de
   * tono. Se mide distancia de color, que es lo que corresponde.
   */
  it.each(courseCases)("[%s] color-%i se despega del panel", (theme, _i, hex) => {
    const surface = toRgb(token(theme, "--surface"));
    const bg = mix(toRgb(hex), readPercent(theme, "--c-bg"), surface);
    const border = mix(toRgb(hex), readPercent(theme, "--c-border"), surface);
    expect(distance(bg, surface)).toBeGreaterThanOrEqual(20);
    expect(distance(border, surface)).toBeGreaterThanOrEqual(60);
  });
});

describe("sincronia entre TS y CSS", () => {
  it("DOT_COLORS coincide con el --c de cada .color-N", () => {
    // El punto del resumen y el bloque de la grilla deben ser el mismo color:
    // son la misma clave visual para el mismo curso, en dos paneles distintos.
    expect(courseColors).toEqual(DOT_COLORS.map((c) => c.toLowerCase()));
  });

  it("hay una clase .color-N por cada entrada de COLORS", () => {
    expect(COLORS).toHaveLength(DOT_COLORS.length);
    for (const name of COLORS) expect(css).toContain(`.${name} {`);
  });
});

describe("escala tipografica", () => {
  it("no quedan tamaños de fuente sueltos fuera de la escala", () => {
    const literals = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    // 32px es el icono del estado vacio: es un grafico, no texto.
    const allowed = new Set([10, 11, 12, 13, 16, 20, 28, 32]);
    const outliers = [...new Set(literals)].filter((n) => !allowed.has(n));
    expect(outliers).toEqual([]);
  });

  it("ya no se usa texto de 9px", () => {
    expect(css).not.toMatch(/font-size:\s*9px/);
  });
});

describe("estructura de los temas", () => {
  it("el tema claro redefine color pero no medidas", () => {
    // Si el tema claro tocara tamaños o espaciados, los dos temas dejarian de
    // ser el mismo diseño con distinta piel.
    expect(LIGHT_BLOCK).not.toMatch(/--fs-|--sp-|--r-|--row-h|--header-h/);
  });

  it("el tema claro redefine todas las superficies y colores de texto", () => {
    for (const name of [...SURFACE_TOKENS, "--text", "--muted", "--border"]) {
      expect(readToken(LIGHT_BLOCK, name), `${name} sin redefinir en el tema claro`).not.toBeNull();
    }
  });
});
