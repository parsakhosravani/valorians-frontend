import { useTelegramContext } from "@/context";
import { useEffect } from "react";

export default function useBackButtonReset() {
  const { telegram } = useTelegramContext();
  useEffect(() => {
    telegram?.WebApp.BackButton.hide();
  }, []);
}
