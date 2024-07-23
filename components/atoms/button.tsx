import React from "react";

interface ButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  isFull?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  onClick,
  children,
  variant = "primary",
  size = "medium",
  disabled = false,
  isFull = false,
}) => {
  const baseClasses =
    "font-bold rounded focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";

  const variantClasses = {
    primary: "bg-[#019AF0] text-white hover:bg-[#019AF0] focus:ring-[#019AF0]",
    secondary:
      "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500",
    outline:
      "bg-transparent border border-[#019AF0] text-[#019AF0] hover:bg-[#019AF0] focus:ring-[#019AF0]",
  };

  const sizeClasses = {
    small: "px-3 py-1 text-sm",
    medium: "px-4 py-2",
    large: "px-6 py-3 text-lg",
  };

  const disabledClasses = "opacity-50 cursor-not-allowed";
  const fullClasses = "w-full";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${disabled ? disabledClasses : ""}
        ${isFull ? fullClasses : ""}
      `}
    >
      {children}
    </button>
  );
};
