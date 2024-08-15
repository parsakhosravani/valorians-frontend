import React from "react";

interface ChipProps {
  label: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error";
}

export const Chip: React.FC<ChipProps> = ({ label, color = "primary" }) => {
  const baseClasses = "inline-flex items-center px-2 w";

  const colorClasses = {
    primary: "bg-[#374D6A] text-white",
    secondary: "bg-[#212F42] text-white",
    success: "bg-green-500 text-white",
    warning: "bg-yellow-500 text-white",
    error: "bg-[#F72214] text-white",
  };

  return (
    <div
      className={`text-xs w-4 h-5 text-center justify-center text-[#B5C7DE] rounded-b-lg font-bold ${baseClasses} ${colorClasses[color]}`}
    >
      {label}
    </div>
  );
};
