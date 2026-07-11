"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormStep = {
  id: string;
  label: string;
};

type FormStepperProps = {
  steps: FormStep[];
  currentStep: number;
  className?: string;
};

const STEP_COLUMN_CLASS = "w-[4.25rem] sm:w-[5.5rem]";

export function FormStepper({ steps, currentStep, className }: FormStepperProps) {
  return (
    <nav aria-label="ขั้นตอนฟอร์ม" className={cn("w-full max-w-lg mx-auto md:max-w-none", className)}>
      <ol className="flex w-full items-start">
        {steps.map((step, index) => {
          const done = index < currentStep;
          const active = index === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn("flex items-start min-w-0", !isLast && "flex-1")}
            >
              <div
                className={cn(
                  "flex flex-col items-center shrink-0",
                  STEP_COLUMN_CLASS
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold shrink-0 transition-colors",
                    done && "bg-line-green text-white",
                    active && !done && "bg-line-green-light text-line-green ring-2 ring-line-green",
                    !done && !active && "bg-bg-tertiary text-text-tertiary"
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "mt-2 w-full text-center text-[11px] sm:text-xs font-medium leading-snug px-0.5 break-words",
                    active ? "text-line-green" : "text-text-tertiary"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    "h-0.5 flex-1 min-w-[0.75rem] mx-1 sm:mx-2 rounded-full self-start mt-[18px]",
                    index < currentStep ? "bg-line-green" : "bg-border-light"
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type FormStepperActionsProps = {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  nextLabel?: string;
  submitLabel?: string;
  backLabel?: string;
  isSubmitting?: boolean;
  nextDisabled?: boolean;
  className?: string;
  children?: ReactNode;
};

export function FormStepperActions({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  nextLabel = "ถัดไป",
  submitLabel = "ส่ง",
  backLabel = "ย้อนกลับ",
  isSubmitting = false,
  nextDisabled = false,
  className,
  children,
}: FormStepperActionsProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      className={cn(
        "sticky z-20 -mx-4 px-4 pt-3 pb-3",
        "bottom-[var(--bottom-nav-height)] md:static md:bottom-auto md:mx-0 md:px-0 md:py-0",
        "bg-bg-secondary/95 backdrop-blur-sm border-t border-border-light md:border-0 md:bg-transparent md:backdrop-blur-none",
        className
      )}
    >
      <div className="flex gap-3 max-w-lg mx-auto md:max-w-none">
        {!isFirst && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1 min-h-11 py-2.5 rounded-xl font-medium border border-border-light text-text-secondary hover:bg-bg-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
          >
            {backLabel}
          </button>
        )}
        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || nextDisabled}
            className={cn(
              "min-h-11 py-2.5 rounded-xl font-semibold text-white bg-line-green hover:bg-line-green-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
              isFirst ? "w-full" : "flex-[2]"
            )}
          >
            {isSubmitting ? "กำลังส่ง..." : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSubmitting}
            className={cn(
              "min-h-11 py-2.5 rounded-xl font-semibold text-white bg-line-green hover:bg-line-green-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
              isFirst ? "w-full" : "flex-[2]"
            )}
          >
            {nextLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
