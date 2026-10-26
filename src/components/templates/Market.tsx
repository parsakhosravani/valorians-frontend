"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import bg from "~/images/background/tribe.webp";

import { Card, Tabs, fmt } from "@/components/organisms/war/shared";
import { Avatar, Button } from "@/components";
import { RESOURCES, useGame } from "@/context";
import useBackButton from "@/hooks/useBackButton";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import {
  BUILDING_BY_ID,
  RESOURCE_NAMES,
  ResourceId,
  buildingImage,
} from "@/lib/game/config";
import {
  MAX_TRADE_RATIO,
  MERCHANT_CARRY,
  MIN_TRADE_AMOUNT,
  MIN_TRADE_RATIO,
  TRADING_POST,
} from "@/lib/game/trade";
import type { MarketView } from "@/server/trade";
import { GameIcon, IconText } from "@/components/atoms/GameIcon";

type Tab = "buy" | "sell" | "mine";

const IMG = Object.fromEntries(RESOURCES.map((r) => [r.id, r.img])) as Record<
  ResourceId,
  (typeof RESOURCES)[number]["img"]
>;

const Res = ({
  id,
  amount,
  className,
}: {
  id: ResourceId;
  amount: number;
  className?: string;
}) => (
  <span
    className={clsx("inline-flex items-center gap-1 font-extrabold", className)}
  >
    <Image
      alt={RESOURCE_NAMES[id]}
      className="w-5 h-5 object-contain"
      src={IMG[id]}
    />
    {fmt(amount)}{" "}
    <span className="font-bold text-sub">{RESOURCE_NAMES[id]}</span>
  </span>
);

/** Choose one of the four resources. */
const ResourcePicker = ({
  value,
  onChange,
  disabled,
}: {
  value: ResourceId;
  onChange: (r: ResourceId) => void;
  disabled?: ResourceId;
}) => (
  <div className="grid grid-cols-4 gap-1.5">
    {RESOURCES.map((r) => (
      <button
        key={r.id}
        aria-pressed={value === r.id}
        className={clsx(
          "flex flex-col items-center gap-0.5 rounded-xl border py-1.5 text-[11px] font-bold transition",
          value === r.id
            ? "border-gold bg-gold/15 text-goldtext"
            : "border-line bg-panel text-muted",
          disabled === r.id && "opacity-30",
        )}
        disabled={disabled === r.id}
        type="button"
        onClick={() => onChange(r.id)}
      >
        <Image alt="" className="w-7 h-7 object-contain" src={r.img} />
        {r.name}
      </button>
    ))}
  </div>
);

const AmountInput = ({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
}) => (
  <div className="flex items-center gap-2">
    <input
      className="flex-1 accent-[#E3A948]"
      max={Math.max(MIN_TRADE_AMOUNT, max)}
      min={MIN_TRADE_AMOUNT}
      step={50}
      type="range"
      value={Math.min(value, Math.max(MIN_TRADE_AMOUNT, max))}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <input
      className="w-20 h-9 rounded-lg bg-panel border border-line text-center font-extrabold text-parch"
      inputMode="numeric"
      value={value || ""}
      onChange={(e) =>
        onChange(
          Math.max(
            0,
            Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0),
          ),
        )
      }
    />
  </div>
);

export const Market = () => {
  useBackButton();
  const { authHeader, state, rates, now, trade, refresh } = useGame();
  const [tab, setTab] = useState<Tab>("buy");

  // /market?tab=mine (from the bot's "offer taken" message) or ?tab=sell.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");

    if (t === "mine" || t === "sell" || t === "buy") setTab(t);
  }, []);
  const [data, setData] = useState<MarketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResourceId | "all">("all");
  const [busy, setBusy] = useState<number | "post" | null>(null);

  // Sell form
  const [give, setGive] = useState<ResourceId>("wood");
  const [want, setWant] = useState<ResourceId>("iron");
  const [giveAmount, setGiveAmount] = useState(500);
  const [wantAmount, setWantAmount] = useState(500);

  const load = useCallback(async () => {
    if (!authHeader) return;
    try {
      setData(await apiRequest<MarketView>(authHeader, "trade"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authHeader]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);

    return () => clearInterval(t);
  }, [load]);

  // Reload (and refresh resources) right after the next merchants arrive.
  const nextArrival = useMemo(
    () =>
      data?.mine.reduce(
        (m, t) =>
          t.status === "accepted" && t.arrivesAt ? Math.min(m, t.arrivesAt) : m,
        Infinity,
      ) ?? Infinity,
    [data],
  );

  useEffect(() => {
    if (!Number.isFinite(nextArrival)) return;
    const t = setTimeout(
      async () => {
        await load();
        await refresh();
      },
      Math.min(2 ** 31 - 1, Math.max(1000, nextArrival - Date.now() + 1500)),
    );

    return () => clearTimeout(t);
  }, [nextArrival, load, refresh]);

  const level = data?.limits.level ?? 0;
  const maxAmount = level * MERCHANT_CARRY;
  const freeMerchants = data
    ? data.limits.maxOffers - data.limits.openOffers
    : 0;
  const ratio = giveAmount > 0 ? wantAmount / giveAmount : 0;
  const ratioOk = ratio >= MIN_TRADE_RATIO && ratio <= MAX_TRADE_RATIO;
  const sellProblem =
    level < 1
      ? "Build a Trading Post first"
      : freeMerchants <= 0
        ? "All merchants are busy. Upgrade the Trading Post for more offers"
        : giveAmount < MIN_TRADE_AMOUNT || wantAmount < MIN_TRADE_AMOUNT
          ? `Trade at least ${MIN_TRADE_AMOUNT} of each`
          : giveAmount > maxAmount
            ? `Your merchants carry up to ${fmt(maxAmount)}`
            : giveAmount > state.resources[give]
              ? `You have only ${fmt(state.resources[give])} ${RESOURCE_NAMES[give].toLowerCase()}`
              : !ratioOk
                ? "Ask for between half and double what you give"
                : null;

  const post = async () => {
    setBusy("post");
    const ok = await trade.post({ give, giveAmount, want, wantAmount });

    setBusy(null);
    if (ok) {
      await load();
      setTab("mine");
    }
  };
  const accept = async (id: number) => {
    setBusy(id);
    const ok = await trade.accept(id);

    setBusy(null);
    await load();
    if (ok) setTab("mine");
  };
  const cancel = async (id: number) => {
    setBusy(id);
    await trade.cancel(id);
    setBusy(null);
    await load();
  };

  const offers = (data?.market ?? []).filter(
    (o) => filter === "all" || o.give === filter,
  );
  const active = (data?.mine ?? []).filter((t) => t.status !== "delivered");
  const post_ = BUILDING_BY_ID[TRADING_POST];

  return (
    <>
      <div className="w-full flex flex-col gap-2 px-3 pt-1 pb-4">
        <h1 className="font-display text-2xl font-black text-center">Market</h1>
        <Tabs
          tabs={[
            { id: "buy", label: "Buy" },
            { id: "sell", label: "Sell" },
            {
              id: "mine",
              label: "My trades",
              badge: active.length || undefined,
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {data && level < 1 && (
          <Card className="flex items-center gap-3">
            <Image
              alt=""
              className="w-14 h-14 object-contain"
              height={56}
              src={buildingImage(post_)}
              width={56}
            />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-parch">
                Build a Trading Post to trade
              </p>
              <p className="text-xs text-sub">
                Each level adds a merchant: one more offer and{" "}
                {fmt(MERCHANT_CARRY)} more per load.
              </p>
            </div>
            <Link href="/tribe">
              <Button size="small">Build</Button>
            </Link>
          </Card>
        )}
        {data && level >= 1 && (
          <p className="text-xs text-sub text-center">
            <GameIcon e="🐪" /> Merchants free: <b className="text-parch">{freeMerchants}</b> of{" "}
            {data.limits.maxOffers} · carry up to{" "}
            <b className="text-parch">{fmt(maxAmount)}</b> per load
          </p>
        )}
        {error && <p className="text-sm text-[#F08A6C]">{error}</p>}
        {!data && !error && (
          <p className="text-sm text-muted">Opening the market…</p>
        )}

        {tab === "buy" && data && (
          <>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {(["all", ...RESOURCES.map((r) => r.id)] as const).map((f) => (
                <button
                  key={f}
                  className={clsx(
                    "shrink-0 h-8 px-3 rounded-full border text-xs font-bold",
                    filter === f
                      ? "border-gold bg-gold/15 text-goldtext"
                      : "border-line bg-panel text-muted",
                  )}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "Everything" : `Get ${RESOURCE_NAMES[f]}`}
                </button>
              ))}
            </div>
            {offers.length === 0 && (
              <Card className="text-center text-sm text-sub">
                No offers{" "}
                {filter === "all"
                  ? "yet"
                  : `for ${RESOURCE_NAMES[filter].toLowerCase()}`}
                . Post your own in{" "}
                <button
                  className="text-goldtext font-bold"
                  onClick={() => setTab("sell")}
                >
                  Sell
                </button>
                .
              </Card>
            )}
            {offers.map((o) => {
              const short = state.resources[o.want] < o.wantAmount;
              const tooBig = o.wantAmount > maxAmount;
              const deal = o.giveAmount / o.wantAmount;

              return (
                <Card key={o.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      className="rounded-lg"
                      size={28}
                      src={o.seller.photoUrl}
                    />
                    <span className="flex-1 min-w-0 truncate font-bold text-parch">
                      {o.seller.name}
                    </span>
                    <span
                      className={clsx(
                        "text-[11px] font-extrabold rounded-full px-2 py-0.5",
                        deal >= 1.2
                          ? "bg-good/20 text-good"
                          : deal < 0.85
                            ? "bg-[#F08A6C]/15 text-[#F08A6C]"
                            : "bg-panel text-sub",
                      )}
                    >
                      {deal >= 1.2
                        ? "Great deal"
                        : deal < 0.85
                          ? "Pricey"
                          : "Fair"}{" "}
                      · 1 : {deal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex-1 flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        You get
                      </span>
                      <Res amount={o.giveAmount} id={o.give} />
                    </div>
                    <span className="text-muted">⇄</span>
                    <div className="flex-1 flex flex-col items-end">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        You pay
                      </span>
                      <Res
                        amount={o.wantAmount}
                        className={short ? "text-[#F08A6C]" : ""}
                        id={o.want}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-sub">
                      <GameIcon e="⏱" /> Arrives in {formatDuration(o.travelMs)} · {o.tiles}{" "}
                      tiles away
                    </span>
                    <Button
                      disabled={level < 1 || short || tooBig || busy != null}
                      size="small"
                      onClick={() => accept(o.id)}
                    >
                      {busy === o.id ? "…" : "Trade"}
                    </Button>
                  </div>
                  {level >= 1 && (short || tooBig) && (
                    <p className="text-[11px] text-[#F08A6C]">
                      {short
                        ? `You need ${fmt(o.wantAmount - state.resources[o.want])} more ${RESOURCE_NAMES[o.want].toLowerCase()}`
                        : `Too heavy for your merchants (max ${fmt(maxAmount)})`}
                    </p>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {tab === "sell" && data && (
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-sub">
                You give · you have {fmt(state.resources[give])}
              </span>
              <ResourcePicker
                value={give}
                onChange={(r) => {
                  setGive(r);
                  if (r === want) setWant(give);
                }}
              />
              <AmountInput
                max={Math.min(
                  maxAmount || MERCHANT_CARRY,
                  Math.floor(state.resources[give]),
                )}
                value={giveAmount}
                onChange={setGiveAmount}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-sub">You want</span>
              <ResourcePicker disabled={give} value={want} onChange={setWant} />
              <AmountInput
                max={Math.max(
                  MIN_TRADE_AMOUNT,
                  Math.floor(giveAmount * MAX_TRADE_RATIO),
                )}
                value={wantAmount}
                onChange={setWantAmount}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-panel border border-line px-3 py-2 text-sm">
              <span className="text-sub">Rate</span>
              <span
                className={clsx(
                  "font-extrabold",
                  ratioOk ? "text-parch" : "text-[#F08A6C]",
                )}
              >
                1 {RESOURCE_NAMES[give].toLowerCase()} : {ratio.toFixed(2)}{" "}
                {RESOURCE_NAMES[want].toLowerCase()}
              </span>
            </div>
            <p className="text-[11px] text-muted">
              Your {RESOURCE_NAMES[give].toLowerCase()} is locked on the market
              until someone takes the offer or you cancel it. Prices must stay
              between 1 : {MIN_TRADE_RATIO} and 1 : {MAX_TRADE_RATIO}. Storage
              caps what you receive ({fmt(rates.capacity)}).
            </p>
            {sellProblem && (
              <p className="text-xs text-[#F08A6C]">{sellProblem}</p>
            )}
            <Button
              disabled={!!sellProblem || busy != null}
              isFull
              onClick={post}
            >
              {busy === "post" ? "Posting…" : "Post offer"}
            </Button>
          </Card>
        )}

        {tab === "mine" && data && (
          <>
            {data.mine.length === 0 && (
              <Card className="text-center text-sm text-sub">
                No trades yet.
              </Card>
            )}
            {data.mine.map((t) => {
              const travelling =
                t.status === "accepted" || t.status === "delivering";
              const incoming = t.selling
                ? { id: t.want, n: t.wantAmount }
                : { id: t.give, n: t.giveAmount };
              const outgoing = t.selling
                ? { id: t.give, n: t.giveAmount }
                : { id: t.want, n: t.wantAmount };

              return (
                <Card
                  key={t.id}
                  className={clsx(
                    "flex flex-col gap-2",
                    t.status === "delivered" && "opacity-70",
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={clsx(
                        "font-extrabold rounded-full px-2 py-0.5",
                        t.status === "open" && "bg-gold/15 text-goldtext",
                        travelling && "bg-[#3B5D8A]/30 text-[#9CC3F0]",
                        t.status === "delivered" && "bg-good/20 text-good",
                      )}
                    >
                      {t.status === "open"
                        ? "On the market"
                        : travelling
                          ? <IconText text="🐪 On the road" />
                          : "✓ Delivered"}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sub text-right">
                      {t.status === "open"
                        ? "Waiting for a buyer"
                        : `${t.selling ? "Bought by" : "Sold by"} ${t.other?.name ?? "a chief"}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex-1 flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        You give
                      </span>
                      <Res amount={outgoing.n} id={outgoing.id} />
                    </div>
                    <span className="text-muted">⇄</span>
                    <div className="flex-1 flex flex-col items-end">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        You get
                      </span>
                      <Res amount={incoming.n} id={incoming.id} />
                    </div>
                  </div>
                  {t.status === "open" && (
                    <Button
                      disabled={busy != null}
                      size="small"
                      variant="outline"
                      onClick={() => cancel(t.id)}
                    >
                      {busy === t.id ? "…" : "Cancel and take back"}
                    </Button>
                  )}
                  {travelling && t.arrivesAt && (
                    <p className="text-xs text-sub">
                      Your {RESOURCE_NAMES[incoming.id].toLowerCase()} arrives
                      in{" "}
                      <b className="text-parch">
                        {formatDuration(Math.max(0, t.arrivesAt - now))}
                      </b>
                    </p>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </div>
      <Image
        priority
        alt=""
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-20"
        src={bg}
      />
    </>
  );
};
