"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, CircleAlert, Loader2, Lock, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FieldError, errorText, serverFieldErrors } from "@/features/payments/shared";

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
const STATUS_LABEL: Record<(typeof PRODUCT_STATUSES)[number], string> = { DRAFT: "Draft", ACTIVE: "Active", ARCHIVED: "Archived" };
// Catalogue values written by apps/api/app/seed.py; a product with another value keeps it as an extra option.
export const CATEGORIES = ["AI", "Data", "Security", "Development", "Business"];
export const LEVELS = ["Beginner", "Intermediate", "Advanced", "Executive"];

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const intString = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, `${label} must be a whole number`)
    .refine((v) => Number(v) >= min && Number(v) <= max, `${label} must be between ${min} and ${max}`);

// Money stays a string: validated by regex, sent as-is (backend quantizes to 3 decimals).
export const productSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(120, "120 characters max"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(80, "80 characters max")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, digits and single dashes only"),
  category: z.string().trim().min(1, "Category is required").max(60, "60 characters max"),
  summary: z.string().trim().min(1, "Summary is required").max(300, "300 characters max"),
  description: z.string(),
  price: z
    .string()
    .trim()
    .min(1, "Price is required")
    .regex(/^\d{1,9}(\.\d{1,3})?$/, "Use a positive amount with at most 3 decimals, e.g. 1290.000")
    .refine((v) => /[1-9]/.test(v), "Price must be greater than 0"),
  duration_weeks: intString("Duration", 1, 520),
  level: z.string().trim().min(1, "Level is required").max(30, "30 characters max"),
  learning_outcomes: z.string(),
  target_audience: z.string().max(300, "300 characters max"),
  keywords: z.string(),
  seats_total: intString("Seats", 1, 100000),
  status: z.enum(PRODUCT_STATUSES),
});
export type ProductValues = z.infer<typeof productSchema>;

/** Response of PATCH /products/{id}: a price change on an ACTIVE program is not applied, it opens an approval. */
export interface ProductSaveResponse extends Product {
  pending_approval?: { id: string; action: "CHANGE_PRICE"; new_price: string };
}

export const toValues = (p?: Product): ProductValues => ({
  name: p?.name ?? "",
  slug: p?.slug ?? "",
  category: p?.category ?? CATEGORIES[0],
  summary: p?.summary ?? "",
  description: p?.description ?? "",
  price: p?.price ?? "",
  duration_weeks: p ? String(p.duration_weeks) : "6",
  level: p?.level ?? LEVELS[0],
  learning_outcomes: p?.learning_outcomes.join("\n") ?? "",
  target_audience: p?.target_audience ?? "",
  keywords: p?.keywords.join(", ") ?? "",
  seats_total: p ? String(p.seats_total) : "20",
  status: (p?.status as ProductValues["status"]) ?? "DRAFT",
});

export const toBody = (v: ProductValues) => ({
  ...v,
  duration_weeks: Number(v.duration_weeks),
  seats_total: Number(v.seats_total),
  learning_outcomes: v.learning_outcomes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean),
  keywords: v.keywords
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

/** Footer CTA copy (prototype): edit → Save changes; new → Publish program when Active, else Save program. */
export const ctaLabel = (editing: boolean, status: ProductValues["status"]) => (editing ? "Save changes" : status === "ACTIVE" ? "Publish program" : "Save program");

/**
 * New / Edit program modal (prototype "Program modal"): 720px, radius 24, 2-column form,
 * prefix inputs, segmented status, footer note about price approvals.
 */
export function ProductModal({ open, product, onOpenChange }: { open: boolean; product?: Product; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[6vh] max-h-[88vh] w-[calc(100%-32px)] max-w-[720px] translate-y-0 sm:max-w-[720px] gap-0 overflow-y-auto rounded-[24px] p-0 data-open:zoom-in-95"
        aria-describedby={undefined}
      >
        {/* key remounts the form with fresh defaults per product */}
        {open && <ProductForm key={product?.id ?? "new"} product={product} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof ProductValues;

export function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [advanced, setAdvanced] = useState(false);
  const form = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues: toValues(product) });
  const { errors } = form.formState;
  const status = form.watch("status");
  const name = form.watch("name");
  const editing = !!product;

  const save = useMutation({
    mutationFn: (v: ProductValues) =>
      product ? api.patch<ProductSaveResponse>(`/products/${product.id}`, toBody(v)) : api.post<ProductSaveResponse>("/products", toBody(v)),
    onSuccess: (p, v) => {
      qc.invalidateQueries({ queryKey: qk.products });
      if (p.pending_approval) {
        const { id } = p.pending_approval;
        toast.success("Price change sent for approval", {
          description: `${p.name} stays at its current price until a second person approves.`,
          action: { label: "Open approval", onClick: () => router.push(`/approvals/${id}`) },
        });
      } else if (editing) toast.success("Program saved.");
      else toast.success(v.status === "ACTIVE" ? "Program published. The Sales agent can offer it now." : "Program saved as draft.");
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") {
        setAdvanced(true);
        form.setError("slug", { message: err.message });
        return;
      }
      const fields = serverFieldErrors(err);
      let mapped = false;
      for (const [k, msg] of Object.entries(fields)) {
        if (k in productSchema.shape) {
          form.setError(k as FieldName, { message: msg });
          if (["slug", "keywords", "description"].includes(k)) setAdvanced(true);
          mapped = true;
        }
      }
      if (!mapped) form.setError("root", { message: errorText(err) });
    },
  });

  const nameReg = form.register("name", {
    onChange: (e) => {
      if (!slugTouched) form.setValue("slug", slugify(e.target.value), { shouldValidate: form.formState.isSubmitted });
    },
  });
  const slugReg = form.register("slug", { onChange: () => setSlugTouched(true) });

  const invalid = (n: FieldName) => !!errors[n];
  const aria = (n: FieldName) => ({ id: `pf-${n}`, "aria-invalid": invalid(n) || undefined, "aria-describedby": errors[n] ? `pf-${n}-err` : undefined });
  const box = (n: FieldName) =>
    cn("flex min-w-0 items-center gap-2 rounded-xl border bg-input transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/35", invalid(n) ? "border-danger" : "border-hair2");

  const field = (n: FieldName, label: string, control: ReactNode, o: { hint?: string; span?: 1 | 2 } = {}) => (
    <div className={cn("grid min-w-0 content-start gap-1.5", o.span === 2 && "sm:col-span-2")}>
      <label htmlFor={`pf-${n}`} className="flex justify-between gap-2 text-[12.5px] font-bold text-t2">
        {label}
        {o.hint && <span className="font-medium text-t4">{o.hint}</span>}
      </label>
      {control}
      <FieldError id={`pf-${n}-err`} message={errors[n]?.message} />
    </div>
  );
  const input = (n: FieldName, o: { type?: string; placeholder?: string; prefix?: string; mono?: boolean; min?: number; reg?: ReturnType<typeof form.register> } = {}) => (
    <span className={cn(box(n), "h-11 px-3")}>
      {o.prefix && <span className="text-[13px] font-bold text-t4">{o.prefix}</span>}
      <input
        type={o.type ?? "text"}
        inputMode={o.type === "number" ? "decimal" : undefined}
        min={o.min}
        placeholder={o.placeholder}
        className={cn("min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-t4", o.mono && "num")}
        {...aria(n)}
        {...(o.reg ?? form.register(n))}
      />
    </span>
  );
  const select = (n: FieldName, options: string[]) => {
    const current = form.getValues(n) as string;
    const all = current && !options.includes(current) ? [current, ...options] : options;
    return (
      <span className={cn(box(n), "relative h-11")}>
        <select className="h-full w-full cursor-pointer appearance-none bg-transparent pr-9 pl-3 text-sm text-text outline-none [&>option]:bg-panel [&>option]:text-text" {...aria(n)} {...form.register(n)}>
          {all.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-[15px] text-t3" />
      </span>
    );
  };
  const area = (n: FieldName, rows: number, placeholder: string) => (
    <textarea
      rows={rows}
      placeholder={placeholder}
      className={cn(box(n), "block min-h-[72px] w-full resize-y px-3 py-2.5 text-sm leading-normal text-text outline-none placeholder:text-t4")}
      {...aria(n)}
      {...form.register(n)}
    />
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
      <div className="flex items-center gap-3.5 border-b border-hair px-6 py-5">
        <span aria-hidden className="grid size-[42px] shrink-0 place-items-center rounded-[14px] bg-c-sales-bg text-c-sales">
          <Package className="size-[19px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <DialogDescription className="eyebrow">{editing ? "Edit program" : "New program"}</DialogDescription>
          <DialogTitle className="block truncate">{editing ? name || "Program" : "Add a program to the catalog"}</DialogTitle>
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" className="size-[34px] rounded-[10px] bg-panel2 text-t2 hover:bg-panel3" onClick={onDone}>
          <X aria-hidden className="size-[15px]" />
        </Button>
      </div>

      <div className="grid gap-x-4 gap-y-3.5 px-6 py-5 sm:grid-cols-2">
        {field("name", "Program name", input("name", { placeholder: "e.g. Applied MLOps", reg: nameReg }), { span: 2 })}
        {field("category", "Category", select("category", CATEGORIES))}
        {field("level", "Level", select("level", LEVELS))}
        {field("duration_weeks", "Duration", input("duration_weeks", { type: "number", placeholder: "8", prefix: "weeks", min: 1, mono: true }))}
        {field("price", "Price", input("price", { type: "number", placeholder: "1190", prefix: "TND", min: 0, mono: true }), { hint: "server-side, agents cannot change it" })}
        {field("seats_total", "Seats", input("seats_total", { type: "number", placeholder: "25", prefix: "total", min: 1, mono: true }))}
        {field(
          "status",
          "Status",
          <div role="radiogroup" aria-label="Status" id="pf-status" className="inline-flex w-max rounded-xl border border-hair bg-panel2 p-[3px]">
            {PRODUCT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => form.setValue("status", s, { shouldDirty: true })}
                className={cn(
                  "h-[34px] rounded-[9px] px-3.5 text-[13px] font-bold transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:outline-none",
                  status === s ? "bg-text text-bg" : "text-t2 hover:text-text",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>,
        )}
        {field("summary", "Summary", area("summary", 2, "One or two sentences the Sales agent can quote."), { span: 2 })}
        {field("learning_outcomes", "Learning outcomes", area("learning_outcomes", 4, "Build a React front end\nDesign and secure an API"), { span: 2, hint: "one per line" })}
        {field("target_audience", "Who it is for", area("target_audience", 2, "Who should enroll and what they should already know."), { span: 2 })}

        <div className="sm:col-span-2">
          <button
            type="button"
            aria-expanded={advanced}
            aria-controls="pf-advanced"
            onClick={() => setAdvanced((a) => !a)}
            className="inline-flex h-8 items-center gap-1 text-[12.5px] font-bold text-t3 hover:text-text"
          >
            <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", advanced && "rotate-90")} /> Advanced
            <span className="font-medium text-t4"> · slug, keywords, long description</span>
          </button>
          <div id="pf-advanced" hidden={!advanced} className="mt-2 grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            {field("slug", "Slug", input("slug", { prefix: "/offers/", mono: true, reg: slugReg }), { hint: editing ? undefined : "generated from the name until you edit it" })}
            {field("keywords", "Keywords", input("keywords", { placeholder: "python, llm, agents" }), { hint: "comma separated, used by the Sales agent" })}
            {field("description", "Long description", area("description", 4, "Shown on the public program page."), { span: 2 })}
          </div>
        </div>
      </div>

      {(errors.root || (form.formState.isSubmitted && Object.keys(errors).length > 0)) && (
        <p role="alert" className="mx-6 flex items-center gap-2 rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
          <CircleAlert aria-hidden className="size-[15px] shrink-0" strokeWidth={2.2} />
          {errors.root?.message ?? "Fill in the highlighted fields."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-hair px-6 py-[18px]">
        <p className="flex min-w-[200px] flex-1 items-center gap-2 text-[12.5px] text-t3">
          <Lock aria-hidden className="size-[13px] shrink-0" />
          Price changes on an active program go through an approval. Agents read the catalog; they never write it.
        </p>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4 text-[13.5px] font-bold" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending} className="h-10 rounded-xl px-[18px] text-[13.5px]">
          {save.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden strokeWidth={2.6} />}
          {ctaLabel(editing, status)}
        </Button>
      </div>
    </form>
  );
}
