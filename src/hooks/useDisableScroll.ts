import { useEffect } from "react"

export default function useDisableScroll(disable: boolean) {
  useEffect(() => {
    if (disable) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [disable])
}
