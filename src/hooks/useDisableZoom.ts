import { useEffect } from "react"

export default function useDisableZoom() {
  useEffect(() => {
    document.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    document.addEventListener("keydown", (event) => {
      if (
        event.ctrlKey &&
        (event.key === "+" || event.key === "-" || event.key === "0")
      ) {
        event.preventDefault();
      }
    });
  }, [])
}
