import { Telegram } from "@twa-dev/types";
import { useEffect, useState } from "react"


export default function useMobilePlatform(telegram: Telegram | any) {
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    if (window) {
      // setIsMobile(
      //   telegram?.WebApp?.platform === "ios" ||
      //   telegram?.WebApp?.platform === "android" ||
      //   telegram?.WebApp?.platform === "android_x"
      // );
    }
  }, [telegram])

  return isMobile
}
