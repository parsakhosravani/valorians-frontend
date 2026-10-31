"use client";

import { RefObject, useLayoutEffect, useState } from "react";

/**
 * Height that makes a map end just above the bottom bar, so on a phone the
 * whole map is on screen and the page around it never needs scrolling (the
 * map takes every touch, so a page you can't see the end of is stuck).
 * Used by the war map and the village.
 */
export const useFillHeight = (box: RefObject<HTMLDivElement | null>, min = 300) => {
  const [h, setH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const page = el?.closest<HTMLElement>(".scrollable");

    if (!el || !page) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(page).paddingBottom) || 0;
      const top = el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
      // 16px: the page's own gap under the map.
      const next = Math.max(min, Math.floor(page.clientHeight - pad - top - 16));

      setH((old) => (old === next ? old : next));
    };

    measure();
    const ro = new ResizeObserver(measure);

    ro.observe(page);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [box, min]);

  return h;
};
