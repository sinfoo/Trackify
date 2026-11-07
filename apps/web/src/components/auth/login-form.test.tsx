import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginForm, safeNext } from "./auth-forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoginForm />
    </QueryClientProvider>,
  );

describe("LoginForm", () => {
  it("shows validation errors and does not call the API on empty submit", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
  });

  it("quick-fills a demo account", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /Finance demo account/ }));
    expect(screen.getByLabelText("Email")).toHaveValue("finance@demo.techx");
    expect(screen.getByLabelText("Password")).toHaveValue("Demo!2026");
  });
});

describe("safeNext", () => {
  it("only allows same-origin paths", () => {
    expect(safeNext("/payments?x=1")).toBe("/payments?x=1");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});
