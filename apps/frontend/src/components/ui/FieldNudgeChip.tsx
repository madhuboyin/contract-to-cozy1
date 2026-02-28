import { cn } from "@/lib/utils";

type FieldNudgeVariant = "start" | "recommended" | "optional";

interface FieldNudgeChipProps {
  variant: FieldNudgeVariant;
  className?: string;
}

const labelByVariant: Record<FieldNudgeVariant, string> = {
  start: "Start here",
  recommended: "Recommended",
  optional: "Optional",
};

export default function FieldNudgeChip({ variant, className }: FieldNudgeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        variant === "start" && "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
        variant === "recommended" && "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
        variant === "optional" && "border-gray-300 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
        className,
      )}
    >
      {labelByVariant[variant]}
    </span>
  );
}
