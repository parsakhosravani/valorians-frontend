"use client";
import React, { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { CloseIcon } from "@/components";
import { IconText } from "@/components/atoms/GameIcon";

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
 */
export const Drawer: React.FC<DrawerProps> = ({ position, children, isOpen, title, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
          "fixed inset-0 bg-black/55 z-[100] transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        aria-modal="true"
        className={clsx(
          "fixed bg-[#1E1610] max-w-md mx-auto w-full shadow-lg transition-transform duration-300 ease-in-out z-[101]",
          positionClasses[position],
          isOpen ? "translate-x-0 translate-y-0" : hidden[position]
        )}
        role="dialog"
      >
        <div
          className="px-4 pt-4 relative border-t-2 border-gold rounded-t-3xl max-h-[85svh] overflow-y-auto scrollable overscroll-contain"
          style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          <div className="flex justify-between items-center gap-3">
            <h2 className="font-display text-xl font-bold">{title && <IconText text={title} />}</h2>
            <CloseIcon className="shrink-0 cursor-pointer" onClick={onClose} />
          </div>
          {children}
        </div>
      </div>
    </>,
    document.body
  );
};
