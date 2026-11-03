"use client";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import toast from "react-hot-toast";

import { Drawer } from "@/components/molecules/Drawer";
import { useGameStatus } from "@/context";
import { apiRequest } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { noticeParts, noticePlain } from "@/lib/noticeText";

type Notice = { id: number; at: number; html: string; button: string; path: string; read: boolean };

const NoticeText = ({ html }: { html: string }) => (
  <>
    {noticeParts(html).map((p, i) =>
      p.bold ? (
        <b key={i} className="text-goldtext">
          {p.text}
        </b>
      ) : (
        <span key={i}>{p.text}</span>
      )
    )}
  </>
);

/**
 * The in-game inbox behind the header's bell: the same news the bot sends on
 * Telegram (raids, spies, trades, clan requests…), for players who don't get
 * the bot's messages or missed them. A new one also pops up as a toast while
 * the game is open.
 */
export const NoticesBell = () => {
  const { me, authHeader } = useGameStatus();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [now, setNow] = useState(0);
  const unread = me?.unreadNotices ?? 0;
  const seenUnread = useRef<number | null>(null);

  const load = async () => {
    if (!authHeader) return null;
    try {
      const { notices } = await apiRequest<{ notices: Notice[] }>(authHeader, "notices");

      setNotices(notices);
      setNow(Date.now());

      return notices;
    } catch {
      return null;
    }
  };

  // More unread than last sync: something happened while you were playing.
  useEffect(() => {
    const before = seenUnread.current;

    seenUnread.current = unread;
    if (before === null || unread <= before) return;
    load().then((list) => {
      const newest = list?.find((n) => !n.read);

      if (!newest) return;
      // Tapping the toast follows the notice's button (e.g. a victory opens its report).
      toast(
        newest.path ? (
          <span role="link" onClick={() => router.push(newest.path as Route)}>
            {noticePlain(newest.html)}
          </span>
        ) : (
          noticePlain(newest.html)
        ),
        { duration: 6000 }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  const openInbox = async () => {
    setOpen(true);
    const list = await load();
    const newest = list?.[0];

    if (authHeader && newest && list.some((n) => !n.read)) {
      // The badge clears now; the server catches up quietly.
      seenUnread.current = 0;
      apiRequest(authHeader, "notices", { upTo: newest.id }).catch(() => undefined);
    }
  };

  const go = (path: string) => {
    setOpen(false);
    router.push(path as Route);
  };

  const badge = open ? 0 : unread;

  return (
    <>
      <button
        aria-label={badge ? `Messages, ${badge} new` : "Messages"}
        className="relative h-8 w-8 rounded-full border pill-gold flex items-center justify-center text-base active:scale-95"
        type="button"
        onClick={openInbox}
      >
        <span aria-hidden>🔔</span>
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center bg-ember text-[#FFF4EA] text-[10px] leading-none tabular-nums rounded-full min-w-4 h-4 px-1 ring-2 ring-ground"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      <Drawer isOpen={open} position="bottom" title="🔔 Messages" onClose={() => setOpen(false)}>
        {notices === null ? (
          <p className="text-sm font-bold text-muted mt-3 text-center">Loading…</p>
        ) : notices.length === 0 ? (
          <p className="text-sm font-bold text-muted mt-3 text-center">
            No news yet. Raids, spies, trades and clan news show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 mt-3">
            {notices.map((n) => (
              <li
                key={n.id}
                className={clsx("rounded-xl border px-3 py-2.5 bg-panel2", n.read ? "border-line/60" : "border-frame")}
              >
                <p className="text-sm font-bold whitespace-pre-line leading-snug">
                  <NoticeText html={n.html} />
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-[11px] font-bold text-muted">
                    {!n.read && <span className="text-ember mr-1">● New ·</span>}
                    {formatDuration(Math.max(0, now - n.at))} ago
                  </span>
                  <button
                    className="h-7 px-3 rounded-full pill-gold text-xs font-extrabold active:scale-95"
                    type="button"
                    onClick={() => go(n.path)}
                  >
                    {n.button}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
};
