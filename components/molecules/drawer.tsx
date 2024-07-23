import React, { ReactNode } from "react";

type DrawerPosition = "bottom" | "right" | "left";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  position: DrawerPosition;
  children: ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  position,
  children,
}) => {
  const positionClasses = {
    bottom: "inset-x-0 bottom-0 h-auto",
    right: "inset-y-0 right-0 w-64",
    left: "inset-y-0 left-0 w-64",
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed bg-[#191F27] shadow-lg transition-transform duration-300 ease-in-out z-50 ${
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
        <div className="p-4">{children}</div>
      </div>
    </>
  );
};
