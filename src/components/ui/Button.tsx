import React from "react";

type ButtonVariant = "default" | "primary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "default", size = "md", className = "", children, ...rest },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
    const sizeCls =
      size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-sm";
    let palette = "";
    switch (variant) {
      case "primary":
        palette =
          "bg-[var(--accent)] border-[#2e7dd9] text-[#041423] hover:brightness-110";
        break;
      case "danger":
        palette =
          "bg-[var(--danger)] border-[#b24356] text-white hover:brightness-110";
        break;
      case "ghost":
        palette =
          "bg-transparent border-[#2a3444] text-[var(--fg)] hover:bg-[#0f151e]";
        break;
      default:
        palette =
          "bg-[var(--chip)] border-[#243040] text-[var(--fg)] hover:bg-[#233042]";
    }
    const cls = [base, sizeCls, palette, className].filter(Boolean).join(" ");
    return (
      <button ref={ref} className={cls} {...rest}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
