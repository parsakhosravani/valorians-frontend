import React from "react";

interface ChipProps {
  label: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error";
}

/** Level badge: a round gold coin with the number. */
export const Chip: React.FC<ChipProps> = ({ label }) => (
  <div
    className="min-w-7 h-7 px-1.5 rounded-full text-[#1A120B] font-display font-black text-sm flex items-center justify-center border border-goldhi"
    style={{
      background: "linear-gradient(180deg, #F6CC72 0%, #E3A948 60%, #C98C2E 100%)",
      boxShadow: "0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,245,210,0.7)",
    }}
  >
    {label}
  </div>
);
