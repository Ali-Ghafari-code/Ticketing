import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 " +
  "transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-[invalid=true]:border-danger " +
  "aria-[invalid=true]:focus:ring-danger/20";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  endSlot?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, endSlot, invalid, ...props }, ref) => {
    if (!icon && !endSlot) {
      return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, "h-10", className)} {...props} />;
    }
    return (
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(inputBase, "h-10", icon && "ps-9", endSlot && "pe-10", className)}
          {...props}
        />
        {endSlot && <span className="absolute inset-y-0 end-1.5 flex items-center">{endSlot}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(inputBase, "min-h-[96px] py-2 leading-7", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
