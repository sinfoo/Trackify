"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { FieldError, errorText, selectClass, serverFieldErrors } from "@/features/payments/shared";

export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

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
    .regex(/^\d{1,9}(\.\d{1,3})?$/, "Use a positive amount with at most 3 decimals, e.g. 1290.000")
    .refine((v) => /[1-9]/.test(v), "Price must be greater than 0"),
  duration_weeks: intString("Duration", 1, 520),
  level: z.string().trim().min(1, "Level is required").max(30, "30 characters max"),
  learning_outcomes: z.string(),
  target_audience: z.string().max(300, "300 characters max"),
  keywords: z.string(),
  seats_total: intString("Seats", 0, 100000),
  status: z.enum(PRODUCT_STATUSES),
});
export type ProductValues = z.infer<typeof productSchema>;

const toValues = (p?: Product): ProductValues => ({
  name: p?.name ?? "",
  slug: p?.slug ?? "",
  category: p?.category ?? "",
  summary: p?.summary ?? "",
  description: p?.description ?? "",
  price: p?.price ?? "",
  duration_weeks: p ? String(p.duration_weeks) : "",
  level: p?.level ?? "",
  learning_outcomes: p?.learning_outcomes.join("\n") ?? "",
  target_audience: p?.target_audience ?? "",
  keywords: p?.keywords.join(", ") ?? "",
  seats_total: p ? String(p.seats_total) : "",
  status: (p?.status as ProductValues["status"]) ?? "DRAFT",
});

const toBody = (v: ProductValues) => ({
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

/** Create (product undefined) or edit a product in a side panel. */
export function ProductSheet({
  open,
  product,
  onOpenChange,
}: {
  open: boolean;
  product?: Product;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{product ? `Edit ${product.name}` : "New product"}</SheetTitle>
          <SheetDescription>Prices are in TND with up to 3 decimals.</SheetDescription>
        </SheetHeader>
        {/* key remounts the form with fresh defaults per product */}
        {open && <ProductForm key={product?.id ?? "new"} product={product} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

type FieldName = keyof ProductValues;

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const qc = useQueryClient();
  const [slugTouched, setSlugTouched] = useState(!!product);
  const form = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues: toValues(product) });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (v: ProductValues) =>
      product ? api.patch<Product>(`/products/${product.id}`, toBody(v)) : api.post<Product>("/products", toBody(v)),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: qk.products });
      toast.success(product ? `Saved ${p.name}` : `Created ${p.name}`);
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") {
        form.setError("slug", { message: err.message });
        return;
      }
      const fields = serverFieldErrors(err);
      let mapped = false;
      for (const [k, msg] of Object.entries(fields)) {
        if (k in productSchema.shape) {
          form.setError(k as FieldName, { message: msg });
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

  const field = (name: FieldName, label: string, input: ReactNode, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pf-${name}`}>{label}</Label>
      {input}
      {hint && !errors[name] && (
        <p id={`pf-${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={`pf-${name}-err`} message={errors[name]?.message} />
    </div>
  );
  const aria = (name: FieldName, hint?: boolean) => ({
    id: `pf-${name}`,
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": errors[name] ? `pf-${name}-err` : hint ? `pf-${name}-hint` : undefined,
  });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 gap-4 overflow-y-auto p-4">
        {field("name", "Name", <Input {...aria("name")} {...nameReg} />)}
        {field("slug", "Slug", <Input className="num" {...aria("slug", true)} {...slugReg} />, product ? undefined : "Generated from the name until you edit it.")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("category", "Category", <Input {...aria("category")} {...form.register("category")} />)}
          {field(
            "level",
            "Level",
            <>
              <Input list="pf-levels" {...aria("level")} {...form.register("level")} />
              <datalist id="pf-levels">
                {LEVELS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </>,
          )}
        </div>
        {field("summary", "Summary", <Textarea rows={2} {...aria("summary")} {...form.register("summary")} />)}
        {field("description", "Description", <Textarea rows={4} {...aria("description")} {...form.register("description")} />)}
        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            "price",
            "Price (TND)",
            <Input inputMode="decimal" className="num" placeholder="1290.000" {...aria("price")} {...form.register("price")} />,
          )}
          {field(
            "duration_weeks",
            "Duration (weeks)",
            <Input inputMode="numeric" className="num" {...aria("duration_weeks")} {...form.register("duration_weeks")} />,
          )}
          {field(
            "seats_total",
            "Seats total",
            <Input inputMode="numeric" className="num" {...aria("seats_total")} {...form.register("seats_total")} />,
          )}
        </div>
        {field(
          "learning_outcomes",
          "Learning outcomes",
          <Textarea rows={4} {...aria("learning_outcomes", true)} {...form.register("learning_outcomes")} />,
          "One per line.",
        )}
        {field("target_audience", "Target audience", <Textarea rows={2} {...aria("target_audience")} {...form.register("target_audience")} />)}
        {field("keywords", "Keywords", <Input {...aria("keywords", true)} {...form.register("keywords")} />, "Comma separated.")}
        {field(
          "status",
          "Status",
          <select className={selectClass} {...aria("status")} {...form.register("status")}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>,
        )}
        {errors.root && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger-text">
            {errors.root.message}
          </p>
        )}
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 aria-hidden className="animate-spin" />}
          {product ? "Save changes" : "Create product"}
        </Button>
      </SheetFooter>
    </form>
  );
}
