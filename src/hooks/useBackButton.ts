import { useTelegramContext } from "@/store/telegram/hook";
import { useEffect } from "react"

export default function useBackButton() {
  const { telegram, navigateTo } = useTelegramContext()

  useEffect(() => {
    telegram?.WebApp.onEvent("backButtonClicked", () =>
      navigateTo("/resources", "off")
    );
    return () => {
      telegram?.WebApp.offEvent("backButtonClicked", () => null);
    };
  }, []);
}