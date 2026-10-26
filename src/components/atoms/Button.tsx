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
  type?: "button" | "submit";
}

/** The game's button, on the v2 .btn classes (gold = primary action, wood = secondary). */
export const Button: React.FC<ButtonProps> = ({
  onClick,
  children,
  variant = "primary",
  size = "medium",
  disabled = false,
  isFull = false,
  className,
  type = "button",
}) => (
  <button
    className={clsx(
      "btn",
      {
        "btn-gold": variant === "primary",
        "btn-wood": variant === "secondary",
        "btn-ghost": variant === "outline",
        "btn-ember": variant === "danger",
        "btn-sm": size === "small",
        "btn-lg": size === "large",
        "w-full": isFull,
      },
      className,
    )}
    disabled={disabled}
    type={type}
    onClick={onClick}
  >
    {children}
  </button>
);
