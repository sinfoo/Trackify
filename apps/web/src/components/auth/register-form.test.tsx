import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterForm, buyerRegisterSchema, passwordStrength, registerSchema } from "./auth-forms";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
}));
beforeEach(() => {
  search = new URLSearchParams();
});
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RegisterForm />
    </QueryClientProvider>,
  );

const valid = {
  full_name: "Nour Ben Ali",
  email: "nour@acme.tn",
  business_name: "Acme Academy",
  field_of_activity: "Education & training",
  role: "owner",
  team_size: "2-10",
  country: "Tunisia",
  phone: "",
  password: "Strong!2026",
  confirm: "Strong!2026",
};

describe("registerSchema", () => {
  it("accepts a complete business owner", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
  it("requires every field except phone", () => {
    for (const k of ["full_name", "email", "business_name", "field_of_activity", "team_size", "country", "password"] as const) {
      expect(registerSchema.safeParse({ ...valid, [k]: "", ...(k === "password" ? { confirm: "" } : {}) }).success, k).toBe(false);
    }
  });
  it("rejects short or mismatched passwords", () => {
    expect(registerSchema.safeParse({ ...valid, password: "Short1!", confirm: "Short1!" }).success).toBe(false);
    const r = registerSchema.safeParse({ ...valid, confirm: "Different1!" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["confirm"]);
  });
});

describe("passwordStrength", () => {
  it("walks the four bands above Too short", () => {
    expect(passwordStrength("abc").label).toBe("Too short");
    expect(passwordStrength("abcdefgh").label).toBe("Weak");
    expect(passwordStrength("abcdefg1").label).toBe("Fair");
    expect(passwordStrength("Abcdefg1").label).toBe("Good");
    expect(passwordStrength("Abcdefg1!").label).toBe("Strong");
  });
});

describe("RegisterForm", () => {
  it("shows inline errors and skips the API on an empty submit", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter your business name")).toBeInTheDocument();
    expect(screen.getByText("Choose your field")).toBeInTheDocument();
    expect(screen.getByText("Choose a team size")).toBeInTheDocument();
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("flags a confirm mismatch and updates the strength meter", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Password"), "Abcdefg1!");
    expect(screen.getByText("Strong")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Confirm password"), "Abcdefg1?");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
  });
});

describe("RegisterForm as=buyer", () => {
  it("renders the short buyer form without the business fields", () => {
    search = new URLSearchParams("as=buyer&next=%2Fassistant");
    renderForm();
    expect(screen.getByRole("heading", { name: "Create your buyer account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Business name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Your role/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create buyer account" })).toBeInTheDocument();
    // The sign-in link keeps the side and the return address.
    expect(screen.getByRole("link", { name: /Already have an account/ })).toHaveAttribute("href", "/login?as=buyer&next=%2Fassistant");
  });

  it("posts role buyer with only name, email and password", async () => {
    search = new URLSearchParams("as=buyer");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "u1", full_name: "Nour Ben Ali", email: "nour@example.tn", roles: ["BUYER"] }), { status: 200 }));
    renderForm();
    await userEvent.type(screen.getByLabelText("Full name"), "Nour Ben Ali");
    await userEvent.type(screen.getByLabelText("Email"), "nour@example.tn");
    await userEvent.type(screen.getByLabelText("Password"), "Strong!2026");
    await userEvent.type(screen.getByLabelText("Confirm password"), "Strong!2026");
    await userEvent.click(screen.getByRole("button", { name: "Create buyer account" }));
    const call = f.mock.calls.find(([url]) => String(url).endsWith("/auth/register"));
    expect(call).toBeTruthy();
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ full_name: "Nour Ben Ali", email: "nour@example.tn", password: "Strong!2026", role: "buyer" });
    f.mockRestore();
  });

  it("buyerRegisterSchema needs name, email and a matching 8+ password", () => {
    const ok = { full_name: "Nour Ben Ali", email: "nour@example.tn", password: "Strong!2026", confirm: "Strong!2026" };
    expect(buyerRegisterSchema.safeParse(ok).success).toBe(true);
    expect(buyerRegisterSchema.safeParse({ ...ok, full_name: "N" }).success).toBe(false);
    expect(buyerRegisterSchema.safeParse({ ...ok, confirm: "other" }).success).toBe(false);
  });
});
