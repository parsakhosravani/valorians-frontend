import { useTelegramContext } from "@/store/telegram/hook";
import { useEffect } from "react"

export default function useBackButtonReset() {
  const { telegram } = useTelegramContext()
  useEffect(() => {
    telegram?.WebApp.BackButton.hide();
  }, []);
}