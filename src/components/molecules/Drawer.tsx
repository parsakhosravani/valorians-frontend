"use client";
import React, { ReactNode, useEffect, useRef } from "react";
import { CloseIcon } from "@/components";

type DrawerPosition = "bottom" | "right" | "left";

interface DrawerProps {
  isOpen: boolean;
  title?: string;
  position: DrawerPosition;
  children: ReactNode;
  onClose: () => void;
}

export const Drawer: React.FC<DrawerProps> = ({
  position,
  children,
  isOpen,
  title,
  onClose,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node) &&
        isOpen
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const positionClasses = {
    bottom: "inset-x-0 bottom-0 h-auto",
    right: "inset-y-0 right-0 w-64",
    left: "inset-y-0 left-0 w-64",
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />}
      <div
        ref={drawerRef}
        className={`fixed bg-[#191F27] max-w-md mx-auto w-full shadow-lg transition-transform duration-300 ease-in-out z-50 rounded-t-3xl ${
          positionClasses[position]
        } ${
          isOpen
            ? "transform translate-y-0 translate-x-0"
            : position === "bottom"
            ? "transform translate-y-full"
            : position === "right"
            ? "transform translate-x-full"
            : "transform -translate-x-full"
        }`}
      >
        <div className="p-4 relative border-t-2 border-[#019AF0] rounded-t-3xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">{title}</h2>
            <CloseIcon onClick={onClose} />
          </div>
          {children}
        </div>
      </div>
    </>
  );
};
