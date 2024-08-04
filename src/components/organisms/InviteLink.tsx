"use client";
import { CopyToClipboard } from "react-copy-to-clipboard";
import Image from "next/image";
import React from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { CopyIcon } from "../atoms";
import clsx from "clsx";
import { useTelegramContext } from "@/context";

interface InviteLinkProps {
  className?: string;
}

export const InviteLink: React.FC<InviteLinkProps> = ({ className }) => {
  const { telegram, userProfile } = useTelegramContext();

  return (
    <div className={clsx("flex w-full gap-x-2", className)}>
      <Link
        href={`https://t.me/share/url?url=${`https://t.me/${process?.env?.NEXT_PUBLIC_BOT_ADDRESS}/start?startapp=${userProfile.user.referral_code}`}&text=${`Join me in Valorians Legend! Build your tribe, gather resources, and battle for glory! %0A%0A💰 Earn rewards %0A%0A🏰 Create powerful tribes %0A%0A⚔️ Engage in epic wars %0A%0A👥 Invite friends for bonus rewards`}`}
        id="telegram_share"
        className="bg-[#00A3FF] justify-center h-[44px] w-full rounded-[5px] gap-x-2 flex items-center"
        title="inviteFriends"
        onClick={() => telegram?.HapticFeedback.impactOccurred("soft")}
      >
        <span className="text-white text-base font-bold">Invite a Friend</span>
      </Link>

      <CopyToClipboard
        text={`https://t.me/${process?.env?.NEXT_PUBLIC_BOT_ADDRESS}/start?startapp=${userProfile?.user?.referral_code}`}
        onCopy={() => {
          telegram?.WebApp.HapticFeedback.impactOccurred("soft");
          toast.dismiss();
          toast.custom(
            (t) => (
              <div className="w-[85%] h-11 px-1.5 py-2 bg-[#6393D439] rounded-[5px] justify-center items-center gap-1 inline-flex">
                <div className="text-white text-base font-bold leading-7">
                  Copied Successfully
                </div>
              </div>
            ),
            {
              duration: 2000,
            }
          );
        }}
      >
        <div className="w-full bg-[#00A3FF] max-w-[44px] max-h-[44px] flex items-center rounded-[5px] justify-center">
          <CopyIcon />
        </div>
      </CopyToClipboard>
    </div>
  );
};

export default InviteLink;
