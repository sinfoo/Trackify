import { cn } from "@/lib/utils";

/** Pretty JSON inside a native disclosure. Collapsed by default; nothing to render for empty values. */
export function JsonBlock({ value, label = "Output JSON", open, className }: { value: unknown; label?: string; open?: boolean; className?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <details open={open} className={cn("group rounded-lg border bg-muted/40", className)}>
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted-foreground select-none hover:text-foreground">
        {label}
      </summary>
      <pre className="num max-h-80 overflow-auto border-t px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
