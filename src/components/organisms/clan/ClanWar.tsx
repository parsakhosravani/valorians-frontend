"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { Card, UnitBadge, fmt } from "@/components/organisms/war/shared";
import { Button } from "@/components/atoms/Button";
import { Bar } from "@/components/atoms/Ui";
import { Drawer } from "@/components/molecules/Drawer";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";
import { useGame, useGameActions } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { CLAN_WAR, UNITS } from "@/lib/game/config";
import { Army, emptyArmy, ownArmy } from "@/lib/game/engine";
import { GOAL_TEXT, RELATION_TEXT, RelationKind } from "@/lib/game/clanWar";
import type { ClanWarView } from "@/server/clanWar";

const inputCls = "inset w-full h-10 px-3 text-sm font-bold text-parch placeholder:text-muted/70 outline-none focus:border-gold";

const Title = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <h2 className="title-section flex-1">{children}</h2>
    {right}
  </div>
);

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Troops that can stand guard: your own at home, no dragon (it never leaves its Roost to guard), no ships. */
const guardable = UNITS.filter((u) => !u.maxOwned && !u.transport);

/** Sends troops to guard a clanmate's village. */
export const GuardDrawer = ({ host, onClose }: { host: { id: number; name: string } | null; onClose: () => void }) => {
  const { state, clan } = useGame();
  const own = ownArmy(state);
  const [units, setUnits] = useState<Army>(emptyArmy());
  const [busy, setBusy] = useState(false);
  const home = guardable.filter((u) => own[u.id] > 0);
  const size = home.reduce((n, u) => n + units[u.id], 0);
  const out = (state.abroad ?? []).length;

  const setOne = (id: keyof Army, n: number) => setUnits((a) => ({ ...a, [id]: Math.max(0, Math.min(own[id], Math.floor(n || 0))) }));

  return (
    <Drawer isOpen={!!host} position="bottom" title={host ? `Guard ${host.name}` : "Guard"} onClose={onClose}>
      {host && (
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-sub">
            Your troops stand guard in {host.name}&apos;s village and fight in its battles, under its walls and banner. Their village
            feeds them. They still count in your power, and you can call them home any time (not mid-battle).
          </p>
          {out >= CLAN_WAR.maxSupportsOut && (
            <p className="text-xs text-bad">You already have {out} guard groups out. Call one home first.</p>
          )}
          {home.length === 0 && <Card className="text-center text-sm text-sub">No troops of your own at home.</Card>}
          {home.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 px-2.5 py-2">
              <UnitBadge size={30} unit={u.id} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-sm font-bold truncate">{u.name}</div>
                <div className="text-[10px] text-muted">{fmt(own[u.id])} at home · 🛡️ {u.defense}</div>
              </div>
              <div className="flex gap-1">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    className="btn btn-wood h-7 px-2 rounded-lg text-[11px] font-extrabold"
                    type="button"
                    onClick={() => setOne(u.id, Math.round(own[u.id] * f))}
                  >
                    {f === 1 ? "All" : f === 0.5 ? "½" : "¼"}
                  </button>
                ))}
              </div>
              <input
                aria-label={`${u.name} to send`}
                className="inset w-14 h-7 rounded-lg text-center text-sm font-extrabold tabular-nums outline-none focus:border-gold"
                inputMode="numeric"
                placeholder="0"
                value={units[u.id] || ""}
                onChange={(e) => setOne(u.id, Number(e.target.value.replace(/\D/g, "")))}
              />
            </div>
          ))}
          <Button
            isFull
            disabled={busy || size === 0 || out >= CLAN_WAR.maxSupportsOut}
            size="large"
            onClick={async () => {
              setBusy(true);
              const ok = await clan.guard(host.id, units);

              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy ? "Marching…" : size ? <IconText text={`🛡️ Send ${fmt(size)} guards`} /> : "Choose troops"}
          </Button>
        </div>
      )}
    </Drawer>
  );
};

/**
 * The clan's War tab: members under attack (send guards), guard duties,
 * clan strikes, treaties and wars, and the weekly goal.
 */
export const ClanWar = ({
  officer,
  clanId,
  members,
  helpId,
}: {
  officer: boolean;
  clanId: number;
  members: { id: number; name: string }[];
  /** Opened from an attack alert: the guard sheet for this member, straight away. */
  helpId?: number | null;
}) => {
  const { authHeader, me, state, now, clan } = useGame();
  const [view, setView] = useState<ClanWarView | null>(null);
  const [guarding, setGuarding] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [otherTag, setOtherTag] = useState("");

  const load = useCallback(async () => {
    if (!authHeader) return;
    try {
      const r = await apiRequest<{ war: ClanWarView | null }>(authHeader, "clan/war");

      setView(r.war);
    } catch {
      // Offline: keep what we had.
    }
  }, [authHeader]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);

    return () => clearInterval(t);
  }, [load, clanId]);

  useEffect(() => {
    const m = helpId ? members.find((x) => x.id === helpId) : null;

    if (m && m.id !== me.id) setGuarding(m);
  }, [helpId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    await fn();
    setBusy(null);
    await load();
  };

  const goal = view?.week.goal;
  const goalText = goal ? GOAL_TEXT[goal.kind] : null;
  const mineOut = state.abroad ?? [];
  const guests = state.guests ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Under attack */}
      <Title>Under attack</Title>
      {view && view.threats.length === 0 && <Card className="text-center text-sm text-sub">No clanmate is under attack. All quiet.</Card>}
      {view?.threats.map((t) => (
        <Card key={t.id} className="flex items-center gap-2 !py-2 border-bad/50">
          <span className="text-xl"><GameIcon e={t.fighting ? "⚔️" : "🚨"} /></span>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-sm font-bold truncate">
              {t.defenderId === me.id ? "You" : t.defender} ← {t.attacker}
            </div>
            <div className="text-[11px] text-sub">{t.fighting ? "Fighting now" : `Lands in ${formatDuration(t.arrivesAt - now)}`}</div>
          </div>
          {t.defenderId !== me.id && (
            <Button size="small" onClick={() => setGuarding({ id: t.defenderId, name: t.defender })}>
              <IconText text="🛡️ Send help" />
            </Button>
          )}
        </Card>
      ))}

      {/* Weekly goal */}
      {goal && goalText && (
        <>
          <Title right={<span className="text-xs font-bold text-muted">Ends in {formatDuration(goal.endsAt - now)}</span>}>Weekly goal</Title>
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-parch">
                <GameIcon e={goalText.icon} /> {goalText.title}
              </span>
              <span className="text-xs font-extrabold text-goldtext">{goal.paid ? "✓ Done" : `+${fmt(goal.coins)} each`}</span>
            </div>
            <Bar max={goal.target} value={Math.min(goal.done, goal.target)} />
            <span className="text-xs text-sub">
              {compact(goal.done)} / {compact(goal.target)} {goalText.unit} · the whole clan together
            </span>
            {view!.week.board.length > 0 && (
              <div className="flex flex-col gap-1 pt-1">
                <span className="label">This week</span>
                {view!.week.board.slice(0, 10).map((b, i) => (
                  <span key={b.id} className={clsx("flex justify-between text-sm", b.id === me.id && "text-goldtext")}>
                    <span>
                      {i + 1}. {b.name}
                    </span>
                    <span className="text-xs font-bold text-sub">
                      ⚔️ {b.wins} · 🏕️ {b.camps} · 💰 {compact(b.donated)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Guards */}
      <Title right={<span className="text-xs font-bold text-muted">Tap a member to guard them</span>}>Guards</Title>
      <div className="flex flex-wrap gap-1.5">
        {members
          .filter((m) => m.id !== me.id)
          .map((m) => (
            <button
              key={m.id}
              className="pill h-8 px-2.5 text-xs font-bold active:scale-95 transition-transform"
              type="button"
              onClick={() => setGuarding(m)}
            >
              🛡️ {m.name}
            </button>
          ))}
      </div>
      {mineOut.map((a) => (
        <Card key={a.id} className="flex items-center gap-2 !py-2">
          <span className="text-xl"><GameIcon e="🛡️" /></span>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-sm font-bold truncate">Your guards at {a.hostName}</div>
            <div className="text-[11px] text-sub">
              {fmt(UNITS.reduce((n, u) => n + (a.units[u.id] ?? 0), 0))} troops ·{" "}
              {a.status === "marching" ? `arrive in ${formatDuration(a.arrivesAt - now)}` : "on guard"}
            </div>
          </div>
          <Button disabled={busy != null} size="small" variant="secondary" onClick={() => run(`home-${a.id}`, () => clan.endGuard(a.id, true))}>
            {busy === `home-${a.id}` ? "…" : "Call home"}
          </Button>
        </Card>
      ))}
      {guests.map((g) => (
        <Card key={g.id} className="flex items-center gap-2 !py-2">
          <span className="text-xl"><GameIcon e="🏰" /></span>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-sm font-bold truncate">{g.ownerName}&apos;s guards in your village</div>
            <div className="text-[11px] text-sub">
              {fmt(UNITS.reduce((n, u) => n + (g.units[u.id] ?? 0), 0))} troops · they eat your crop
            </div>
          </div>
          <Button disabled={busy != null} size="small" variant="outline" onClick={() => run(`away-${g.id}`, () => clan.endGuard(g.id, false))}>
            {busy === `away-${g.id}` ? "…" : "Send home"}
          </Button>
        </Card>
      ))}
      {view && view.guards.filter((g) => g.ownerId !== me.id && g.hostId !== me.id).length > 0 && (
        <Card className="flex flex-col gap-1">
          <span className="label">Across the clan</span>
          {view.guards
            .filter((g) => g.ownerId !== me.id && g.hostId !== me.id)
            .map((g) => (
              <span key={g.id} className="text-xs text-sub">
                🛡️ {g.owner} → {g.host}: {fmt(g.troops)} troops{g.status === "marching" ? " (on the way)" : ""}
              </span>
            ))}
        </Card>
      )}

      {/* Strikes */}
      <Title>Clan strikes</Title>
      {view && view.rallies.length === 0 && (
        <Card className="text-center text-xs text-sub">
          No strike called. {officer ? "Call one from a tribe's card on the War map: every army lands at the same moment." : "Your Jarl and Huscarls call them from the War map."}
        </Card>
      )}
      {view?.rallies.map((r) => {
        const landed = r.landAt <= now;

        return (
          <Card key={r.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-parch truncate">
                <GameIcon e="📯" /> {r.target}
              </span>
              <span className={clsx("text-xs font-extrabold", landed ? "text-muted" : "text-goldtext")}>
                {landed ? "Landed" : `${clock(r.landAt)} · in ${formatDuration(r.landAt - now)}`}
              </span>
            </div>
            {r.note && <span className="text-xs text-sub">“{r.note}”</span>}
            <span className="text-[11px] text-muted">
              Called by {r.by} · {r.armies.length} armies, {fmt(r.armies.reduce((n, a) => n + a.troops, 0))} troops
            </span>
            {r.armies.map((a, i) => (
              <span key={`${a.playerId}-${i}`} className="flex items-center justify-between gap-2 text-xs text-sub">
                <span className="truncate">
                  {a.playerId === me.id ? "You" : a.name} · {fmt(a.troops)} troops ·{" "}
                  {a.departAt ? `waiting at home, sets out ${clock(a.departAt)}` : "on the road"}
                </span>
                {a.musterId && a.playerId === me.id && !landed && (
                  <button
                    className="text-[11px] font-bold text-bad shrink-0"
                    disabled={busy != null}
                    type="button"
                    onClick={() => run(`leave-${a.musterId}`, () => clan.leaveStrike(a.musterId!))}
                  >
                    Keep home
                  </button>
                )}
              </span>
            ))}
            {!landed && (
              <div className="flex gap-2">
                <Link className="btn btn-gold btn-sm flex-1" href={`/battle?attack=${r.targetId}&rally=${r.id}&land=${r.landAt}`}>
                  <IconText text="⚔️ Join the strike" />
                </Link>
                {officer && (
                  <Button disabled={busy != null} size="small" variant="outline" onClick={() => run(`rally-${r.id}`, () => clan.cancelRally(r.id))}>
                    Call off
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Diplomacy */}
      <Title>Treaties and wars</Title>
      {view && view.relations.length === 0 && <Card className="text-center text-xs text-sub">No treaties, no wars.</Card>}
      {view?.relations.map((r) => {
        const t = RELATION_TEXT[r.kind];
        const proposal = r.status === "proposed";
        const peace = r.kind === "war" && r.status === "peace";

        return (
          <Card key={r.clanId} className={clsx("flex flex-col gap-1.5", r.kind === "war" && "border-bad/50")}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-parch truncate">
                <GameIcon e={t.icon} /> [{r.tag}] {r.name}
              </span>
              <span className="text-[11px] font-extrabold text-muted">
                {proposal ? (r.byUs ? "Proposed by you" : "They propose") : peace ? (r.byUs ? "You offered peace" : "They offer peace") : t.name}
              </span>
            </div>
            {r.kind === "war" && (
              <span className="text-xs text-sub">
                War score <b className="text-goldtext">{r.score[0]}</b> – <b className="text-bad">{r.score[1]}</b>
                {r.endsAt ? ` · ends in ${formatDuration(r.endsAt - now)}` : ""}
              </span>
            )}
            {proposal && <span className="text-xs text-sub">{t.name}: {t.hint}</span>}
            {officer && (
              <div className="flex flex-wrap gap-1.5">
                {proposal && !r.byUs && (
                  <>
                    <Button size="small" disabled={busy != null} onClick={() => run(`d-${r.clanId}`, () => clan.diplomacy(r.clanId, "accept"))}>
                      Accept
                    </Button>
                    <Button size="small" variant="secondary" disabled={busy != null} onClick={() => run(`d-${r.clanId}`, () => clan.diplomacy(r.clanId, "decline"))}>
                      Decline
                    </Button>
                  </>
                )}
                {(proposal && r.byUs) || (!proposal && r.kind !== "war") ? (
                  <Button size="small" variant="outline" disabled={busy != null} onClick={() => run(`d-${r.clanId}`, () => clan.diplomacy(r.clanId, "end"))}>
                    {proposal ? "Withdraw" : "Break treaty"}
                  </Button>
                ) : null}
                {r.kind === "war" && !(peace && r.byUs) && (
                  <Button size="small" variant="secondary" disabled={busy != null} onClick={() => run(`d-${r.clanId}`, () => clan.diplomacy(r.clanId, "peace"))}>
                    {peace ? "Accept peace" : "Offer peace"}
                  </Button>
                )}
                {r.kind !== "war" && !proposal && (
                  <Button size="small" variant="danger" disabled={busy != null} onClick={() => run(`d-${r.clanId}`, () => clan.diplomacy(r.clanId, "war"))}>
                    Declare war
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {officer && (
        <Card className="flex flex-col gap-2">
          <span className="text-sm font-bold text-parch">Another clan</span>
          <input
            className={clsx(inputCls, "uppercase")}
            maxLength={8}
            placeholder="Their tag, e.g. WOLF"
            value={otherTag}
            onChange={(e) => setOtherTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
          <div className="grid grid-cols-3 gap-1.5">
            {(["ally", "nap", "war"] as RelationKind[]).map((k) => (
              <Button
                key={k}
                disabled={busy != null || otherTag.length < 2}
                size="small"
                variant={k === "war" ? "danger" : "secondary"}
                onClick={() => run(`new-${k}`, async () => {
                  const ok = await clan.diplomacy(otherTag, k);

                  if (ok) setOtherTag("");

                  return ok;
                })}
              >
                {RELATION_TEXT[k].icon} {k === "ally" ? "Ally" : k === "nap" ? "Pact" : "War"}
              </Button>
            ))}
          </div>
          <span className="text-[11px] text-muted">
            Allies and pacts can&apos;t raid each other (both clans must agree). A war is declared by one clan, lasts up to a week,
            and scores every raid won between you.
          </span>
        </Card>
      )}

      {/* Keyed by the host: a fresh pick of troops for each clanmate. */}
      <GuardDrawer key={guarding?.id ?? 0} host={guarding} onClose={() => setGuarding(null)} />
    </div>
  );
};

/** How far ahead a strike can be called: enough to gather, short enough to be a plan. */
const STRIKE_DELAYS = [30, 60, 120, 240, 480].map((m) => m * 60e3);

/**
 * On a tribe's card on the War map: an officer calls a clan strike on it.
 * Every clanmate is told, and armies sent to it land at the same moment.
 */
export const RallyButton = ({ targetId, targetName, shieldUntil = 0 }: { targetId: number; targetName: string; shieldUntil?: number }) => {
  const { clan } = useGameActions();
  const [open, setOpen] = useState(false);
  const [delay, setDelay] = useState(STRIKE_DELAYS[1]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Picked when opened, so the time shown doesn't drift while the sheet is up.
  const [base, setBase] = useState(0);
  // A strike can't land on a shield: only the times after it drops.
  const [opened] = useState(() => Date.now());
  const delays = STRIKE_DELAYS.filter((d) => opened + d > shieldUntil);

  if (!delays.length) return null;

  return (
    <>
      <Button
        isFull
        variant="outline"
        onClick={() => {
          setBase(Date.now());
          if (!delays.includes(delay)) setDelay(delays[0]);
          setOpen(true);
        }}
      >
        <IconText text="📯 Call a clan strike" />
      </Button>
      <Drawer isOpen={open} position="bottom" title={`Clan strike on ${targetName}`} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-sub">
            Your whole clan is told. Every army sent to the strike slows down to land at the same moment, one wave after another
            at the gates. Only the Jarl and Huscarls can call one.
          </p>
          <div className="seg">
            {delays.map((d) => (
              <button
                key={d}
                className={clsx("flex-1 h-8 rounded-[9px] text-xs font-extrabold", delay === d ? "bg-gold text-[#1A120B]" : "text-muted")}
                type="button"
                onClick={() => setDelay(d)}
              >
                {d < 3600e3 ? `${d / 60e3}m` : `${d / 3600e3}h`}
              </button>
            ))}
          </div>
          <span className="text-sm font-bold text-parch text-center">Lands at {clock(base + delay)}</span>
          <input
            className={inputCls}
            maxLength={80}
            placeholder="Orders for the clan (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            isFull
            disabled={busy}
            size="large"
            onClick={async () => {
              setBusy(true);
              const ok = await clan.rally(targetId, Date.now() + delay, note.trim() || undefined);

              setBusy(false);
              if (ok) setOpen(false);
            }}
          >
            {busy ? "Sounding the horn…" : <IconText text="📯 Sound the horn" />}
          </Button>
        </div>
      </Drawer>
    </>
  );
};
