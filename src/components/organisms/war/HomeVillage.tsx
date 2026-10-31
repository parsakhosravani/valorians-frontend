"use client";
import { useMemo } from "react";

import { TILE } from "./MapGround";

import { COMPACT_ZOOM, VillageBuilding, plateSize } from "@/components/organisms/tribe/VillageBuilding";
import { villagePlan } from "@/components/organisms/tribe/villagePlan";
import { useLive } from "@/context";
import { UpgradeOption, canStart, upgradeOptions } from "@/lib/game/advice";
import { BuildingDef } from "@/lib/game/config";
import { islandTerrain } from "@/lib/game/island";
import { Point } from "@/lib/game/map";

const T = TILE;

/** Zoomed in at least this far on the war map, your own tribe shows its buildings instead of its marker. */
export const VILLAGE_ZOOM = 1.3;

/**
 * Your village on the war map, zoomed in: every building on its plot inside
 * your wall, laid out exactly as the village is (see villagePlan), with its
 * level and, where there's room, its name; tap one to open it. Zoomed out the
 * map shows your tribe as a marker like everyone else's (see VILLAGE_ZOOM).
 *
 * Drawn on the camera's layer at your tile's centre (`at`, world px), so it
 * moves with the land; the plates keep one size on screen from the zoom the
 * camera last came to rest at (`zoom`).
 */
export const HomeVillage = ({
  home,
  at,
  neighbours,
  zoom,
  onOpen,
}: {
  home: Point;
  at: Point;
  neighbours: Point[];
  zoom: number;
  onOpen: (b: BuildingDef) => void;
}) => {
  const state = useLive((l) => l.state);
  const now = useLive((l) => l.now);
  const builders = useLive((l) => l.rates.builders);
  const options = useMemo(() => upgradeOptions(state), [state]);
  const freeBuilder = state.queue.length < builders;

  const ids = options.map((o) => o.building.id).sort().join(",");
  const near = neighbours.map((n) => `${n.x},${n.y}`).join(";");
  const plan = useMemo(
    () => villagePlan(home, ids.split(","), islandTerrain(home), neighbours),
    [home.x, home.y, ids, near], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const toPx = (id: string) => ({ x: plan.plots[id].x * T, y: plan.plots[id].y * T });

  const compact = zoom < COMPACT_ZOOM;
  // Names where they fit without covering another plate: the Town Hall first,
  // then work under way, upgrades ready, the highest levels. Every building
  // keeps its level medallion.
  const named = useMemo(() => {
    const out = new Set<string>();
    const ready = (o: UpgradeOption) => !o.job && freeBuilder && canStart(o);
    const weight = (o: UpgradeOption) =>
      (o.building.id === "town-hall" ? 0 : o.job ? 1 : ready(o) && o.level > 0 ? 2 : o.level > 0 ? 3 : 4) * 100 - o.level;
    const placed = options.filter((o) => plan.plots[o.building.id]);
    const box = (o: UpgradeOption, withName: boolean) => {
      const p = toPx(o.building.id);
      const { w, h } = plateSize(o.building.name, withName, compact);

      return { x0: p.x * zoom - w / 2 - 2, y0: (p.y + 1) * zoom - 1, x1: p.x * zoom + w / 2 + 2, y1: (p.y + 1) * zoom + h + 1 };
    };
    type Box = ReturnType<typeof box>;
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const bare = new Map(placed.map((o) => [o.building.id, box(o, false)]));
    const taken: Box[] = [];

    for (const o of [...placed].sort((a, b) => weight(a) - weight(b))) {
      const b = box(o, true);

      if (taken.some((t) => hit(t, b))) continue;
      if (Array.from(bare.entries()).some(([id, m]) => id !== o.building.id && !out.has(id) && hit(m, b))) continue;
      out.add(o.building.id);
      taken.push(b);
    }

    return out;
  }, [options, plan, zoom, compact, freeBuilder]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="absolute w-0 h-0 isolate"
      style={{ left: at.x, top: at.y, zIndex: 1, ["--vz" as string]: String(zoom) }}
    >
      {options.map((o) =>
        plan.plots[o.building.id] ? (
          <VillageBuilding
            key={o.building.id}
            at={toPx(o.building.id)}
            compact={compact}
            freeBuilder={freeBuilder}
            named={named.has(o.building.id)}
            now={now}
            o={o}
            onOpen={onOpen}
          />
        ) : null,
      )}
    </div>
  );
};
