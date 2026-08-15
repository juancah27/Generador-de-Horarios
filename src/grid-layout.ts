import { BASE_HOUR_RANGE } from "./constants";
import type { ScheduleParams, SectionData } from "./types";

export interface GridBlock {
  course: string;
  sec: SectionData;
  color: string;
  isBad: boolean;
  cls: { tipo: string; inicio: number; fin: number };
  /** Carril horizontal dentro del grupo de clases que se solapan ese dia. */
  lane: number;
  /** Cantidad de carriles del grupo; define el ancho del bloque. */
  lanes: number;
}

/** Rango de horas a dibujar: nunca deja fuera un limite de params ni una clase elegida. */
export function visibleHours(params: ScheduleParams, selected: Record<string, SectionData>): number[] {
  let from = Math.min(BASE_HOUR_RANGE.from, params.minHour);
  let to = Math.max(BASE_HOUR_RANGE.to, params.maxHour);

  for (const sec of Object.values(selected)) {
    for (const cls of sec.clases) {
      from = Math.min(from, Math.floor(cls.inicio));
      to = Math.max(to, Math.ceil(cls.fin));
    }
  }

  // `to` inclusive: deja una fila de cierre debajo de la ultima clase posible.
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
}

/**
 * Agrupa las clases por dia y les asigna carriles.
 * Dos clases que se pisan van lado a lado aunque empiecen a horas distintas;
 * la version anterior solo separaba las que arrancaban exactamente igual.
 *
 * La clave del resultado es `${dia}-${horaDeInicio}`, la celda donde se ancla el bloque.
 */
export function layoutBlocks(
  selected: Record<string, SectionData>,
  colorMap: Record<string, string>,
  bad: Set<string>,
): Record<string, GridBlock[]> {
  type Item = { course: string; sec: SectionData; cls: GridBlock["cls"] };
  const byDay: Record<string, Item[]> = {};

  for (const [course, sec] of Object.entries(selected)) {
    for (const cls of sec.clases) {
      const day = String(cls.dia).trim();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({ course, sec, cls: { tipo: cls.tipo, inicio: cls.inicio, fin: cls.fin } });
    }
  }

  const out: Record<string, GridBlock[]> = {};

  for (const [day, items] of Object.entries(byDay)) {
    items.sort((a, b) => a.cls.inicio - b.cls.inicio || a.cls.fin - b.cls.fin);

    let cluster: Item[] = [];
    let clusterEnd = -Infinity;

    const flushCluster = (): void => {
      if (!cluster.length) return;
      const laneEnds: number[] = [];
      const laneOf: number[] = [];

      for (const item of cluster) {
        let lane = laneEnds.findIndex((end) => end <= item.cls.inicio);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(0);
        }
        laneEnds[lane] = item.cls.fin;
        laneOf.push(lane);
      }

      cluster.forEach((item, i) => {
        const key = `${day}-${Math.floor(item.cls.inicio)}`;
        if (!out[key]) out[key] = [];
        out[key].push({
          course: item.course,
          sec: item.sec,
          cls: item.cls,
          color: colorMap[item.course] ?? "color-0",
          isBad: bad.has(item.course),
          lane: laneOf[i],
          lanes: laneEnds.length,
        });
      });

      cluster = [];
    };

    for (const item of items) {
      // Un hueco sin solapamiento cierra el grupo: los carriles vuelven a empezar.
      if (item.cls.inicio >= clusterEnd) {
        flushCluster();
        clusterEnd = item.cls.fin;
      } else {
        clusterEnd = Math.max(clusterEnd, item.cls.fin);
      }
      cluster.push(item);
    }
    flushCluster();
  }

  return out;
}
