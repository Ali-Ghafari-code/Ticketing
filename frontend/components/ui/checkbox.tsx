import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, description, ...props }, ref) => (
  <label className={cn("inline-flex cursor-pointer items-start gap-2.5 text-sm", props.disabled && "opacity-60", className)}>
    <input
      ref={ref}
      type="checkbox"
      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-[rgb(var(--primary))]"
      {...props}
    />
    {(label || description) && (
      <span className="leading-6">
        {label}
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
    )}
  </label>
));
Checkbox.displayName = "Checkbox";
