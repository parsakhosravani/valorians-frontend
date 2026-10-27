"use client";
import clsx from "clsx";

import { ArmyLine } from "./shared";

import { Drawer } from "@/components";
import { formatDuration } from "@/lib/format";
import { UNITS } from "@/lib/game/config";
import type { BattleRound } from "@/lib/game/battle";
import type { Army } from "@/lib/game/engine";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";

/** A battle under way, as /api/war/map sends it: only the rounds fought so far. */
export type LiveBattleData = {
  startedAt: number;
  endsAt: number;
  totalRounds: number;
  rounds: BattleRound[];
  nextRoundAt: number | null;
  /** The defenders on the field (none at a barbarian camp). */
  defenders: Army | null;
};

export type BattleMovement = {
  id: number;
  kind: "outgoing" | "incoming";
  from: { x: number; y: number; name: string };
  to: { x: number; y: number; name: string };
  units: Army | null;
  campLevel: number | null;
  battle: LiveBattleData;
};

const EMPTY = Object.fromEntries(UNITS.map((u) => [u.id, 0])) as Army;

/** `a − b` for the troops that fight (ships wait offshore). */
const minus = (a: Army | null, b: Army | null) => {
  const out = { ...EMPTY };

  for (const u of UNITS) {
    if (!u.transport) out[u.id] = Math.max(0, (a?.[u.id] ?? 0) - (b?.[u.id] ?? 0));
  }

  return out;
};

const lastRound = (b: LiveBattleData) => b.rounds[b.rounds.length - 1] ?? null;

/** Who's who, from the viewer's side. */
const sides = (m: BattleMovement) => ({
  attacker: m.kind === "outgoing" ? "Your army" : m.from.name,
  defender: m.kind === "incoming" ? "Your troops" : m.campLevel ? "Barbarians" : m.to.name,
});

/** The clash on the map, where the armies met: crossed swords, the round and the time left. */
export const BattleToken = ({
  at,
  m,
  now,
  onClick,
}: {
  at: { x: number; y: number };
  m: BattleMovement;
  now: number;
  onClick: () => void;
}) => {
  const b = m.battle;
  const incoming = m.kind === "incoming";
  const done = Math.min(1, Math.max(0, (now - b.startedAt) / Math.max(1, b.endsAt - b.startedAt)));

  return (
    <button
      aria-label={`Battle at ${m.to.name}`}
      className="map-pin absolute flex flex-col items-center"
      style={{ left: at.x, top: at.y, transform: "translate(-50%, -62%)", zIndex: 6 }}
      onClick={onClick}
    >
      <span className="relative flex items-center justify-center">
        <span className="absolute -inset-1.5 rounded-full bg-[#F06A44]/40 animate-ping" />
        {/* Ring fills as the battle goes on. */}
        <svg className="absolute -inset-1 -rotate-90" height={52} viewBox="0 0 52 52" width={52}>
          <circle cx="26" cy="26" fill="none" r="23" stroke="#1A120B" strokeOpacity="0.6" strokeWidth="4" />
          <circle
            cx="26"
            cy="26"
            fill="none"
            r="23"
            stroke={incoming ? "#F06A44" : "#F2C66D"}
            strokeDasharray={`${(2 * Math.PI * 23 * done).toFixed(1)} 999`}
            strokeLinecap="round"
            strokeWidth="4"
          />
        </svg>
        <span
          className={clsx(
            "relative w-11 h-11 rounded-full flex items-center justify-center text-xl border-[3px] shadow-[0_3px_8px_rgba(0,0,0,0.7)]",
            incoming
              ? "bg-gradient-to-b from-[#5A1E12] to-[#2A140E] border-[#F06A44]"
              : "bg-gradient-to-b from-[#4A2A16] to-[#1E1610] border-gold",
          )}
        >
          <span className="animate-clash"><GameIcon e="⚔️" /></span>
        </span>
      </span>
      <span
        className={clsx(
          "mt-1.5 px-1.5 rounded-full text-[9px] font-black whitespace-nowrap border",
          incoming ? "bg-[#2A140E] text-[#FFB27A] border-[#8A3B23]" : "bg-panel/95 text-goldtext border-line",
        )}
      >
        Round {Math.min(b.totalRounds, b.rounds.length + 1)}/{b.totalRounds} · {formatDuration(b.endsAt - now)}
      </span>
    </button>
  );
};

/** A row in the "armies on the move" list for a battle being fought. */
export const BattleRow = ({ m, now, onWatch }: { m: BattleMovement; now: number; onWatch: () => void }) => {
  const b = m.battle;
  const incoming = m.kind === "incoming";

  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm border",
        incoming ? "bg-[#2A140E] border-[#8A3B23]" : "bg-panel border-gold/60",
      )}
    >
      <span className="text-lg animate-clash"><GameIcon e="⚔️" /></span>
      <span className="flex-1 min-w-0 truncate">
        {incoming ? (
          <>
            Battle at your walls vs <b>{m.from.name}</b>
          </>
        ) : (
          <>
            Battle at <b>{m.to.name}</b>
          </>
        )}
        <span className={clsx("block text-xs", incoming ? "text-[#FFB27A]" : "text-muted")}>
          Round {Math.min(b.totalRounds, b.rounds.length + 1)} of {b.totalRounds}
        </span>
      </span>
      <span className={clsx("font-display font-black shrink-0", incoming ? "text-[#FFB27A]" : "text-goldtext")}>
        {formatDuration(b.endsAt - now)}
      </span>
      <button
        className="btn btn-wood btn-sm shrink-0 font-sans font-extrabold text-xs"
        onClick={onWatch}
      >
        Watch
      </button>
    </div>
  );
};

const StrengthBar = ({ label, left, color }: { label: string; left: number; color: string }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex justify-between text-xs">
      <span className="font-bold truncate"><IconText text={label} /></span>
      <span className="text-muted tabular-nums">{Math.round(left * 100)}%</span>
    </div>
    <div className="h-2.5 rounded-full bg-ground overflow-hidden border border-line">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${left * 100}%`, background: color }}
      />
    </div>
  </div>
);

/** Watching a battle live: strength left on each side, troops standing, and how each round went. */
export const LiveBattleDrawer = ({
  m,
  now,
  onClose,
}: {
  m: BattleMovement | null;
  now: number;
  onClose: () => void;
}) => {
  const b = m?.battle;
  const last = b ? lastRound(b) : null;
  const names = m ? sides(m) : null;
  const done = b ? Math.min(1, Math.max(0, (now - b.startedAt) / Math.max(1, b.endsAt - b.startedAt))) : 0;
  const waitNext = b?.nextRoundAt != null ? b.nextRoundAt - now : null;

  return (
    <Drawer isOpen={!!m} position="bottom" title={m ? `Battle at ${m.kind === "incoming" ? "your walls" : m.to.name}` : ""} onClose={onClose}>
      {m && b && names && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <div className="text-4xl animate-clash inline-block"><GameIcon e="⚔️" /></div>
            <div className="text-sm text-muted">
              {names.attacker} attacking {names.defender === "Your troops" ? "you" : names.defender}
            </div>
          </div>

          {/* Time */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-bold">
              <span>
                Round {Math.min(b.totalRounds, b.rounds.length + 1)} of {b.totalRounds}
              </span>
              <span className="text-goldtext">Result in {formatDuration(b.endsAt - now)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-ground overflow-hidden">
              <div className="h-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${done * 100}%` }} />
            </div>
          </div>

          {/* Strength */}
          <div className="inset p-2.5 flex flex-col gap-2">
            <StrengthBar color="#F2C66D" label={`⚔️ ${names.attacker}`} left={last?.attackLeft ?? 1} />
            <StrengthBar color="#F06A44" label={`🛡️ ${names.defender}`} left={last?.defenseLeft ?? 1} />
          </div>

          {/* Troops still standing */}
          <div className="text-sm flex flex-col gap-1">
            <div>
              <span className="text-muted">{names.attacker} standing: </span>
              <ArmyLine army={minus(m.units, last?.attackerFallen ?? null)} />
            </div>
            <div>
              <span className="text-muted">{names.defender} standing: </span>
              {b.defenders ? (
                <ArmyLine army={minus(b.defenders, last?.defenderFallen ?? null)} />
              ) : m.campLevel ? (
                <span>a barbarian war band</span>
              ) : (
                <span>the town militia</span>
              )}
            </div>
          </div>

          {/* Round by round, newest first */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-extrabold tracking-[0.12em] text-muted">BATTLE LOG</div>
            {waitNext != null && (
              <div className="text-xs text-sub italic">
                {b.rounds.length ? "Next" : "First"} round ends in {formatDuration(waitNext)}…
              </div>
            )}
            {[...b.rounds].reverse().map((r) => {
              const prev = b.rounds[r.n - 2] ?? null;

              return (
                <div key={r.n} className="inset rounded-lg px-2.5 py-1.5 text-xs flex flex-col gap-0.5">
                  <span className="font-bold text-goldtext">Round {r.n}</span>
                  <span>
                    <span className="text-muted">{names.attacker} lost </span>
                    <ArmyLine army={minus(r.attackerFallen, prev?.attackerFallen ?? null)} />
                  </span>
                  {b.defenders && (
                    <span>
                      <span className="text-muted">{names.defender} lost </span>
                      <ArmyLine army={minus(r.defenderFallen, prev?.defenderFallen ?? null)} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted text-center">
            The fight can&apos;t be stopped once the armies meet. Wounded troops are counted as fallen until the
            healers see to them.
          </p>
        </div>
      )}
    </Drawer>
  );
};
