import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ProgressStep } from "@/lib/types";
import { ProgressTracker } from "./progress-tracker";

const HELD: ProgressStep[] = [
  { key: "order", label: "Order placed", state: "done" },
  { key: "payment", label: "Payment", state: "held", detail: "A person is reviewing this payment" },
  { key: "seat", label: "Seat confirmed", state: "pending" },
  { key: "welcome", label: "Welcome pack sent", state: "pending" },
  { key: "cohort", label: "Cohort starts", state: "upcoming" },
];
const PAID: ProgressStep[] = HELD.map((s) => (s.key === "cohort" ? s : { ...s, state: "done", detail: s.key === "payment" ? "690.000 TND · TXN-1" : undefined }));

const states = () => screen.getAllByRole("listitem").map((li) => li.dataset.state);

describe("ProgressTracker", () => {
  it("renders a held enrollment: done, held (with detail), pending, upcoming", () => {
    render(<ProgressTracker steps={HELD} />);
    expect(states()).toEqual(["done", "held", "pending", "pending", "upcoming"]);
    const payment = screen.getAllByRole("listitem")[1];
    expect(within(payment).getByText("Payment")).toBeInTheDocument();
    expect(within(payment).getByText("A person is reviewing this payment")).toBeInTheDocument();
    expect(within(payment).getByText(", held for review")).toBeInTheDocument();
  });

  it("renders a paid enrollment: everything done except the upcoming cohort", () => {
    render(<ProgressTracker steps={PAID} />);
    expect(states()).toEqual(["done", "done", "done", "done", "upcoming"]);
    expect(screen.getByText("690.000 TND · TXN-1")).toBeInTheDocument();
    expect(screen.getAllByText(", done")).toHaveLength(4);
  });
});
