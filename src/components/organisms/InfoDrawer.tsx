"use client";
import React, { useState } from "react";

import { Button, Sheet } from "@/components/ui";
import { GameIcon } from "@/art";

interface InfoDrawerProps {
  title: string;
  content: React.ReactNode;
}

/** A small (i) button that explains something in a sheet. */
export const InfoDrawer: React.FC<InfoDrawerProps> = ({ title, content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button aria-label={`About ${title}`} className="shrink-0 rounded-full active:scale-95" type="button" onClick={() => setIsOpen(true)}>
        <GameIcon id="info" size={22} />
      </button>
      <Sheet open={isOpen} title={title} onClose={() => setIsOpen(false)}>
        <div className="flex flex-col gap-4 pt-1">
          <p className="text-body text-parch-300">{content}</p>
          <Button full onClick={() => setIsOpen(false)}>
            Got it
          </Button>
        </div>
      </Sheet>
    </>
  );
};
