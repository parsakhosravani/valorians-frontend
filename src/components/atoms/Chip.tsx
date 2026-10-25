import React from "react";

interface ChipProps {
  label: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error";
}

/** Level badge: a round gold coin with the number. */
export const Chip: React.FC<ChipProps> = ({ label }) => (
  <div className="min-w-7 h-7 px-1.5 rounded-full bg-gold text-[#1A120B] font-display font-black text-sm flex items-center justify-center shadow">
    {label}
  </div>
);
