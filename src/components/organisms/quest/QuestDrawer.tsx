"use client";
import { useState } from "react";
import { StaticImageData } from "next/image";

import telegramIcon from "~/images/social/telegram.png";
import youtubeIcon from "~/images/social/youtube.png";
import xIcon from "~/images/social/x.png";
import population from "~/images/resources/population.webp";

import { Button, Coin, Col, Row, Text } from "@/components";
import { Drawer, TextImage } from "@/components/molecules";
import { useGame, useTelegramContext } from "@/context";
import { QUESTS, QuestDef, QuestId, questUrl } from "@/lib/game/config";
import { questStatus } from "@/lib/game/engine";
import { formatDuration } from "@/lib/format";

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
    <Drawer isOpen={openDrawer !== null} position="bottom" onClose={() => setOpenDrawer(null)}>
      {quest && status && (
        <Col className="gap-4 pb-2">
          <Row className="justify-center">
            <TextImage
              direction="column"
              imgAlt={quest.title}
              imgSrc={QUEST_ICONS[quest.id]}
              size="large"
              title={quest.title}
            />
          </Row>
          <Row className="justify-center items-center gap-3">
            <Coin amount={quest.reward.coins} />
            <TextImage imgAlt="population" imgSrc={population} size="small" title={`+${quest.reward.population}`} />
            <TextImage
              imgAlt="population growth"
              imgSrc={population}
              size="small"
              title={`+${quest.reward.growth}/h`}
            />
          </Row>

          {status.state === "claimed" ? (
            <Button isFull disabled size="large">
              Completed ✓
            </Button>
          ) : (
            <Col className="gap-2">
              <Button isFull size="large" variant={status.state === "new" ? "primary" : "outline"} onClick={() => open(quest)}>
                {quest.id === "telegram" ? "Join" : quest.id === "youtube" ? "Subscribe" : "Follow"}
              </Button>
              {status.state !== "new" && (
                <Button
                  isFull
                  disabled={busy || status.state === "waiting"}
                  size="large"
                  onClick={() => claim(quest)}
                >
                  {status.state === "waiting"
                    ? `Claim in ${formatDuration(status.readyAt - now)}`
                    : "Claim Reward"}
                </Button>
              )}
              {status.state === "new" && (
                <Text className="text-center" color="gray" size="small">
                  Complete the task, then come back to claim your reward.
                </Text>
              )}
            </Col>
          )}
        </Col>
      )}
    </Drawer>
  );
};
