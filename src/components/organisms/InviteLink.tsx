"use client";
import { CopyToClipboard } from "react-copy-to-clipboard";
import React from "react";
import toast from "react-hot-toast";
import clsx from "clsx";

import { Button, Icon, IconButton } from "@/components/ui";
import { useGame, useTelegramContext } from "@/context";

interface InviteLinkProps {
  className?: string;
}

const SHARE_TEXT = `Join me in Valorians Legend! Build your tribe, gather resources, and battle for glory!

💰 Earn rewards
🏰 Create powerful tribes
⚔️ Engage in epic wars
👥 Invite friends for bonus rewards`;

export const inviteUrl = (code: string) =>
  `https://t.me/${process.env.NEXT_PUBLIC_BOT_ADDRESS}/${process.env.NEXT_PUBLIC_APP_SHORT_NAME || "start"}?startapp=${code}`;

export const InviteLink: React.FC<InviteLinkProps> = ({ className }) => {
  const { telegram } = useTelegramContext();
  const { me } = useGame();
  const link = inviteUrl(me.referralCode);
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(SHARE_TEXT)}`;

  const onShare = (e: React.MouseEvent) => {
    telegram?.WebApp.HapticFeedback.impactOccurred("soft");
    // Inside Telegram, open the share sheet natively instead of a browser tab.
    if (telegram?.WebApp?.openTelegramLink) {
      e.preventDefault();
      telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank", "noopener");
    }
  };

  return (
    <div className={clsx("flex w-full gap-2", className)}>
      <Button full icon="share" size="lg" onClick={onShare}>
        Invite a friend
      </Button>
      <CopyToClipboard
        text={link}
        onCopy={() => {
          telegram?.WebApp.HapticFeedback.impactOccurred("soft");
          toast.dismiss();
          toast.custom(
            () => (
              <div className="flex items-center gap-2 h-11 px-4 rounded-2xl bg-ink-700 border border-ink-400 shadow-raised text-parch font-bold">
                <Icon className="text-moss-400" name="check" size={18} />
                Invite link copied
              </div>
            ),
            { duration: 2000 }
          );
        }}
      >
        <IconButton className="!w-[52px] !h-[52px] !rounded-2xl" label="Copy invite link" name="copy" />
      </CopyToClipboard>
    </div>
  );
};

export default InviteLink;
