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
        variant === "start" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
        variant === "recommended" && "border-black/10 bg-gray-100 text-gray-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300",
        variant === "optional" && "border-black/10 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400",
        className,
      )}
    >
      {labelByVariant[variant]}
    </span>
  );
}
