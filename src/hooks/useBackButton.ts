import { useEffect } from "react";

import { useTelegramContext } from "@/context";

/** Shows Telegram's back button, which returns to the resources screen. */
export default function useBackButton() {
  const { telegram, navigateTo } = useTelegramContext();

  useEffect(() => {
    const app = telegram?.WebApp;

    if (!app) return;
    const onBack = () => navigateTo("/resources", "off");

    app.BackButton.show();
    app.onEvent("backButtonClicked", onBack);

    return () => {
      app.offEvent("backButtonClicked", onBack);
    };
  }, [telegram]);
}
