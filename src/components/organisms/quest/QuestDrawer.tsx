"use client";
import { useState } from "react";
import Image, { StaticImageData } from "next/image";

import telegramIcon from "~/images/social/telegram.png";
import youtubeIcon from "~/images/social/youtube.png";
import xIcon from "~/images/social/x.png";

import { Amount, Button, Sheet } from "@/components/ui";
import { useGame, useTelegramContext } from "@/context";
import { QUESTS, QuestDef, QuestId, questUrl } from "@/lib/game/config";
import { questStatus } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

/** Official brand marks for the social tasks. */
export const QUEST_ICONS: Record<QuestId, StaticImageData> = {
  telegram: telegramIcon,
  youtube: youtubeIcon,
  x: xIcon,
};

// Read at build time, so they must be referenced literally.
const QUEST_LINKS: Record<QuestId, string | null> = {
  telegram: questUrl("telegram", process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL),
  youtube: questUrl("youtube", process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL),
  x: questUrl("x", process.env.NEXT_PUBLIC_TWITTER_CHANNEL),
};

export const questLink = (id: QuestId) => QUEST_LINKS[id];

export const ACTIVE_QUESTS: QuestDef[] = QUESTS.filter((q) => QUEST_LINKS[q.id]);

export const QuestRewards = ({ quest }: { quest: QuestDef }) => (
  <span className="flex flex-wrap gap-x-3 gap-y-1">
    <Amount icon="coin" value={quest.reward.coins} />
    <Amount icon="population" suffix="" value={`+${quest.reward.population}`} />
    <Amount icon="population" suffix="/h" tone="good" value={`+${quest.reward.growth}`} />
  </span>
);

interface QuestDrawerProps {
  openDrawer: QuestId | null;
  setOpenDrawer: (value: QuestId | null) => void;
}

export const QuestDrawer: React.FC<QuestDrawerProps> = ({ setOpenDrawer, openDrawer }) => {
  const { telegram } = useTelegramContext();
  const { state, now, startQuest, claimQuest } = useGame();
  const [busy, setBusy] = useState(false);
  const quest = QUESTS.find((q) => q.id === openDrawer);
  const status = quest ? questStatus(state, quest.id, now) : null;

  const open = async (q: QuestDef) => {
    const url = questLink(q.id)!;
    const app = telegram?.WebApp;

    if (app && url.startsWith("https://t.me/")) app.openTelegramLink(url);
    else if (app) app.openLink(url);
    else window.open(url, "_blank", "noopener");
    await startQuest(q.id);
  };

  const claim = async (q: QuestDef) => {
    setBusy(true);
    const ok = await claimQuest(q.id);

    setBusy(false);
    if (ok) {
      telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      setOpenDrawer(null);
    }
  };

  return (
    <Sheet open={openDrawer !== null} title={quest?.title} onClose={() => setOpenDrawer(null)}>
      {quest && status && (
        <div className="flex flex-col gap-4 pb-1">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-ink-950/50 border border-ink-600">
            <Image alt="" className="w-14 h-14 rounded-2xl" src={QUEST_ICONS[quest.id]} />
            <div className="flex flex-col gap-1">
              <span className="text-caption font-extrabold tracking-[0.14em] text-parch-500">REWARD</span>
              <QuestRewards quest={quest} />
            </div>
          </div>

          {status.state === "claimed" ? (
            <Button disabled full icon="check" size="lg">
              Completed
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button full size="lg" variant={status.state === "new" ? "primary" : "secondary"} onClick={() => open(quest)}>
                {quest.id === "telegram" ? "Join the channel" : quest.id === "youtube" ? "Subscribe" : "Follow"}
              </Button>
              {status.state !== "new" && (
                <Button full disabled={status.state === "waiting"} loading={busy} size="lg" onClick={() => claim(quest)}>
                  {status.state === "waiting" ? `Claim in ${formatDuration(status.readyAt - now)}` : "Claim reward"}
                </Button>
              )}
              {status.state === "new" && <p className="text-center text-small text-parch-500">Do the task, then come back here to claim your reward.</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
