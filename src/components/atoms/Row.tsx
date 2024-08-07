import React from "react";

interface RowProps {
  children: React.ReactNode;
  className?: string;
}

export const Row: React.FC<RowProps> = ({ children, className = "" }) => {
  return <div className={`flex flex-row ${className}`}>{children}</div>;
};
