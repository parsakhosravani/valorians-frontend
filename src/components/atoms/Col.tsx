import React from "react";

interface ColProps {
  children: React.ReactNode;
  className?: string;
}

export const Col: React.FC<ColProps> = ({ children, className = "" }) => {
  return <div className={`flex flex-col ${className}`}>{children}</div>;
};
