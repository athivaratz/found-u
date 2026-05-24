"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MotionProvider } from "@/components/motion/motion-provider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easeOut } from "@/lib/motion";

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  headerClassName?: string;
  storageKey?: string;
};

function CollapsibleSectionInner({
  title,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
  headerClassName,
  storageKey,
}: CollapsibleSectionProps) {
  const reduced = useReducedMotion();
  const [internalOpen, setInternalOpen] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) return stored === "true";
      } catch {
        /* ignore */
      }
    }
    return defaultOpen;
  });

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className={cn("border border-border-light rounded-xl overflow-hidden bg-bg-primary", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-4 py-3 text-left font-medium text-text-primary hover:bg-bg-secondary transition-colors",
          headerClassName
        )}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-text-tertiary shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: duration.normal, ease: easeOut }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-border-light">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CollapsibleSection(props: CollapsibleSectionProps) {
  return (
    <MotionProvider>
      <CollapsibleSectionInner {...props} />
    </MotionProvider>
  );
}
