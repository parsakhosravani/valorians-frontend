"use client";
import React, { FunctionComponent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import viking from "~/images/friends/viking.png";

import { Card, Tabs, fmt } from "@/components/organisms/war/shared";
import { Avatar, Button, Coin, TextImage } from "@/components";
import useBackButton from "@/hooks/useBackButton";
import { useGame } from "@/context";
import { apiRequest } from "@/lib/api";
import { CLAN } from "@/lib/game/config";
import type { ClanView } from "@/server/clans";

type Tab = "browse" | "found";

const inputCls =
  "w-full h-10 rounded-lg bg-panel border border-line px-3 font-bold text-parch placeholder:text-muted focus:outline-none focus:border-gold";

const Tag = ({ tag }: { tag: string }) => (
  <span className="rounded-md bg-gold/15 border border-gold/40 px-1.5 py-0.5 text-[11px] font-extrabold text-goldtext">
    [{tag}]
  </span>
);

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col items-center rounded-xl bg-panel border border-line py-1.5">
    <span className="text-sm font-extrabold text-parch">{value}</span>
    <span className="text-[10px] font-bold text-muted">{label}</span>
  </div>
);

export const Clan: FunctionComponent = () => {
  useBackButton();
  const { authHeader, me, state, clan } = useGame();
  const [data, setData] = useState<ClanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("browse");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | "create" | "leave" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Found-a-clan form
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(
    async (q = query) => {
      if (!authHeader) return;
      try {
        setData(await apiRequest<ClanView>(authHeader, `clan${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [authHeader, query]
  );

  // Reload when membership changes (join, leave, found) and as the search changes.
  useEffect(() => {
    const t = setTimeout(() => load(), query ? 300 : 0);

    return () => clearTimeout(t);
  }, [load, me.clan?.id, query]);

  const run = async (key: typeof busy, fn: () => Promise<boolean>) => {
    setBusy(key);
    const ok = await fn();

    setBusy(null);
    await load();

    return ok;
  };

  const tagClean = tag.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const foundProblem =
    name.trim().length < CLAN.nameMin
      ? `Name needs at least ${CLAN.nameMin} characters`
      : tagClean.length < CLAN.tagMin
        ? `Tag needs ${CLAN.tagMin}-${CLAN.tagMax} letters or digits`
        : state.coins < CLAN.createCost
          ? `You need ${fmt(CLAN.createCost)} coins`
          : null;

  const mine = data?.mine;
  const iLead = mine?.leaderId === me.id;

  return (
    <>
      <div className="relative flex flex-col w-full px-3 pt-8 pb-28 gap-4">
        <div className="bg-buildingBg border border-line min-h-[100px] w-full flex justify-end rounded-2xl">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              alt=""
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
              src={viking}
            />
          </div>
          <div className="w-4/6 flex flex-col justify-center gap-1 pl-3 py-2.5 pr-2">
            {mine ? (
              <>
                <div className="flex items-center gap-2">
                  <Tag tag={mine.tag} />
                  <span className="font-display text-parch text-lg font-bold truncate">{mine.name}</span>
                </div>
                <div className="text-[#D8C9AE] text-xs">
                  {mine.description || "Stand together, raid together, rise together."}
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-parch text-lg font-bold">Join a Clan!</div>
                <div className="text-[#D8C9AE] text-xs">
                  Band together with other chiefs, or found your own clan and lead it to glory.
                </div>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-[#F08A6C]">{error}</p>}
        {!data && !error && <p className="text-sm text-[#B19C80]">Loading…</p>}

        {mine && (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Rank" value={`#${fmt(mine.rank)}`} />
              <Stat label="Members" value={`${mine.members.length}/${CLAN.maxMembers}`} />
              <Stat label="Population" value={fmt(mine.population)} />
              <Stat label="Power" value={fmt(mine.power)} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-display text-parch text-lg font-bold">Members</div>
              {mine.members.map((m) => (
                <Card key={m.id} className="flex items-center gap-2 !p-2">
                  <Avatar className="rounded" size={34} src={m.photoUrl} />
                  <div className="flex flex-col min-w-0 flex-1 gap-1">
                    <div className="flex items-center gap-1.5 leading-none font-bold truncate">
                      {m.isLeader && <span aria-label="leader">👑</span>}
                      <span className={clsx("truncate", m.id === me.id && "text-goldtext")}>
                        {m.name}
                        {m.id === me.id ? " (you)" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-bold text-sub">
                      <TextImage direction="row" imgAlt="population" imgSrc={population} size="small" title={fmt(m.population)} />
                      <span>💪 {fmt(m.power)}</span>
                    </div>
                  </div>
                  {iLead && m.id !== me.id && (
                    <Button
                      disabled={busy != null}
                      size="small"
                      variant="outline"
                      onClick={() => run(m.id, () => clan.kick(m.id))}
                    >
                      {busy === m.id ? "…" : "Remove"}
                    </Button>
                  )}
                </Card>
              ))}
            </div>

            {confirmLeave ? (
              <Card className="flex flex-col gap-2">
                <p className="text-sm text-parch">
                  {iLead
                    ? mine.members.length > 1
                      ? "Leave the clan? Leadership passes to the longest-serving member."
                      : "You're the last member. Leaving disbands the clan."
                    : "Leave the clan?"}
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
          </>
        )}

        {data && !mine && (
          <>
            <Tabs
              tabs={[
                { id: "browse", label: "Browse" },
                { id: "found", label: "Found a clan" },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === "browse" && (
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
                {data.clans.map((c, i) => {
                  const full = c.members >= CLAN.maxMembers;

                  return (
                    <Card key={c.id} className="flex items-center gap-3">
                      <span className="w-6 text-center font-extrabold text-muted">{query ? "" : i + 1}</span>
                      <div className="flex flex-col min-w-0 flex-1 gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Tag tag={c.tag} />
                          <span className="font-bold truncate">{c.name}</span>
                        </div>
                        {c.description && <span className="text-[11px] text-sub line-clamp-2">{c.description}</span>}
                        <div className="flex items-center gap-3 text-[11px] font-bold text-sub">
                          <span>
                            👥 {c.members}/{CLAN.maxMembers}
                          </span>
                          <TextImage direction="row" imgAlt="population" imgSrc={population} size="small" title={fmt(c.population)} />
                        </div>
                      </div>
                      <Button
                        disabled={full || busy != null}
                        size="small"
                        onClick={() => run(c.id, () => clan.join(c.id))}
                      >
                        {busy === c.id ? "…" : full ? "Full" : "Join"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}

            {tab === "found" && (
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
                <div className="flex items-center justify-between rounded-xl bg-panel border border-line px-3 py-2 text-sm">
                  <span className="text-sub">Cost</span>
                  <Coin amount={CLAN.createCost} />
                </div>
                {foundProblem && <p className="text-xs text-[#F08A6C]">{foundProblem}</p>}
                <Button
                  disabled={!!foundProblem || busy != null}
                  isFull
                  onClick={async () => {
                    const ok = await run("create", () =>
                      clan.create({ name: name.trim(), tag: tagClean, description: description.trim() })
                    );

                    if (ok) {
                      setName("");
                      setTag("");
                      setDescription("");
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
