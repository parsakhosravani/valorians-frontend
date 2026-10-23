"use client";
import { CopyToClipboard } from "react-copy-to-clipboard";
import React from "react";
import toast from "react-hot-toast";
import clsx from "clsx";

import { CopyIcon } from "@/components";
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
    }
  };

  return (
    <div className={clsx("flex w-full gap-x-2", className)}>
      <a
        className="bg-[#00A3FF] justify-center h-[44px] w-full rounded-[5px] gap-x-2 flex items-center"
        href={shareUrl}
        id="telegram_share"
        rel="noreferrer"
        target="_blank"
        title="inviteFriends"
        onClick={onShare}
      >
        <span className="text-white text-base font-bold">Invite a Friend</span>
      </a>

      <CopyToClipboard
        text={link}
        onCopy={() => {
          telegram?.WebApp.HapticFeedback.impactOccurred("soft");
          toast.dismiss();
          toast.custom(
            () => (
              <div className="w-[85%] h-11 px-1.5 py-2 bg-[#6393D439] rounded-[5px] justify-center items-center gap-1 inline-flex">
                <div className="text-white text-base font-bold leading-7">Copied Successfully</div>
              </div>
            ),
            {
              duration: 2000,
            }
          );
        }}
      >
        <button className="w-full bg-[#00A3FF] max-w-[44px] h-[44px] flex items-center rounded-[5px] justify-center">
          <CopyIcon />
        </button>
      </CopyToClipboard>
    </div>
  );
};

export default InviteLink;
