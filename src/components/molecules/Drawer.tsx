"use client";
import React, { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { IconText } from "@/components/atoms/GameIcon";
import { useBackHandler } from "@/hooks/useBackHandler";

type DrawerPosition = "bottom" | "right" | "left";

interface DrawerProps {
  isOpen: boolean;
  title?: string;
  position: DrawerPosition;
  children: ReactNode;
  onClose: () => void;
}

/**
 * Sheet that slides in over the whole app. It is rendered into <body>
 * through a portal: inside the scrolling <main>, iOS traps fixed elements
 * under the bottom navigation bar and the sheet only peeks out.
 *
 * No backdrop blur: on Android WebViews, blurring whatever is underneath (the
 * war map, with its moving armies) every frame made the sheet flicker and
 * drop whole parts of itself.
 */
export const Drawer: React.FC<DrawerProps> = ({ position, children, isOpen, title, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  // Telegram's back button closes the sheet (the newest one, when several are open).
  useBackHandler(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const positionClasses = {
    bottom: "inset-x-0 bottom-0 h-auto rounded-t-3xl",
    right: "inset-y-0 right-0 w-64",
    left: "inset-y-0 left-0 w-64",
  };
  const hidden = {
    bottom: "translate-y-full",
    right: "translate-x-full",
    left: "-translate-x-full",
  };

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={clsx(
          "fixed inset-0 bg-black/70 z-[100] transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        aria-modal="true"
        className={clsx(
          "fixed max-w-md mx-auto w-full transition-transform duration-300 ease-out z-[101] shadow-raised",
          positionClasses[position],
          isOpen ? "translate-x-0 translate-y-0" : hidden[position]
        )}
        role="dialog"
        style={{ background: "linear-gradient(180deg, #2A1F16 0%, #1E1610 22%, #171009 100%)" }}
      >
        {/* Gold trim along the top edge */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px] rounded-t-3xl"
          style={{ background: "linear-gradient(90deg, rgba(227,169,72,0) 0%, #E3A948 20%, #FBE3A6 50%, #E3A948 80%, rgba(227,169,72,0) 100%)" }}
        />
        <div
          className="px-4 pt-2.5 relative max-h-[85svh] overflow-y-auto scrollable overscroll-contain"
          style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          {position === "bottom" && <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-line" />}
          <div className="flex justify-between items-center gap-3 min-h-[28px]">
            <h2 className="font-display text-[19px] font-black text-goldtext leading-tight">
              {title && <IconText text={title} />}
            </h2>
            <button
              aria-label="Close"
              className="shrink-0 w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-muted bg-ink/50 border border-line active:scale-95"
              type="button"
              onClick={onClose}
            >
              <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" viewBox="0 0 14 14" width="14">
                <path d="M2 2l10 10M12 2 2 12" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </>,
    document.body
  );
};
