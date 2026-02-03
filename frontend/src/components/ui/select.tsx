"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}

const SelectContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function Select({
  children,
  value: controlledValue,
  onValueChange,
  defaultValue,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue || ""
  );
  const value = controlledValue ?? uncontrolledValue;

  const handleValueChange = (newValue: string) => {
    setUncontrolledValue(newValue);
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider
      value={{ value, onValueChange: handleValueChange, open, setOpen }}
    >
      {children}
    </SelectContext.Provider>
  );
}

function SelectTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(SelectContext);
  if (!context)
    throw new Error("SelectTrigger must be used within Select");

  return (
    <button
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
}

function SelectValue({
  placeholder,
}: {
  placeholder?: string;
}) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectValue must be used within Select");

  const [label, setLabel] = React.useState(placeholder);

  return <span className="truncate">{label || placeholder}</span>;
}

function SelectContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(SelectContext);
  if (!context)
    throw new Error("SelectContent must be used within Select");
  const { open, setOpen } = context;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 w-full min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in",
        "top-full mt-1",
        className
      )}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

function SelectItem({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: string;
  className?: string;
}) {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("SelectItem must be used within Select");

  const isSelected = context.value === value;

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </button>
  );
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
};
