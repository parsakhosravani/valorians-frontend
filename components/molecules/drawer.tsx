import React, { ReactNode } from "react";
import { Button } from "../atoms/button";

type DrawerPosition = "bottom" | "right" | "left";

interface DrawerProps {
  isOpen: boolean;
  title: string;
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
  const positionClasses = {
    bottom: "inset-x-0 bottom-0 h-auto",
    right: "inset-y-0 right-0 w-64",
    left: "inset-y-0 left-0 w-64",
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />}
      <div
        className={`fixed bg-[#191F27] shadow-lg transition-transform duration-300 ease-in-out z-50 rounded-t-3xl ${
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
        <div className="p-4 relative">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold mb-4">{title}</h2>
            <Button onClick={onClose} size="small">
              X
            </Button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
};
