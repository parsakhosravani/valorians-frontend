"use client";
import React, { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import viking from "~/images/friends/viking.png";
import coinImg from "~/images/resources/coin.webp";

import { Card, Tabs, fmt } from "@/components/organisms/war/shared";
import { FlagDesigner } from "@/components/organisms/clan/FlagDesigner";
import { Avatar, Button, ClanFlag, Coin, TextImage } from "@/components";
import useBackButton from "@/hooks/useBackButton";
import { RESOURCES, useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { compact, formatDuration } from "@/lib/format";
import { CLAN, RESOURCE_NAMES } from "@/lib/game/config";
import {
  CLAN_TECHS,
  CLAN_TECH_MAX_LEVEL,
  ClanFlag as Flag,
  ClanRole,
  JOIN_MODES,
  JoinMode,
  ROLE_NAMES,
  TECH_BY_ID,
  TREASURY_KEYS,
  TechId,
  TreasuryKey,
  can,
  canKick,
  defaultFlag,
} from "@/lib/game/clan";
import type { ClanView } from "@/server/clans";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";

type Mine = NonNullable<ClanView["mine"]>;
type Member = Mine["members"][number];
type BrowseTab = "browse" | "found";
type ClanTab = "members" | "treasury" | "banner" | "chronicle";

const inputCls = "inset w-full h-10 px-3 text-sm font-bold text-parch placeholder:text-muted/70 outline-none focus:border-gold";

const TREASURY_ICON: Record<TreasuryKey, React.ReactNode> = {
  ...(Object.fromEntries(RESOURCES.map((r) => [r.id, <Image key={r.id} alt={r.name} className="w-4 h-4" src={r.img} />])) as Record<
    Exclude<TreasuryKey, "coins">,
    React.ReactNode
  >),
  coins: <Image alt="coins" className="w-4 h-4" src={coinImg} />,
};

const keyName = (k: TreasuryKey) => (k === "coins" ? "coins" : (RESOURCE_NAMES[k] ?? String(k)).toLowerCase());

const ROLE_ICON: Record<ClanRole, string> = { leader: "👑", officer: "🪓", member: "" };
const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, officer: 1, member: 2 };

const Tag = ({ tag }: { tag: string }) => (
  <span className="pill pill-gold h-5 px-1.5 rounded-md text-[11px]">
    [{tag}]
  </span>
);

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="inset flex flex-col items-center py-1.5">
    <span className="text-sm font-extrabold text-parch">{value}</span>
    <span className="label !text-micro">{label}</span>
  </div>
);

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <h2 className="title-section flex-1">{children}</h2>
    {right}
  </div>
);

const ago = (now: number, at: number) => (now - at < 60_000 ? "just now" : `${formatDuration(now - at)} ago`);

/** One line of the clan chronicle. */
function logText(e: Mine["log"][number]) {
  const a = e.actor ?? "Someone";
  const t = e.target ?? "a chief";
  // Only donations and aid carry an amount; build it when needed.
  const amount = () => `${fmt(Number(e.data?.amount ?? 0))} ${keyName(String(e.data?.key ?? "") as TreasuryKey)}`;

  switch (e.kind) {
    case "founded":
      return { icon: "🏰", text: `${a} founded the clan` };
    case "joined":
      return { icon: "🤝", text: `${a} joined the clan` };
    case "accepted":
      return { icon: "🤝", text: `${a} welcomed ${t} into the clan` };
    case "left":
      return { icon: "🚶", text: `${a} left the clan` };
    case "kicked":
      return { icon: "🚪", text: `${a} removed ${t}` };
    case "promoted":
      return { icon: "🪓", text: `${a} named ${t} a ${ROLE_NAMES.officer}` };
    case "demoted":
      return { icon: "🪓", text: `${a} took away ${t}'s ${ROLE_NAMES.officer} rank` };
    case "leader":
      return { icon: "👑", text: e.actor ? `${a} passed the clan to ${t}` : `${t} is the new ${ROLE_NAMES.leader}` };
    case "donated":
      return { icon: "💰", text: `${a} donated ${amount()}` };
    case "tech": {
      const tech = TECH_BY_ID[String(e.data.tech) as TechId];

      return { icon: tech?.icon ?? "🏛️", text: `${a} raised ${tech?.name ?? "a tech"} to level ${e.data.level}` };
    }
    case "aid":
      return { icon: "📦", text: `${a} sent ${amount()} to ${t}` };
    case "flag":
      return { icon: "🚩", text: `${a} raised a new banner` };
    case "settings":
      return { icon: "⚙️", text: `${a} changed the clan's ${e.data.what}` };
    default:
      return { icon: "•", text: "Something happened" };
  }
}

/** Pick a treasury key (resource or coins). */
const KeyPicker = ({ value, onChange }: { value: TreasuryKey; onChange: (k: TreasuryKey) => void }) => (
  <div className="grid grid-cols-5 gap-1.5">
    {TREASURY_KEYS.map((k) => (
      <button
        key={k}
        className={clsx(
          "flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[10px] font-bold",
          value === k ? "border-gold bg-gold/10 text-goldtext" : "border-line bg-ink/50 text-sub"
        )}
        type="button"
        onClick={() => onChange(k)}
      >
        {TREASURY_ICON[k]}
        {k === "coins" ? "Coins" : RESOURCE_NAMES[k]}
      </button>
    ))}
  </div>
);

/** Amount input with quick-pick shares of what's available. */
const AmountInput = ({ value, onChange, max }: { value: string; onChange: (v: string) => void; max: number }) => (
  <div className="flex flex-col gap-1.5">
    <input
      className={inputCls}
      inputMode="numeric"
      placeholder="Amount"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
    />
    <div className="grid grid-cols-4 gap-1.5">
      {[0.1, 0.25, 0.5, 1].map((f) => (
        <button
          key={f}
          className="btn btn-wood btn-sm h-7 text-[11px] font-sans font-extrabold"
          type="button"
          onClick={() => onChange(String(Math.floor(max * f)))}
        >
          {f === 1 ? "Max" : `${f * 100}%`}
        </button>
      ))}
    </div>
  </div>
);

/** The last clan screen loaded, so coming back to the tab is instant. */
let cache: { playerId: number; view: ClanView } | null = null;

const cachedView = (playerId: number, clanId: number | null) =>
  cache && cache.playerId === playerId && (cache.view.mine?.id ?? null) === clanId ? cache.view : null;

/** A placeholder block that gently pulses while content loads. */
const Bone = ({ className }: { className?: string }) => (
  <div className={clsx("rounded-lg bg-panel2 animate-pulse", className)} />
);

/** The shape of the clan screen, shown until it loads. */
const ClanSkeleton = ({ inClan }: { inClan: boolean }) => (
  <div aria-busy="true" aria-label="Loading clan" className="flex flex-col gap-3">
    {inClan && (
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[52px] rounded-xl" />
        ))}
      </div>
    )}
    <Bone className="h-11 rounded-xl" />
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="card flex items-center gap-3 p-3">
        <Bone className={inClan ? "h-9 w-9" : "h-11 w-9"} />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-3.5 w-2/3" />
          <Bone className="h-2.5 w-1/2" />
        </div>
        <Bone className="h-8 w-14" />
      </div>
    ))}
  </div>
);

export const Clan: FunctionComponent = () => {
  useBackButton();
  const { authHeader, me, state, now, clan } = useGame();
  // Start from the last view of this screen (if it's still about the same clan) so it opens instantly.
  const [data, setData] = useState<ClanView | null>(() => cachedView(me.id, me.clan?.id ?? null));
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [browseTab, setBrowseTab] = useState<BrowseTab>("browse");
  const [tab, setTab] = useState<ClanTab>("members");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [openMember, setOpenMember] = useState<number | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<number | null>(null);

  // Found-a-clan form
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [newFlag, setNewFlag] = useState<Flag>(() => defaultFlag(me.id));
  const [newMode, setNewMode] = useState<JoinMode>("open");

  // Treasury forms
  const [donateKey, setDonateKey] = useState<TreasuryKey>("wood");
  const [donateAmount, setDonateAmount] = useState("");
  const [aidKey, setAidKey] = useState<TreasuryKey>("crop");
  const [aidAmount, setAidAmount] = useState("");

  // Banner & settings forms (filled from the clan once loaded)
  const [flagDraft, setFlagDraft] = useState<Flag | null>(null);
  const [mottoDraft, setMottoDraft] = useState<string | null>(null);
  const [minPopDraft, setMinPopDraft] = useState<string | null>(null);

  const load = useCallback(
    async (q = query) => {
      if (!authHeader) return;
      const path = `clan${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;

      // Mobile connections drop requests now and then: try a few times before giving up.
      for (let attempt = 0; ; attempt++) {
        try {
          const view = await apiRequest<ClanView>(authHeader, path);

          setData(view);
          if (!q.trim()) cache = { playerId: me.id, view };
          setError(null);

          return;
        } catch (e) {
          if (attempt >= 2) {
            setError((e as Error).message);

            return;
          }
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    },
    [authHeader, query, me.id]
  );

  // Reload when membership changes (join, leave, found) and as the search changes.
  useEffect(() => {
    const t = setTimeout(() => load(), query ? 300 : 0);

    return () => clearTimeout(t);
  }, [load, me.clan?.id, query]);

  const retry = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);
    await load();

    return ok;
  };

  const mine = data?.mine ?? null;
  const role: ClanRole = mine?.myRole ?? "member";
  const manager = can.manage(role);

  const flag = flagDraft ?? mine?.flag ?? null;
  const motto = mottoDraft ?? mine?.description ?? "";
  const minPop = minPopDraft ?? String(mine?.minPopulation ?? 0);
  const bannerDirty =
    !!mine &&
    ((flagDraft && JSON.stringify(flagDraft) !== JSON.stringify(mine.flag)) || (mottoDraft != null && mottoDraft !== mine.description));

  const members = useMemo(
    () =>
      [...(mine?.members ?? [])].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.population - a.population),
    [mine?.members]
  );

  const tagClean = tag.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const foundProblem =
    name.trim().length < CLAN.nameMin
      ? `Name needs at least ${CLAN.nameMin} characters`
      : tagClean.length < CLAN.tagMin
        ? `Tag needs ${CLAN.tagMin}-${CLAN.tagMax} letters or digits`
        : state.coins < CLAN.createCost
          ? `You need ${fmt(CLAN.createCost)} coins`
          : null;

  const have = (k: TreasuryKey) => Math.floor(k === "coins" ? state.coins : state.resources[k]);

  // ─── Member row actions ────────────────────────────────────────────────────

  const memberActions = (m: Member) => {
    if (!mine || m.id === me.id || !manager) return null;
    const amount = Number(aidAmount) || 0;

    return (
      <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-line">
        <div className="flex flex-wrap gap-1.5">
          {can.promote(role) && m.role !== "leader" && (
            <Button
              disabled={busy != null}
              size="small"
              variant="secondary"
              onClick={() => run(`role-${m.id}`, () => clan.setRole(m.id, m.role === "officer" ? "member" : "officer"))}
            >
              {m.role === "officer" ? `Remove ${ROLE_NAMES.officer} rank` : `Make ${ROLE_NAMES.officer}`}
            </Button>
          )}
          {can.settings(role) && (
            <Button disabled={busy != null} size="small" variant="secondary" onClick={() => setConfirmTransfer(m.id)}>
              <GameIcon e="👑" /> Make {ROLE_NAMES.leader}
            </Button>
          )}
          {canKick(role, m.role) && (
            <Button disabled={busy != null} size="small" variant="outline" onClick={() => run(`kick-${m.id}`, () => clan.kick(m.id))}>
              {busy === `kick-${m.id}` ? "…" : "Remove"}
            </Button>
          )}
        </div>

        {confirmTransfer === m.id && (
          <div className="flex flex-col gap-2 inset p-2.5">
            <p className="text-sm text-parch">
              Hand the clan to {m.name}? You'll become a {ROLE_NAMES.officer}.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="small" variant="secondary" onClick={() => setConfirmTransfer(null)}>
                Keep it
              </Button>
              <Button
                disabled={busy != null}
                size="small"
                variant="danger"
                onClick={async () => {
                  await run(`transfer-${m.id}`, () => clan.transfer(m.id));
                  setConfirmTransfer(null);
                  setOpenMember(null);
                }}
              >
                Pass it on
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 inset p-2.5">
          <span className="text-xs font-bold text-sub"><GameIcon e="📦" /> Send aid from the treasury</span>
          <KeyPicker value={aidKey} onChange={setAidKey} />
          <AmountInput max={mine.treasury[aidKey]} value={aidAmount} onChange={setAidAmount} />
          <Button
            disabled={busy != null || amount <= 0 || amount > mine.treasury[aidKey]}
            size="small"
            onClick={async () => {
              if (await run(`aid-${m.id}`, () => clan.aid(m.id, aidKey, amount))) setAidAmount("");
            }}
          >
            {busy === `aid-${m.id}` ? "Sending…" : `Send ${amount ? fmt(amount) : ""} ${keyName(aidKey)} to ${m.name}`}
          </Button>
        </div>
      </div>
    );
  };

  // ─── Tabs of your clan ─────────────────────────────────────────────────────

  const membersTab = mine && (
    <div className="flex flex-col gap-2">
      {manager && mine.requests.length > 0 && (
        <>
          <SectionTitle>At the gate</SectionTitle>
          {mine.requests.map((r) => (
            <Card key={r.id} className="flex items-center gap-2 !p-2">
              <Avatar className="rounded" size={34} src={r.photoUrl} />
              <div className="flex flex-col min-w-0 flex-1 gap-1">
                <span className="font-bold truncate leading-none">{r.name}</span>
                <div className="flex items-center gap-3 text-[11px] font-bold text-sub">
                  <TextImage direction="row" imgAlt="population" imgSrc={population} size="small" title={fmt(r.population)} />
                  <span><GameIcon e="💪" /> {fmt(r.power)}</span>
                  <span className="text-muted">{ago(now, r.at)}</span>
                </div>
              </div>
              <Button disabled={busy != null} size="small" variant="secondary" onClick={() => run(`no-${r.id}`, () => clan.answer(r.id, false))}>
                ✕
              </Button>
              <Button disabled={busy != null} size="small" onClick={() => run(`yes-${r.id}`, () => clan.answer(r.id, true))}>
                {busy === `yes-${r.id}` ? "…" : "Accept"}
              </Button>
            </Card>
          ))}
        </>
      )}

      <SectionTitle right={<span className="text-xs font-bold text-muted">Contribution</span>}>Members</SectionTitle>
      {members.map((m) => {
        const open = openMember === m.id;
        const tappable = manager && m.id !== me.id;

        return (
          <Card key={m.id} className={clsx("!p-2", open && "border-gold/60")}>
            <button
              className="flex w-full items-center gap-2 text-left"
              disabled={!tappable}
              type="button"
              onClick={() => {
                setOpenMember(open ? null : m.id);
                setConfirmTransfer(null);
              }}
            >
              <Avatar className="rounded" size={34} src={m.photoUrl} />
              <div className="flex flex-col min-w-0 flex-1 gap-1">
                <div className="flex items-center gap-1.5 leading-none font-bold truncate">
                  {ROLE_ICON[m.role] && <span aria-label={ROLE_NAMES[m.role]}><GameIcon e={ROLE_ICON[m.role]} /></span>}
                  <span className={clsx("truncate", m.id === me.id && "text-goldtext")}>
                    {m.name}
                    {m.id === me.id ? " (you)" : ""}
                  </span>
                  {m.role !== "member" && <span className="text-[10px] font-extrabold text-muted">{ROLE_NAMES[m.role]}</span>}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold text-sub">
                  <TextImage direction="row" imgAlt="population" imgSrc={population} size="small" title={fmt(m.population)} />
                  <span><GameIcon e="💪" /> {fmt(m.power)}</span>
                  <span><GameIcon e="🏆" /> {fmt(m.wins)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-extrabold text-goldtext">{compact(m.contribution)}</span>
                {tappable && <span className="text-[10px] text-muted">{open ? "▲" : "▼"}</span>}
              </div>
            </button>
            {open && memberActions(m)}
          </Card>
        );
      })}

      {confirmLeave ? (
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-parch">
            {role === "leader"
              ? mine.members.length > 1
                ? `Leave the clan? The longest-serving ${ROLE_NAMES.officer} (or else member) becomes ${ROLE_NAMES.leader}.`
                : "You're the last member. Leaving disbands the clan and its treasury is lost."
              : "Leave the clan? You'll lose its perks and your contribution resets."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
            <Button
              disabled={busy != null}
              variant="danger"
              onClick={async () => {
                await run("leave", clan.leave);
                setConfirmLeave(false);
              }}
            >
              {busy === "leave" ? "Leaving…" : "Leave"}
            </Button>
          </div>
        </Card>
      ) : (
        <Button isFull variant="secondary" onClick={() => setConfirmLeave(true)}>
          Leave clan
        </Button>
      )}
    </div>
  );

  const donateNum = Number(donateAmount) || 0;

  const treasuryTab = mine && (
    <div className="flex flex-col gap-3">
      <SectionTitle>Treasury</SectionTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {TREASURY_KEYS.map((k) => (
          <div key={k} className="flex flex-col items-center gap-0.5 inset py-1.5">
            {TREASURY_ICON[k]}
            <span className="text-xs font-extrabold text-parch">{compact(mine.treasury[k])}</span>
          </div>
        ))}
      </div>

      <Card className="flex flex-col gap-2">
        <span className="text-sm font-bold text-parch">Donate</span>
        <KeyPicker value={donateKey} onChange={setDonateKey} />
        <AmountInput max={have(donateKey)} value={donateAmount} onChange={setDonateAmount} />
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            You have {fmt(have(donateKey))} {keyName(donateKey)}
          </span>
          {donateKey === "coins" && <span>Coins count {CLAN.coinContributionWeight}× toward contribution</span>}
        </div>
        <Button
          disabled={busy != null || donateNum <= 0 || donateNum > have(donateKey)}
          isFull
          onClick={async () => {
            if (await run("donate", () => clan.donate(donateKey, donateNum))) setDonateAmount("");
          }}
        >
          {busy === "donate" ? "Donating…" : `Donate ${donateNum ? fmt(donateNum) : ""} ${keyName(donateKey)}`}
        </Button>
      </Card>

      <SectionTitle right={<span className="text-xs font-bold text-muted">Every member gets these</span>}>Clan techs</SectionTitle>
      {mine.techs.map((t) => {
        const def = TECH_BY_ID[t.id];
        const maxed = t.level >= CLAN_TECH_MAX_LEVEL;
        const afford = !!t.cost && TREASURY_KEYS.every((k) => mine.treasury[k] >= t.cost![k]);

        return (
          <Card key={t.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl"><GameIcon e={def.icon} /></span>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-parch">{def.name}</span>
                  <span className="text-[11px] font-extrabold text-muted">
                    Lv {t.level}/{CLAN_TECH_MAX_LEVEL}
                  </span>
                </div>
                <span className="text-[11px] text-sub">{def.description}</span>
              </div>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: CLAN_TECH_MAX_LEVEL }, (_, i) => (
                <span key={i} className={clsx("h-1.5 flex-1 rounded-full", i < t.level ? "bg-gold" : "bg-panel2")} />
              ))}
            </div>
            <div className="text-xs font-bold">
              <span className="text-parch">{t.level ? def.effect(t.level) : "No bonus yet"}</span>
              {!maxed && <span className="text-good"> → {def.effect(t.level + 1)}</span>}
            </div>
            {t.cost && (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {TREASURY_KEYS.map((k) => (
                    <span
                      key={k}
                      className={clsx(
                        "flex items-center gap-1 text-[11px] font-bold",
                        mine.treasury[k] >= t.cost![k] ? "text-sub" : "text-bad"
                      )}
                    >
                      {TREASURY_ICON[k]} {compact(t.cost![k])}
                    </span>
                  ))}
                </div>
                {manager ? (
                  <Button
                    disabled={busy != null || !afford}
                    size="small"
                    onClick={() => run(`tech-${t.id}`, () => clan.upgradeTech(t.id))}
                  >
                    {busy === `tech-${t.id}` ? "Raising…" : afford ? `Raise to level ${t.level + 1}` : "Treasury too low"}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted">
                    The {ROLE_NAMES.leader} and {ROLE_NAMES.officer}s spend the treasury. Donate to speed it up!
                  </span>
                )}
              </>
            )}
            {maxed && <span className="text-[11px] font-bold text-goldtext">Fully raised</span>}
          </Card>
        );
      })}
    </div>
  );

  const bannerTab = mine && flag && (
    <div className="flex flex-col gap-3">
      {manager ? (
        <>
          <Card>
            <FlagDesigner seed={mine.id} value={flag} onChange={setFlagDraft} />
          </Card>
          <Card className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-sub">Motto</span>
            <textarea
              className={clsx(inputCls, "h-20 py-2 resize-none")}
              maxLength={CLAN.descriptionMax}
              placeholder="Shields up, axes high."
              value={motto}
              onChange={(e) => setMottoDraft(e.target.value)}
            />
          </Card>
          <Button
            disabled={busy != null || !bannerDirty}
            isFull
            onClick={async () => {
              const change: Parameters<typeof clan.update>[0] = {};

              if (flagDraft) change.flag = flagDraft;
              if (mottoDraft != null) change.description = mottoDraft;
              if (await run("banner", () => clan.update(change, "Banner raised!"))) {
                setFlagDraft(null);
                setMottoDraft(null);
              }
            }}
          >
            {busy === "banner" ? "Saving…" : "Save banner"}
          </Button>
        </>
      ) : (
        <Card className="flex flex-col items-center gap-2 py-4">
          <ClanFlag flag={mine.flag} size={120} />
          <p className="text-xs text-muted text-center">
            Only the {ROLE_NAMES.leader} and {ROLE_NAMES.officer}s can change the banner.
          </p>
        </Card>
      )}

      {can.settings(role) && (
        <Card className="flex flex-col gap-3">
          <span className="text-sm font-bold text-parch">Who can join</span>
          <div className="grid grid-cols-3 gap-1.5">
            {JOIN_MODES.map((m) => (
              <button
                key={m.id}
                className={clsx(
                  "flex flex-col items-center rounded-lg border px-1 py-1.5",
                  mine.joinMode === m.id ? "border-gold bg-gold/10" : "border-line bg-ink/50"
                )}
                disabled={busy != null}
                type="button"
                onClick={() => mine.joinMode !== m.id && run("mode", () => clan.update({ joinMode: m.id }, `Clan is now ${m.name.toLowerCase()}`))}
              >
                <span className={clsx("text-sm font-bold", mine.joinMode === m.id ? "text-goldtext" : "text-parch")}>{m.name}</span>
                <span className="text-[10px] text-muted text-center leading-tight">{m.hint}</span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-sub">Minimum population to join</span>
            <div className="flex gap-2">
              <input
                className={inputCls}
                inputMode="numeric"
                value={minPop}
                onChange={(e) => setMinPopDraft(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <Button
                disabled={busy != null || minPopDraft == null || Number(minPopDraft || 0) === mine.minPopulation}
                variant="secondary"
                onClick={async () => {
                  if (await run("minpop", () => clan.update({ minPopulation: Number(minPopDraft || 0) }))) setMinPopDraft(null);
                }}
              >
                Set
              </Button>
            </div>
          </label>
        </Card>
      )}
    </div>
  );

  const chronicleTab = mine && (
    <div className="flex flex-col gap-1.5">
      <SectionTitle>Chronicle</SectionTitle>
      {mine.log.length === 0 && <Card className="text-center text-sm text-sub">Nothing has happened yet.</Card>}
      {mine.log.map((e) => {
        const { icon, text } = logText(e);

        return (
          <div key={e.id} className="flex items-start gap-2 card-flat px-3 py-2">
            <span className="text-base leading-5"><GameIcon e={icon} /></span>
            <span className="flex-1 text-sm text-parch leading-5">{text}</span>
            <span className="text-[10px] text-muted whitespace-nowrap leading-5">{ago(now, e.at)}</span>
          </div>
        );
      })}
    </div>
  );

  // ─── Browse ────────────────────────────────────────────────────────────────

  const joinButton = (c: ClanView["clans"][number]) => {
    const requested = data?.requested.includes(c.id);
    const full = c.members >= c.maxMembers;
    const small = state.population < c.minPopulation;

    if (requested)
      return (
        <Button disabled={busy != null} size="small" variant="secondary" onClick={() => run(`c-${c.id}`, () => clan.cancelRequest(c.id))}>
          {busy === `c-${c.id}` ? "…" : "Asked ✕"}
        </Button>
      );

    const label = c.joinMode === "closed" ? "Closed" : full ? "Full" : small ? "Too small" : c.joinMode === "request" ? "Ask" : "Join";

    return (
      <Button
        disabled={busy != null || c.joinMode === "closed" || full || small}
        size="small"
        onClick={() => run(`c-${c.id}`, () => clan.join(c.id))}
      >
        {busy === `c-${c.id}` ? "…" : label}
      </Button>
    );
  };

  // Before the clan has loaded, the player's badge already says which clan they're in.
  const badge = !data && me.clan ? me.clan : null;

  return (
    <>
      <div className="relative flex flex-col w-full px-3 pt-8 pb-28 gap-4">
        <div className={clsx("min-h-[104px] w-full flex", mine || badge ? "card" : "card-hero")}>
          {mine || badge ? (
            <div className="w-1/4 flex items-center justify-center py-2 pl-1">
              <ClanFlag
                flag={mine ? (flagDraft ?? mine.flag) : badge!.flag}
                size={88}
                title={`${mine?.name ?? badge!.name} flag`}
              />
            </div>
          ) : (
            <div className="w-2/6 flex flex-col justify-start relative">
              <Image
                alt=""
                className="absolute w-full max-w-[124px] h-[135%] bottom-0 left-0 object-left-bottom object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
                src={viking}
              />
            </div>
          )}
          <div className={clsx("flex flex-col justify-center gap-1 py-2.5 pr-2", mine || badge ? "w-3/4 pl-2" : "w-4/6 pl-3")}>
            {badge ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <Tag tag={badge.tag} />
                  <span className="title-screen !text-[20px] truncate">{badge.name}</span>
                </div>
                {!error && (
                  <>
                    <Bone className="h-3 w-32" />
                    <Bone className="h-3 w-48" />
                  </>
                )}
              </>
            ) : mine ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <Tag tag={mine.tag} />
                  <span className="title-screen !text-[20px] truncate">{mine.name}</span>
                </div>
                <div className="text-[11px] font-bold text-goldtext">
                  Level {mine.level} · {ROLE_ICON[role] && <GameIcon e={ROLE_ICON[role]} />} You are {role === "member" ? "a" : "the"} {ROLE_NAMES[role]}
                </div>
                <div className="text-sub text-xs">{mine.description || "Stand together, raid together, rise together."}</div>
              </>
            ) : (
              <>
                <h1 className="title-screen">Join a Clan!</h1>
                <div className="text-sub text-xs">
                  Band together under one banner: share a treasury, raise clan techs, and never raid each other.
                </div>
              </>
            )}
          </div>
        </div>

        {error && !data && (
          <Card className="flex flex-col items-center gap-2 py-5 text-center">
            <span className="text-3xl"><GameIcon e="🏚️" /></span>
            <span className="font-display text-parch font-bold">Couldn't reach the clan hall</span>
            <span className="text-xs text-sub">Your connection dropped. Your clan is safe, try again in a moment.</span>
            <Button className="mt-1" disabled={retrying} size="small" onClick={retry}>
              {retrying ? "Trying…" : "Try again"}
            </Button>
          </Card>
        )}
        {error && data && (
          <button className="self-start text-xs font-bold text-bad" type="button" onClick={retry}>
            {retrying ? "Reconnecting…" : "⚠️ Offline, showing the last update. Tap to retry"}
          </button>
        )}
        {!data && !error && <ClanSkeleton inClan={!!me.clan} />}

        {mine && (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Rank" value={`#${fmt(mine.rank)}`} />
              <Stat label="Members" value={`${mine.members.length}/${mine.maxMembers}`} />
              <Stat label="Population" value={compact(mine.population)} />
              <Stat label="Power" value={compact(mine.power)} />
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {CLAN_TECHS.filter((t) => t.id !== "hall").map((t) => {
                const lvl = mine.techs.find((x) => x.id === t.id)?.level ?? 0;

                return (
                  <span
                    key={t.id}
                    className={clsx(
                      "px-2 py-1 rounded-lg border",
                      lvl ? "bg-[#1C2A14] border-good/60 text-good" : "bg-ink/50 border-line text-muted"
                    )}
                  >
                    <GameIcon e={t.icon} /> {lvl ? t.effect(lvl) : `${t.name}: none yet`}
                  </span>
                );
              })}
            </div>

            <Tabs
              tabs={[
                { id: "members", label: "Members", badge: manager ? mine.requests.length : 0 },
                { id: "treasury", label: "Treasury" },
                { id: "banner", label: "Banner" },
                { id: "chronicle", label: "Log" },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === "members" && membersTab}
            {tab === "treasury" && treasuryTab}
            {tab === "banner" && bannerTab}
            {tab === "chronicle" && chronicleTab}
          </>
        )}

        {data && !mine && (
          <>
            <Tabs
              tabs={[
                { id: "browse", label: "Browse", badge: data.requested.length },
                { id: "found", label: "Found a clan" },
              ]}
              value={browseTab}
              onChange={setBrowseTab}
            />

            {browseTab === "browse" && (
              <div className="flex flex-col gap-2">
                <input
                  className={inputCls}
                  placeholder="Search by name or tag"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {data.clans.length === 0 && (
                  <Card className="text-center text-sm text-sub">
                    {query ? "No clans match that search." : "No clans yet. Be the first to found one!"}
                  </Card>
                )}
                {data.clans.map((c, i) => (
                  <Card key={c.id} className="flex items-center gap-2.5 !py-2">
                    <div className="flex flex-col items-center w-9 shrink-0">
                      <ClanFlag flag={c.flag} size={40} title={`${c.name} flag`} />
                      {!query && <span className="text-[10px] font-extrabold text-muted">#{i + 1}</span>}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Tag tag={c.tag} />
                        <span className="font-bold truncate">{c.name}</span>
                      </div>
                      {c.description && <span className="text-[11px] text-sub line-clamp-2">{c.description}</span>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-bold text-sub">
                        <span className="text-goldtext">Lv {c.level}</span>
                        <span>
                          <GameIcon e="👥" /> {c.members}/{c.maxMembers}
                        </span>
                        <TextImage direction="row" imgAlt="population" imgSrc={population} size="small" title={compact(c.population)} />
                        {c.joinMode !== "open" && (
                          <span className="text-muted"><IconText text={c.joinMode === "request" ? "✉️ By request" : "🔒 Closed"} /></span>
                        )}
                        {c.minPopulation > 0 && <span className="text-muted">min {compact(c.minPopulation)}</span>}
                      </div>
                    </div>
                    {joinButton(c)}
                  </Card>
                ))}
              </div>
            )}

            {browseTab === "found" && (
              <Card className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sub">Clan name</span>
                  <input
                    className={inputCls}
                    maxLength={CLAN.nameMax}
                    placeholder="Sons of the North"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sub">
                    Tag · {CLAN.tagMin}-{CLAN.tagMax} letters or digits
                  </span>
                  <input
                    className={clsx(inputCls, "uppercase")}
                    maxLength={CLAN.tagMax}
                    placeholder="SOTN"
                    value={tagClean}
                    onChange={(e) => setTag(e.target.value)}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sub">Banner</span>
                  <FlagDesigner seed={me.id} value={newFlag} onChange={setNewFlag} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sub">Who can join</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {JOIN_MODES.map((m) => (
                      <button
                        key={m.id}
                        className={clsx(
                          "flex flex-col items-center rounded-lg border px-1 py-1.5",
                          newMode === m.id ? "border-gold bg-gold/10" : "border-line bg-ink/50"
                        )}
                        type="button"
                        onClick={() => setNewMode(m.id)}
                      >
                        <span className={clsx("text-sm font-bold", newMode === m.id ? "text-goldtext" : "text-parch")}>{m.name}</span>
                        <span className="text-[10px] text-muted text-center leading-tight">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sub">Motto (optional)</span>
                  <textarea
                    className={clsx(inputCls, "h-20 py-2 resize-none")}
                    maxLength={CLAN.descriptionMax}
                    placeholder="Shields up, axes high."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <div className="flex items-center justify-between inset px-3 py-2 text-sm">
                  <span className="text-sub">Cost</span>
                  <Coin amount={CLAN.createCost} />
                </div>
                {foundProblem && <p className="text-xs text-bad">{foundProblem}</p>}
                <Button
                  disabled={!!foundProblem || busy != null}
                  isFull
                  onClick={async () => {
                    const ok = await run("create", () =>
                      clan.create({ name: name.trim(), tag: tagClean, description: description.trim(), flag: newFlag, joinMode: newMode })
                    );

                    if (ok) {
                      setName("");
                      setTag("");
                      setDescription("");
                      setTab("members");
                    }
                  }}
                >
                  {busy === "create" ? "Founding…" : "Found clan"}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>

      <Image
        priority
        alt=""
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-25"
        src={bg}
      />
    </>
  );
};
