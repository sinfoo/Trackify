import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import type { BuyerDashboard as Dashboard } from "@/lib/types";
import { BuyerDashboard } from "./buyer-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
}));

const get = vi.fn();
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return { ...real, api: { ...real.api, get: (...a: unknown[]) => get(...a) } };
});

const PAID: Dashboard["orders"][number] = {
  order_id: "o1",
  order_reference: "ORD-1",
  order_status: "PAID",
  created_at: "2026-11-08T05:47:33Z",
  product: { id: "p1", slug: "fullstack", name: "Full-Stack Web Development", duration_weeks: 12, level: "Intermediate", category: "Development", learning_outcomes: ["Build React interfaces"] },
  amount: "1490.000",
  currency: "TND",
  enrollment_status: "ACTIVE",
  payment: { transaction_reference: "TXN-1", status: "SUCCEEDED", method: "sim_card_success", paid_at: "2026-11-08T05:47:47Z", failure_reason: null, session_id: "s1", checkout_open: false },
  progress: [{ key: "order", label: "Order placed", state: "done" }],
};
const ACCOUNT: Dashboard = {
  user: { id: "u1", full_name: "Yasmine Trabelsi", email: "buyer@demo.techx", is_buyer: true, is_seller: false, roles: ["BUYER"] },
  customer: null,
  recommended: [],
  library: [PAID],
  arriving: [],
  orders: [PAID],
  conversations: [],
  journey: { enrolled_product_ids: ["p1"], open_checkouts: [] },
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BuyerDashboard />
    </QueryClientProvider>,
  );

describe("BuyerDashboard route gate", () => {
  it("asks guests to sign in as a buyer and comes back to /account", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/me/account") throw new ApiError(401, "UNAUTHENTICATED", "Authentication required");
      return null;
    });
    renderPage();
    expect(await screen.findByText("Sign in to see your dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login?as=buyer&next=%2Faccount");
    expect(screen.getByRole("link", { name: "Create a buyer account" })).toHaveAttribute("href", "/register?as=buyer&next=%2Faccount");
  });

  it("tells staff-only accounts they cannot buy", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/me/account") throw new ApiError(403, "FORBIDDEN", "Missing permission: buyer:self");
      return null;
    });
    renderPage();
    expect(await screen.findByText("This account cannot buy programs")).toBeInTheDocument();
  });

  it("shows the library, orders and profile for a signed-in buyer", async () => {
    get.mockImplementation(async (path: string) => (path === "/me/account" ? ACCOUNT : null));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(screen.getAllByText("Full-Stack Web Development").length).toBeGreaterThan(1); // library card + order row
    expect(screen.getByText("Build React interfaces")).toBeInTheDocument();
    expect(screen.getByText("buyer@demo.techx")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start selling/ })).toHaveAttribute("href", "/register?as=seller");
    expect(screen.getByText(/hi Yasmine/)).toBeInTheDocument();
  });
});
