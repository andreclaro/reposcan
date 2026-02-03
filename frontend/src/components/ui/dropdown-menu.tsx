"use client";

import * as React from "react";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      {children}
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const context = React.useContext(DropdownMenuContext);
  if (!context)
    throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    context.setOpen(!context.open);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
      onClick: handleClick,
    });
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

function DropdownMenuContent({
  children,
  className,
  align = "center",
  sideOffset = 4,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  const context = React.useContext(DropdownMenuContext);
  if (!context)
    throw new Error("DropdownMenuContent must be used within DropdownMenu");
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

  const alignClasses = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in",
        "top-full mt-1",
        alignClasses[align],
        className
      )}
      style={{ marginTop: sideOffset }}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({
  children,
  className,
  inset,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
  onClick?: () => void;
}) {
  const context = React.useContext(DropdownMenuContext);
  const handleClick = () => {
    onClick?.();
    context?.setOpen(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        inset && "pl-8",
        className
      )}
    >
      {children}
    </button>
  );
}

function DropdownMenuCheckboxItem({
  children,
  className,
  checked,
  onCheckedChange,
}: {
  children: React.ReactNode;
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const context = React.useContext(DropdownMenuContext);
  const handleClick = () => {
    onCheckedChange?.(!checked);
    context?.setOpen(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        className
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-4 w-4" />}
      </span>
      {children}
    </button>
  );
}

function DropdownMenuSeparator({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 my-1 h-px bg-muted", className)} />
  );
}

function DropdownMenuLabel({
  children,
  className,
  inset,
}: {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-sm font-semibold text-muted-foreground",
        inset && "pl-8",
        className
      )}
    >
      {children}
    </div>
  );
}

function DropdownMenuGroup({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-col">{children}</div>;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
};
