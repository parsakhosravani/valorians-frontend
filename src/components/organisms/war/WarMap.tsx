"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import { AttackTarget } from "./SendArmyDrawer";
import { ArmyLine, fmt } from "./shared";

import { Button, Drawer, InfoDrawer } from "@/components";
import { BattleReport, ScoutReport, useGame, useTelegramContext } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { BUILDING_BY_ID, RESOURCE_NAMES, ResourceId, UNIT_BY_ID, UnitId, buildingImage } from "@/lib/game/config";
import { TERRAIN, Terrain, scoutCost, terrainAt } from "@/lib/game/map";
import type { Army } from "@/lib/game/engine";

// ─── Data from /api/war/map ──────────────────────────────────────────────────

type Tribe = {
  id: number;
  name: string;
  photoUrl: string | null;
  x: number;
  y: number;
  isMe: boolean;
  population: number;
  power: number;
  townHall: number;
  shieldUntil: number;
  terrain: Terrain;
  distance: number;
  defense: { min: number; max: number; exact: boolean } | null;
};

type Camp = {
  level: number;
  x: number;
  y: number;
  state: "locked" | "new" | "ready" | "cooldown";
  readyAt: number;
  defense: number;
  reward: { resources: number; coins: number; first: boolean };
  terrain: Terrain;
  distance: number;
};

type Movement = {
  id: number;
  kind: "outgoing" | "incoming";
  from: { x: number; y: number; name: string };
  to: { x: number; y: number; name: string };
  sentAt: number;
  arrivesAt: number;
  units: Army | null;
  campLevel: number | null;
};

export type MapData = {
  home: { x: number; y: number };
  center: { x: number; y: number };
  radius: number;
  tribes: Tribe[];
  camps: Camp[];
  movements: Movement[];
  myPower: number;
};

type Selected = { kind: "tribe"; tribe: Tribe } | { kind: "camp"; camp: Camp } | null;

type ReportItem = { attackId: number | null; report: BattleReport };

// ─── Drawing ─────────────────────────────────────────────────────────────────

const T = 46; // tile size in px

const TERRAIN_FILL: Record<Terrain, string[]> = {
  plains: ["#5E6B37", "#627039", "#5A6734"],
  forest: ["#34492A", "#36502B", "#314527"],
  hills: ["#7B6848", "#81704E", "#76633F"],
  lake: ["#2F5664", "#315A69", "#2D5260"],
};

const TERRAIN_ICON: Record<Terrain, string> = { plains: "🌾", forest: "🌲", hills: "⛰️", lake: "🌊" };

const Ground = ({ ox, oy, n }: { ox: number; oy: number; n: number }) => {
  const tiles = [];

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ox + i;
      const y = oy + j;
      const t = terrainAt(x, y);
      const v = ((x * 7 + y * 13) % 3 + 3) % 3;
      const px = i * T;
      const py = j * T;

      tiles.push(
        <g key={`${x},${y}`}>
          <rect fill={TERRAIN_FILL[t][v]} height={T} width={T} x={px} y={py} />
          {t === "forest" && (
            <g fill="#22361C" opacity="0.9">
              <polygon points={`${px + 12},${py + 30} ${px + 18},${py + 14} ${px + 24},${py + 30}`} />
              <polygon points={`${px + 24},${py + 38} ${px + 31},${py + 20} ${px + 38},${py + 38}`} />
            </g>
          )}
          {t === "hills" && (
            <path
              d={`M${px + 8} ${py + 32} l8 -10 l6 6 l8 -12 l10 16`}
              fill="none"
              opacity="0.7"
              stroke="#5A4A30"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          )}
          {t === "lake" && (
            <path
              d={`M${px + 8} ${py + 20} q5 -4 10 0 t10 0 M${px + 16} ${py + 30} q5 -4 10 0 t10 0`}
              fill="none"
              opacity="0.45"
              stroke="#BFE0E8"
              strokeWidth="1.5"
            />
          )}
        </g>
      );
    }
  }

  return <>{tiles}</>;
};

// ─── The map ─────────────────────────────────────────────────────────────────

export const WarMap = ({
  onAttack,
  onBattleDone,
  focusId,
}: {
  onAttack: (t: AttackTarget) => void;
  onBattleDone: (r: BattleReport) => void;
  focusId?: number;
}) => {
  const { state, rates, now, authHeader, recall, scout, refresh } = useGame();
  const { telegram } = useTelegramContext();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [scouts, setScouts] = useState<Record<number, ScoutReport>>({});
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const outgoing = useRef<Set<number>>(new Set());
  const centred = useRef(false);

  const load = useCallback(async () => {
    if (!authHeader) return;
    try {
      const d = await apiRequest<MapData>(authHeader, focusId ? `war/map?focus=${focusId}` : "war/map");
      const ids = new Set(d.movements.filter((m) => m.kind === "outgoing").map((m) => m.id));
      const finished = Array.from(outgoing.current).filter((id) => !ids.has(id));

      outgoing.current = ids;
      setData(d);
      setError(null);
      if (finished.length) {
        // A battle was fought: bring the tribe up to date and show the result.
        await refresh();
        const r = await apiRequest<{ reports: ReportItem[] }>(authHeader, "war/reports").catch(() => null);
        const hit = r?.reports.find((x) => x.attackId != null && finished.includes(x.attackId));

        if (hit) {
          telegram?.WebApp.HapticFeedback.notificationOccurred(hit.report.attackerWon ? "success" : "error");
          onBattleDone(hit.report);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authHeader, focusId, refresh, onBattleDone, telegram]);

  // Poll, and check again right after the next army arrives.
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);

    return () => clearInterval(t);
  }, [load]);
  const nextArrival = data?.movements.reduce((m, x) => Math.min(m, x.arrivesAt), Infinity) ?? Infinity;

  useEffect(() => {
    if (!Number.isFinite(nextArrival)) return;
    const wait = Math.max(500, nextArrival - Date.now() + 1500);
    const t = setTimeout(load, Math.min(wait, 2 ** 31 - 1));

    return () => clearTimeout(t);
  }, [nextArrival, load]);

  const n = data ? data.radius * 2 + 1 : 0;
  const ox = data ? data.center.x - data.radius : 0;
  const oy = data ? data.center.y - data.radius : 0;
  const px = (x: number) => (x - ox) * T + T / 2;
  const py = (y: number) => (y - oy) * T + T / 2;

  // Start centred on your tribe (or the one you came to take revenge on).
  useLayoutEffect(() => {
    const el = scroller.current;

    if (!data || !el || centred.current) return;
    const focus = (focusId && data.tribes.find((t) => t.id === focusId)) || data.home;

    el.scrollLeft = px(focus.x) - el.clientWidth / 2;
    el.scrollTop = py(focus.y) - el.clientHeight / 2;
    centred.current = true;
    if (focusId) {
      const t = data.tribes.find((x) => x.id === focusId);

      if (t) setSelected({ kind: "tribe", tribe: t });
    }
  }, [data]);

  const recentre = () => {
    const el = scroller.current;

    if (!data || !el) return;
    el.scrollTo({ left: px(data.home.x) - el.clientWidth / 2, top: py(data.home.y) - el.clientHeight / 2, behavior: "smooth" });
  };

  const strength = (p: number) => {
    const ratio = p / Math.max(1, data?.myPower ?? 1);

    return ratio < 0.75 ? "weaker" : ratio > 1.33 ? "stronger" : "even";
  };

  const returning = state.marches;
  const incoming = data?.movements.filter((m) => m.kind === "incoming") ?? [];
  const mine = data?.movements.filter((m) => m.kind === "outgoing") ?? [];

  const attackTribe = (t: Tribe) => {
    const s = scouts[t.id];

    setSelected(null);
    onAttack({
      title: `Raid ${t.name}`,
      to: { target: t.id },
      defense: s ? { min: s.defense / (1 + TERRAIN[t.terrain].defense), max: s.defense / (1 + TERRAIN[t.terrain].defense), exact: true } : t.defense!,
      distance: t.distance,
      terrain: t.terrain,
      note: state.shieldUntil > now ? "Attacking ends your own shield." : undefined,
    });
  };

  const attackCamp = (c: Camp) => {
    setSelected(null);
    onAttack({
      title: `Barbarian camp ${c.level}`,
      to: { camp: c.level },
      defense: { min: c.defense, max: c.defense, exact: true },
      distance: c.distance,
      terrain: c.terrain,
    });
  };

  const doScout = async (t: Tribe) => {
    setBusy(true);
    const r = await scout(t.id);

    setBusy(false);
    if (r) setScouts((m) => ({ ...m, [t.id]: r }));
  };

  const doRecall = async (id: number) => {
    if (await recall(id)) load();
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Armies on the move */}
      {(incoming.length > 0 || mine.length > 0 || returning.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {incoming.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#2A140E] border border-[#8A3B23] text-sm">
              <span className="text-lg animate-pulse">🔥</span>
              <span className="flex-1 min-w-0">
                <b>{m.from.name}</b> is marching on you
                <span className="block text-xs text-[#FFB27A]">
                  {m.units ? <ArmyLine army={m.units} /> : "Build a Watchtower to see their army"}
                </span>
              </span>
              <span className="font-display font-black text-[#FFB27A] shrink-0">{formatDuration(m.arrivesAt - now)}</span>
            </div>
          ))}
          {mine.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-panel border border-gold/60 text-sm">
              <span className="text-lg">⚔️</span>
              <span className="flex-1 min-w-0 truncate">
                To <b>{m.to.name}</b>
                <span className="block text-xs text-muted truncate">{m.units && <ArmyLine army={m.units} />}</span>
              </span>
              <span className="font-display font-black text-goldtext shrink-0">{formatDuration(m.arrivesAt - now)}</span>
              <button className="shrink-0 h-8 px-2.5 rounded-lg bg-panel2 border border-line text-xs font-bold" onClick={() => doRecall(m.id)}>
                Recall
              </button>
            </div>
          ))}
          {returning.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-panel border border-line text-sm">
              <span className="text-lg">↩️</span>
              <span className="flex-1 min-w-0 truncate">
                Back from <b>{m.target}</b>
                <span className="block text-xs text-muted truncate">
                  <ArmyLine army={m.units} />
                </span>
              </span>
              <span className="font-display font-black text-sub shrink-0">{formatDuration(m.returnsAt - now)}</span>
            </div>
          ))}
        </div>
      )}

      {/* The map */}
      <div className="relative rounded-2xl overflow-hidden border border-line h-[min(62svh,520px)] bg-[#1B2416]">
        {!data && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Unrolling the map…</p>}
        {error && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[#F08A6C]">
            {error}
            <Button size="small" variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        )}
        {data && (
          <div ref={scroller} className="absolute inset-0 overflow-auto scrollable overscroll-contain">
            <div className="relative" style={{ width: n * T, height: n * T }}>
              <svg aria-hidden="true" className="absolute inset-0" height={n * T} width={n * T}>
                <Ground n={n} ox={ox} oy={oy} />
                {/* Faint grid so distances read */}
                <g opacity="0.12" stroke="#000">
                  {Array.from({ length: n + 1 }, (_, i) => (
                    <g key={i}>
                      <line x1={i * T} x2={i * T} y1={0} y2={n * T} />
                      <line x1={0} x2={n * T} y1={i * T} y2={i * T} />
                    </g>
                  ))}
                </g>
                {/* Marches */}
                {data.movements.map((m) => {
                  const p = Math.min(1, Math.max(0, (now - m.sentAt) / (m.arrivesAt - m.sentAt)));
                  const x = px(m.from.x) + (px(m.to.x) - px(m.from.x)) * p;
                  const y = py(m.from.y) + (py(m.to.y) - py(m.from.y)) * p;
                  const c = m.kind === "incoming" ? "#F06A44" : "#F2C66D";

                  return (
                    <g key={m.id}>
                      <line stroke={c} strokeDasharray="6 6" strokeLinecap="round" strokeWidth="3" x1={px(m.from.x)} x2={px(m.to.x)} y1={py(m.from.y)} y2={py(m.to.y)} />
                      <circle cx={x} cy={y} fill={c} r="7" stroke="#1A120B" strokeWidth="2" />
                    </g>
                  );
                })}
                {returning
                  .filter((m) => m.from && data)
                  .map((m) => (
                    <line
                      key={m.id}
                      opacity="0.6"
                      stroke="#D8C9AE"
                      strokeDasharray="2 6"
                      strokeLinecap="round"
                      strokeWidth="3"
                      x1={px(m.from!.x)}
                      x2={px(data.home.x)}
                      y1={py(m.from!.y)}
                      y2={py(data.home.y)}
                    />
                  ))}
              </svg>

              {/* Barbarian camps */}
              {data.camps.map((c) => (
                <button
                  key={`c${c.level}`}
                  aria-label={`Barbarian camp ${c.level}`}
                  className={clsx("absolute flex flex-col items-center", c.state === "locked" && "opacity-45 grayscale")}
                  style={{ left: px(c.x) - 24, top: py(c.y) - 26, width: 48 }}
                  onClick={() => setSelected({ kind: "camp", camp: c })}
                >
                  <Image alt="" className="w-11 h-11 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]" height={88} src={buildingImage(BUILDING_BY_ID["barracks"])} width={88} />
                  <span
                    className={clsx(
                      "-mt-1.5 px-1.5 rounded-full text-[10px] font-black border",
                      c.state === "new" ? "bg-ember text-[#FFF4EA] border-[#FFD2B0]" : c.state === "ready" ? "bg-good text-[#1A120B] border-[#E6F5D9]" : "bg-panel text-sub border-line"
                    )}
                  >
                    {c.state === "locked" ? "🔒" : c.state === "cooldown" ? formatDuration(c.readyAt - now) : `Camp ${c.level}`}
                  </span>
                </button>
              ))}

              {/* Tribes */}
              {data.tribes.map((t) => {
                const shielded = t.shieldUntil > now;
                const s = strength(t.power);

                return (
                  <button
                    key={t.id}
                    aria-label={t.isMe ? "Your tribe" : t.name}
                    className="absolute flex flex-col items-center"
                    style={{ left: px(t.x) - 32, top: py(t.y) - 34, width: 64, zIndex: t.isMe ? 3 : 2 }}
                    onClick={() => setSelected({ kind: "tribe", tribe: t })}
                  >
                    <span
                      className={clsx(
                        "relative w-12 h-12 rounded-full flex items-center justify-center border-[3px] bg-[#1E1610]/70",
                        t.isMe ? "border-gold shadow-[0_0_16px_rgba(227,169,72,0.8)]" : s === "weaker" ? "border-good" : s === "stronger" ? "border-[#F08A6C]" : "border-[#E3A948]/70"
                      )}
                    >
                      <Image alt="" className="w-10 h-10 object-contain" height={80} src={buildingImage(BUILDING_BY_ID["town-hall"])} width={80} />
                      {shielded && !t.isMe && <span className="absolute -top-1 -right-1 text-sm">🛡️</span>}
                      <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-[#1A120B] text-[10px] font-black flex items-center justify-center">
                        {t.townHall}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        "mt-0.5 max-w-[84px] truncate px-1.5 rounded-full text-[10px] font-extrabold",
                        t.isMe ? "bg-gold text-[#1A120B]" : "bg-[#1E1610]/90 text-parch border border-line"
                      )}
                    >
                      {t.isMe ? "You" : t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {data && (
          <div className="absolute right-2 bottom-2 flex flex-col gap-1.5 z-10">
            <button aria-label="Back to my tribe" className="w-11 h-11 rounded-xl bg-panel/95 border border-line text-lg shadow-lg" onClick={recentre}>
              🏠
            </button>
          </div>
        )}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 bg-panel/90 border border-line rounded-xl px-2 py-1">
          <span className="text-[11px] font-bold text-sub">
            <span className="text-good">●</span> weaker <span className="text-[#E3A948]">●</span> even <span className="text-[#F08A6C]">●</span> stronger
          </span>
          <InfoDrawer
            content={
              <span className="flex flex-col gap-1.5 text-left text-sm">
                <span>Armies march across the map; farther targets take longer. An army moves at the speed of its slowest unit (cavalry fastest, rams slowest). The battle happens when it arrives.</span>
                <span>⛰️ Hills give the defender +20% defense, 🌲 forests +10%, and cavalry fights 25% weaker in forests.</span>
                <span>🛡️ Spearmen defend 50% better against cavalry. Mix your army to match the target.</span>
                <span>🔭 With an Exploration Center you can scout a tribe for coins: exact defense, troops at home and what you could loot.</span>
                <span>🗼 A Watchtower shows you which troops are marching on you, so you can train defenders in time.</span>
                <span>You can recall an army before it arrives. Raided tribes get a 2h shield.</span>
              </span>
            }
            title="War on the map"
          />
        </div>
      </div>

      {/* What's on the tile you tapped */}
      <Drawer isOpen={!!selected} position="bottom" title={selected?.kind === "camp" ? `Barbarian camp ${selected.camp.level}` : selected?.kind === "tribe" ? (selected.tribe.isMe ? "Your tribe" : selected.tribe.name) : ""} onClose={() => setSelected(null)}>
        {selected?.kind === "tribe" && (() => {
          const t = selected.tribe;
          const sc = scouts[t.id];
          const shielded = t.shieldUntil > now;
          const s = strength(t.power);
          const ground = TERRAIN[t.terrain];

          return (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">
                  {TERRAIN_ICON[t.terrain]} {ground.name}
                  {ground.defense > 0 && ` · +${ground.defense * 100}% defense`}
                </span>
                {!t.isMe && <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">📍 {t.distance} tiles</span>}
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">🏛 Town Hall {t.townHall}</span>
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">👥 {fmt(t.population)}</span>
                <span
                  className={clsx(
                    "px-2 py-1 rounded-lg border",
                    t.isMe ? "bg-panel2 border-line" : s === "weaker" ? "bg-[#1C2A14] border-good text-good" : s === "stronger" ? "bg-[#2A140E] border-[#8A3B23] text-[#F08A6C]" : "bg-panel2 border-gold text-goldtext"
                  )}
                >
                  💪 {fmt(t.power)} {t.isMe ? "" : s === "weaker" ? "· weaker than you" : s === "stronger" ? "· stronger than you" : "· about even"}
                </span>
              </div>
              {t.isMe ? (
                <p className="text-sm text-sub">
                  Your home on {ground.name.toLowerCase()}. {ground.note} {incoming.length ? `${incoming.length} army marching on you.` : "No enemies on the way."}
                </p>
              ) : (
                <>
                  {sc ? (
                    <div className="bg-[#1E1610] rounded-xl p-2.5 flex flex-col gap-1.5 text-sm">
                      <div className="text-[10px] font-extrabold tracking-[0.12em] text-muted">SCOUT REPORT · {formatDuration(now - sc.at)} AGO</div>
                      <div>
                        🛡️ Defense <b>{fmt(sc.defense)}</b> <span className="text-muted text-xs">(terrain included)</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <span className="text-muted">Home:</span>
                        {(Object.keys(sc.troops) as UnitId[]).map((u) => (
                          <span key={u}>
                            {UNIT_BY_ID[u].icon} {fmt(sc.troops[u])}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <span className="text-muted">Lootable:</span>
                        {(Object.keys(sc.loot) as ResourceId[]).map((r) => (
                          <span key={r}>
                            {fmt(sc.loot[r])} {RESOURCE_NAMES[r].toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    t.defense && (
                      <p className="text-sm text-sub">
                        🛡️ Defense about <b>{t.defense.exact ? fmt(t.defense.min * (1 + ground.defense)) : `${fmt(t.defense.min * (1 + ground.defense))}–${fmt(t.defense.max * (1 + ground.defense))}`}</b>
                        {!t.defense.exact && " (a guess — scout to know)"}
                      </p>
                    )
                  )}
                  {shielded && <p className="text-sm font-bold text-[#E3A948]">🛡️ Shielded for {formatDuration(t.shieldUntil - now)}. You can't attack until it ends.</p>}
                  <div className="flex gap-2">
                    {rates.canScout ? (
                      <Button className="flex-1" disabled={busy} variant="outline" onClick={() => doScout(t)}>
                        🔭 Scout · {fmt(scoutCost(t.distance))} coins
                      </Button>
                    ) : (
                      <p className="flex-1 text-xs text-muted self-center">Build an Exploration Center to scout.</p>
                    )}
                    <Button className="flex-1" disabled={shielded} onClick={() => attackTribe(t)}>
                      ⚔️ Attack
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {selected?.kind === "camp" && (() => {
          const c = selected.camp;
          const ground = TERRAIN[c.terrain];
          const busyCamp = mine.some((m) => m.campLevel === c.level);

          return (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">
                  {TERRAIN_ICON[c.terrain]} {ground.name}
                  {ground.defense > 0 && ` · +${ground.defense * 100}% defense`}
                </span>
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">📍 {c.distance} tiles</span>
                <span className="px-2 py-1 rounded-lg bg-panel2 border border-line">🛡️ {fmt(c.defense * (1 + ground.defense))}</span>
              </div>
              <p className="text-sm text-sub">
                🎁 {fmt(c.reward.resources)} of each resource + 🪙 {fmt(c.reward.coins)}
                {c.reward.first ? " for the first win" : " (beaten camps give a smaller haul every hour)"}.
              </p>
              {c.state === "locked" ? (
                <p className="text-sm font-bold text-muted">🔒 Beat camp {c.level - 1} first.</p>
              ) : c.state === "cooldown" ? (
                <p className="text-sm font-bold text-muted">The barbarians regroup in {formatDuration(c.readyAt - now)}.</p>
              ) : busyCamp ? (
                <p className="text-sm font-bold text-goldtext">Your army is already on its way.</p>
              ) : (
                <Button isFull onClick={() => attackCamp(c)}>
                  ⚔️ Attack camp {c.level}
                </Button>
              )}
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
};
