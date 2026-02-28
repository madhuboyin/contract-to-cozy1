export type FieldSize = "xs" | "sm" | "md" | "lg" | "full";

export function fieldSizeClass(size: FieldSize): string {
  switch (size) {
    case "xs":
      return "w-full max-w-[140px]";
    case "sm":
      return "w-full max-w-[200px]";
    case "md":
      return "w-full max-w-[360px]";
    case "lg":
      return "w-full max-w-[520px]";
    case "full":
    default:
      return "w-full";
  }
}
