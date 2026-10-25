import React from "react";
import clsx from "clsx";

interface ButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  isFull?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  onClick,
  children,
  variant = "primary",
  size = "medium",
  disabled = false,
  isFull = false,
  className,
}) => {
  return (
    <button
      className={clsx(
        "rounded-[10px] font-extrabold transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-goldtext",
        {
          "bg-gold text-[#1A120B] font-display": variant === "primary",
          "bg-panel2 text-parch border border-line": variant === "secondary",
          "bg-transparent border border-gold text-goldtext": variant === "outline",
          "bg-ember text-[#FFF4EA] font-display": variant === "danger",
          "h-8 px-3 text-sm": size === "small",
          "h-10 px-4 text-[15px]": size === "medium",
          "h-12 px-6 text-base": size === "large",
          "w-full": isFull,
          "!bg-panel2 !text-muted border border-line cursor-not-allowed active:scale-100": disabled,
        },
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
