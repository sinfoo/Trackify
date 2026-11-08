import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "./command-palette";
import { NAV_ITEMS } from "./nav";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async (path: string) => {
      if (path === "/customers")
        return { items: [{ id: "c1", full_name: "Yasmine Ben Salah", email: "y@example.tn", journey_stage: "DECISION" }], total: 1, page: 1, page_size: 5 };
      if (path === "/workflows") return { items: [{ id: "w1", label: "Enrollment: Yasmine", state: "AWAITING_APPROVAL", customer_name: "Yasmine" }], total: 1, page: 1, page_size: 5 };
      return { items: [], total: 0, page: 1, page_size: 5 };
    }),
  },
  ApiError: class extends Error {},
}));

const renderPalette = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandPalette open onOpenChange={vi.fn()} pages={NAV_ITEMS} />
    </QueryClientProvider>,
  );

describe("CommandPalette", () => {
  it("lists pages first and moves the selection with the arrow keys", async () => {
    renderPalette();
    const input = await screen.findByRole("combobox", { name: "Search" });
    expect(await screen.findByRole("option", { name: /Yasmine Ben Salah/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Dashboard/ })).toHaveAttribute("aria-selected", "true");

    await userEvent.type(input, "{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: /Workflows/ })).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(NAV_ITEMS[2].href);
    expect(NAV_ITEMS[2].href).toBe("/workflows");
  });

  it("wraps from the first item to the last on ArrowUp", async () => {
    push.mockClear();
    renderPalette();
    const input = await screen.findByRole("combobox", { name: "Search" });
    await screen.findByRole("option", { name: /Yasmine Ben Salah/ });
    await userEvent.type(input, "{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
  });
});
