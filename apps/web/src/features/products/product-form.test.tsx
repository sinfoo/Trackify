import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductModal, ctaLabel, productSchema, slugify, toBody, toValues } from "./product-form";
import type { Product } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }));

const patch = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { patch: (...a: unknown[]) => patch(...a), post: (...a: unknown[]) => post(...a) },
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const active: Product = {
  id: "p1",
  slug: "applied-mlops",
  name: "Applied MLOps",
  category: "AI",
  summary: "Ship models to production.",
  description: "",
  price: "1890.000",
  currency: "TND",
  duration_weeks: 8,
  level: "Advanced",
  learning_outcomes: ["Deploy a model", "Monitor drift"],
  target_audience: "ML engineers",
  seats_total: 25,
  seats_left: 18,
  status: "ACTIVE",
  keywords: ["mlops", "python"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  stats: { revenue: "13230.000", sales: 7, seats_taken: 7 },
};

const renderForm = (product?: Product) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProductModal open product={product} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );

describe("productSchema", () => {
  it("rejects the empty form on every required field", () => {
    const r = productSchema.safeParse({ ...toValues(), name: "", price: "", duration_weeks: "", seats_total: "", summary: "", slug: "" });
    expect(r.success).toBe(false);
    const fields = new Set(r.error!.issues.map((i) => i.path[0]));
    expect(fields).toEqual(new Set(["name", "slug", "summary", "price", "duration_weeks", "seats_total"]));
  });

  it("enforces the prototype number rules: weeks and seats at least 1, price positive with 3 decimals max", () => {
    const base = { ...toValues(active) };
    expect(productSchema.safeParse({ ...base, duration_weeks: "0" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, seats_total: "0" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: "0" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: "-5" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: "1190.1234" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: "1190.5" }).success).toBe(true);
  });

  it("splits outcomes per line and keywords per comma, slug from the name", () => {
    const body = toBody({ ...toValues(active), learning_outcomes: " A \n\nB\n", keywords: "x, y,,z " });
    expect(body.learning_outcomes).toEqual(["A", "B"]);
    expect(body.keywords).toEqual(["x", "y", "z"]);
    expect(body.duration_weeks).toBe(8);
    expect(slugify("Génie Logiciel & DevOps!")).toBe("genie-logiciel-devops");
  });

  it("picks the footer label from mode and status", () => {
    expect(ctaLabel(true, "DRAFT")).toBe("Save changes");
    expect(ctaLabel(false, "ACTIVE")).toBe("Publish program");
    expect(ctaLabel(false, "DRAFT")).toBe("Save program");
  });
});

describe("ProductModal", () => {
  it("marks required fields invalid and shows the summary error instead of submitting", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Save program" }));
    expect(await screen.findByText("Fill in the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByLabelText("Program name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Price/)).toHaveAttribute("aria-invalid", "true");
    expect(post).not.toHaveBeenCalled();
  });

  it("toasts the approval link when a price change on an active program returns pending_approval", async () => {
    patch.mockResolvedValueOnce({ ...active, pending_approval: { id: "apr-1", action: "CHANGE_PRICE", new_price: "2100.000" } });
    renderForm(active);
    const price = screen.getByLabelText(/^Price/);
    await userEvent.clear(price);
    await userEvent.type(price, "2100");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/products/p1", expect.objectContaining({ price: "2100", status: "ACTIVE" })));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Price change sent for approval", expect.anything()));
    const opts = toastSuccess.mock.calls.at(-1)![1] as { action: { onClick: () => void } };
    opts.action.onClick();
    expect(push).toHaveBeenCalledWith("/approvals/apr-1");
  });
});
