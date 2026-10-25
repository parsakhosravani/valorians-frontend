import Image from "next/image";

import rqcode from "~/images/qr/qr-code.png";
import bg from "~/images/background/battle.webp";

/** Shown outside Telegram's mobile app: the game is played on a phone. */
export const QrCode = () => {
  const bot = process.env.NEXT_PUBLIC_BOT_ADDRESS;

  return (
    <div className="fixed inset-0 max-w-md mx-auto overflow-hidden bg-ground text-parch flex flex-col items-center justify-center px-6 text-center">
      <Image priority alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" src={bg} />
      <div className="absolute inset-0 bg-gradient-to-b from-ground/40 to-ground" />
      <div className="relative flex flex-col items-center gap-3">
        <h1 className="font-display font-black text-3xl tracking-[0.06em] text-goldtext">VALORIANS LEGEND</h1>
        <p className="text-sub">Play on your phone in Telegram</p>
        <a className="mt-2" href={`https://t.me/${bot}`}>
          <Image
            alt={`Open @${bot} in Telegram`}
            className="w-[180px] h-[180px] rounded-2xl border-2 border-gold bg-white p-2"
            height={180}
            src={rqcode}
            width={180}
          />
        </a>
        <a className="font-extrabold text-goldtext text-lg" href={`https://t.me/${bot}`}>
          @{bot}
        </a>
        <p className="text-xs text-muted mt-4">
          v{process.env.NEXT_PUBLIC_APP_VERSION} · build {process.env.NEXT_PUBLIC_BUILD_ID}
        </p>
      </div>
    </div>
  );
};
