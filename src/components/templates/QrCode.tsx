import Image from "next/image";

import rqcode from "~/images/qr/qr-code.png";

import { Crest } from "./LoadingScreen";

import { Scene } from "@/art";

/** Shown outside Telegram's mobile app: the game is played on a phone. */
export const QrCode = () => {
  const bot = process.env.NEXT_PUBLIC_BOT_ADDRESS;

  return (
    <div className="fixed inset-0 max-w-md mx-auto overflow-hidden bg-ink-900 text-parch flex flex-col items-center justify-center px-6 text-center">
      <Scene className="absolute inset-0 w-full h-full" kind="night" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/30 to-ink-900/90" />
      <div className="relative flex flex-col items-center gap-3">
        <Crest className="w-16 h-16" />
        <h1 className="font-display font-extrabold text-display-xl tracking-[0.04em] text-gold-300">VALORIANS LEGEND</h1>
        <p className="text-parch-300">Play on your phone in Telegram</p>
        <a className="mt-2" href={`https://t.me/${bot}`}>
          <Image
            alt={`Open @${bot} in Telegram`}
            className="w-[180px] h-[180px] rounded-3xl border-2 border-gold-400 bg-white p-2 shadow-glow"
            height={180}
            src={rqcode}
            width={180}
          />
        </a>
        <a className="font-extrabold text-gold-300 text-lg" href={`https://t.me/${bot}`}>
          @{bot}
        </a>
        <p className="text-caption text-parch-500 mt-4">
          v{process.env.NEXT_PUBLIC_APP_VERSION} · build {process.env.NEXT_PUBLIC_BUILD_ID}
        </p>
      </div>
    </div>
  );
};
