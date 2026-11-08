import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterForm, passwordStrength, registerSchema } from "./auth-forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
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
