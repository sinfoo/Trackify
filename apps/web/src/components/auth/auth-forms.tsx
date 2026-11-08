"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldError, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Crown,
  Eye,
  Globe,
  Lock,
  Mail,
  Mic,
  Moon,
  Phone,
  Shield,
  ShoppingBag,
  Sun,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useTrackifyTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { BuyerFlags, User } from "@/lib/types";
import { resumeBuyerIntent } from "@/features/public/api";
import { cn } from "@/lib/utils";

export const DEMO_PASSWORD = "Demo!2026";
/** Login chips: role label + the agent colour pair of the matching agent (Super admin = brand). */
export const DEMO_ACCOUNTS: { email: string; role: string; icon: LucideIcon; color: string }[] = [
  { email: "admin@demo.techx", role: "Super admin", icon: Crown, color: "sales" },
  { email: "finance@demo.techx", role: "Finance", icon: CreditCard, color: "payment" },
  { email: "security@demo.techx", role: "Security", icon: Shield, color: "security" },
  { email: "sales@demo.techx", role: "Sales", icon: Mic, color: "intelligence" },
  { email: "viewer@demo.techx", role: "Viewer", icon: Eye, color: "human" },
  { email: "buyer@demo.techx", role: "Buyer", icon: ShoppingBag, color: "strategy" },
];

export const FIELDS_OF_ACTIVITY = [
  "Education & training",
  "FinTech & banking",
  "E-commerce & retail",
  "SaaS & software",
  "Healthcare",
  "Consulting & services",
  "Other",
];
export const SIGNUP_ROLES = [
  { v: "owner", l: "Business owner" },
  { v: "finance", l: "Finance" },
  { v: "security", l: "Security" },
  { v: "sales", l: "Sales" },
  { v: "viewer", l: "Viewer" },
] as const;
export const TEAM_SIZES = ["Just me", "2-10", "11-50", "51-200", "200+"];

const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");
const required = (msg: string) => z.string().trim().min(1, msg);
const newPassword = z.string().min(8, "At least 8 characters");

export const loginSchema = z.object({ email, password: z.string().min(1, "Password is required") });
export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name"),
    email,
    business_name: required("Enter your business name"),
    field_of_activity: required("Choose your field"),
    role: z.enum(["owner", "finance", "security", "sales", "viewer"]),
    team_size: required("Choose a team size"),
    country: required("Enter your country"),
    phone: z.string().trim(),
    password: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
/** Short buyer sign-up: name, email, password, confirm. */
export const buyerRegisterSchema = z
  .object({ full_name: z.string().trim().min(2, "Enter your full name"), email, password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password: newPassword.regex(/\d/, "Include at least one digit"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/** `?as=buyer|seller`: which side the visitor came from (buyer gate, "Start selling"). */
type Side = "buyer" | "seller" | null;
const sideOf = (p: URLSearchParams): Side => (p.get("as") === "buyer" ? "buyer" : p.get("as") === "seller" ? "seller" : null);
const withSide = (href: string, p: URLSearchParams) => {
  const q = new URLSearchParams();
  for (const k of ["as", "next"]) if (p.get(k)) q.set(k, p.get(k)!);
  const s = q.toString();
  return s ? `${href}?${s}` : href;
};

/**
 * Where to go once signed in: finish an interrupted enroll (links the guest chat first), else `?next=`, else the
 * side the account has: buyers-only to /account, sellers to /dashboard.
 */
export async function destinationAfterSignIn(next: string | null): Promise<string> {
  const resumed = await resumeBuyerIntent().catch(() => null);
  if (resumed) return resumed;
  if (next) return safeNext(next);
  const flags = await api.get<BuyerFlags>("/me/flags", { noAuthRedirect: true }).catch(() => null);
  return flags && !flags.is_seller ? "/account" : "/dashboard";
}

/** 4 bands above "Too short": length 8+, then +1 for a digit, mixed case, symbol or 12+ chars. */
export function passwordStrength(pw: string): { label: string; pct: number; color: string } {
  if (pw.length < 8) return { label: "Too short", pct: pw ? 10 : 0, color: "var(--danger)" };
  let s = 0;
  if (/\d/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return [
    { label: "Weak", pct: 25, color: "var(--danger)" },
    { label: "Fair", pct: 50, color: "var(--warning)" },
    { label: "Good", pct: 75, color: "var(--brand)" },
    { label: "Strong", pct: 100, color: "var(--success)" },
  ][s];
}

function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "RATE_LIMITED") return "Too many attempts. Wait a few minutes and try again.";
    return e.message;
  }
  return "Could not reach the server. Try again.";
}

// ---------- prototype auth primitives (inline styles in Trackify.dc.html are the spec) ----------

/** Label 13/700 --t2 + 48px r14 --input box with a leading 16px --t4 icon; focus = amber ring, error = danger border. */
function FieldShell({
  id,
  label,
  optional,
  span = 2,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  span?: 1 | 2;
  error?: FieldError;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" style={{ gridColumn: `span ${span}` }}>
      <label htmlFor={id} className="text-[13px] font-bold text-t2">
        {label}
        {optional && <span className="font-medium text-t4"> · optional</span>}
      </label>
      {children}
      {hint}
      {error && (
        <p id={`${id}-error`} className="text-[12.5px] font-semibold text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}

const boxClass = (error?: FieldError) =>
  cn(
    "relative flex h-12 min-w-0 items-center gap-2.5 rounded-[14px] border bg-input px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/35",
    error ? "border-danger" : "border-hair",
  );

function TextField({
  id,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  autoComplete,
  optional,
  span,
  reg,
  error,
  hint,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  optional?: boolean;
  span?: 1 | 2;
  reg: UseFormRegisterReturn;
  error?: FieldError;
  hint?: ReactNode;
}) {
  return (
    <FieldShell id={id} label={label} optional={optional} span={span} error={error} hint={hint}>
      <span className={boxClass(error)}>
        <Icon aria-hidden className="size-4 shrink-0 text-t4" />
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-text outline-none"
          {...reg}
        />
      </span>
    </FieldShell>
  );
}

/** Native select in the same 48px box (prototype uses a bare <select>, chevron-down 15px --t3 at right 14). */
function SelectField({
  id,
  label,
  icon: Icon,
  options,
  placeholder,
  value,
  span,
  reg,
  error,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  options: readonly { v: string; l: string }[];
  placeholder?: string;
  value: string;
  span?: 1 | 2;
  reg: UseFormRegisterReturn;
  error?: FieldError;
}) {
  return (
    <FieldShell id={id} label={label} span={span} error={error}>
      <span className={boxClass(error)}>
        <Icon aria-hidden className="size-4 shrink-0 text-t4" />
        <select
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn("h-full min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent pr-6 text-[14.5px] outline-none", value ? "text-text" : "text-t4")}
          {...reg}
        >
          {placeholder && (
            <option value="" disabled style={{ color: "#0F1A33" }}>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.v} value={o.v} style={{ color: "#0F1A33" }}>
              {o.l}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 size-[15px] text-t3" />
      </span>
    </FieldShell>
  );
}

/** 4px bar in --panel3 + 11.5/700 label, both coloured by the band. */
function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <span className="flex items-center gap-1" aria-live="polite">
      <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-panel3">
        <span className="block h-full transition-[width,background-color] duration-300" style={{ width: `${s.pct}%`, background: s.color }} />
      </span>
      <span className="min-w-14 text-right text-[11.5px] font-bold" style={{ color: s.color }}>
        {s.label}
      </span>
    </span>
  );
}

/** Danger box: r12, --danger-bg + --danger border, 10px 12px, 13/600, rowIn .25s. */
function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 flex items-center gap-2 rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger"
      style={{ animation: "rowIn .25s both" }}
    >
      <CircleAlert aria-hidden className="size-[15px] shrink-0" strokeWidth={2.2} />
      {message}
    </p>
  );
}

/** Success box: r20, --success-bg + --success border, 16px, icon 20. */
function SuccessBox({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div role="status" className="mt-[22px] flex gap-3 rounded-[20px] border border-success bg-success-bg p-4 text-success">
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2.2} />
      <p className="text-sm leading-normal">{children}</p>
    </div>
  );
}

function AuthThemeToggle() {
  const { toggle } = useTrackifyTheme();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-[11px] border border-hair bg-panel text-t2 [&_svg]:size-[15px]"
    >
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </button>
  );
}

/** 50px r15 amber CTA with the arrow, 0 10px 28px amber shadow, lifts 1px on hover. */
function Cta({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <Button
      type="submit"
      disabled={busy}
      className="mt-[18px] h-[50px] w-full gap-2 rounded-[15px] text-[15px] font-extrabold hover:brightness-100 [&_svg]:size-4"
      style={{ boxShadow: "0 10px 28px rgba(245,166,35,.3)" }}
    >
      {children}
      <ArrowRight aria-hidden strokeWidth={2.4} />
    </Button>
  );
}

/** Right column card: theme toggle row, 30/800 title, 14.5 --t3 description, then the form body. */
function AuthCard({
  width = 420,
  title,
  description,
  links,
  children,
}: {
  width?: 420 | 560;
  title: string;
  description: ReactNode;
  links?: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="w-full" style={{ maxWidth: width, animation: "rise .45s cubic-bezier(.2,.8,.2,1) both" }}>
      <div className="flex justify-end">
        <AuthThemeToggle />
      </div>
      <h2 className="mt-[18px] text-[30px] leading-[1.2] font-extrabold tracking-[-0.03em]">{title}</h2>
      <p className="mt-1.5 text-[14.5px] text-t3">{description}</p>
      {children}
      {links && links.length > 0 && (
        <div className="mt-3.5 flex justify-between text-[13.5px] font-bold">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const FieldGrid = ({ children }: { children: ReactNode }) => <div className="mt-[22px] grid grid-cols-2 gap-x-3 gap-y-3.5">{children}</div>;

// ---------- forms ----------

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  // Sent here by the route guard (app-shell / fetch layer): say why.
  const side = sideOf(params);
  const guarded = params.get("reason") === "guard" || params.has("next");
  const [formError, setFormError] = useState<string | null>(
    guarded ? (side === "buyer" ? "Sign in or create a buyer account to continue." : "Sign in to open the console.") : null,
  );
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const current = useWatch({ control, name: "email" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await api.post<User>("/auth/login", values);
      qc.setQueryData(qk.me, user);
      router.replace(await destinationAfterSignIn(params.get("next")));
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  const quickFill = (addr: string) => {
    setValue("email", addr, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  };

  const notice = params.get("registered")
    ? "Account created. Sign in to continue."
    : params.get("reset")
      ? "Password updated. Sign in with your new password."
      : null;

  return (
    <AuthCard
      title="Sign in"
      description={side === "buyer" ? "Buy programs, follow your enrollments and keep your receipts." : "Operations console for the agent team."}
      links={[
        { href: "/forgot-password", label: "Forgot password?" },
        { href: withSide("/register", params), label: side === "buyer" ? "Create a buyer account" : "Create an account" },
      ]}
    >
      {notice && <SuccessBox icon={CircleCheck}>{notice}</SuccessBox>}
      <form onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <TextField id="email" label="Email" icon={Mail} type="email" placeholder="you@company.com" autoComplete="email" reg={register("email")} error={errors.email} />
          <TextField id="password" label="Password" icon={Lock} type="password" placeholder="Your password" autoComplete="current-password" reg={register("password")} error={errors.password} />
        </FieldGrid>
        <FormError message={formError} />
        <Cta busy={isSubmitting}>{isSubmitting ? "Signing in" : "Sign in"}</Cta>
      </form>
      <div className="mt-7 border-t border-hair pt-5">
        <p className="text-[13px] font-extrabold">Demo accounts</p>
        <p className="mt-0.5 text-[12.5px] text-t3">
          Click to fill. Password <span className="mono text-text">{DEMO_PASSWORD}</span>
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => {
            const on = current === a.email;
            return (
              <button
                key={a.email}
                type="button"
                onClick={() => quickFill(a.email)}
                aria-label={`Fill ${a.role} demo account ${a.email}`}
                aria-pressed={on}
                className={cn(
                  "inline-flex h-9 items-center gap-[7px] rounded-full border py-0 pr-3 pl-1.5 text-[13px] font-bold text-text transition-all duration-200 hover:bg-panel3",
                  on ? "border-hair2 bg-panel3" : "border-hair bg-panel2",
                )}
              >
                <span className="grid size-6 place-items-center rounded-lg" style={{ background: `var(--c-${a.color}-bg)`, color: `var(--c-${a.color})` }}>
                  <a.icon aria-hidden className="size-3" strokeWidth={2.4} />
                </span>
                {a.role}
              </button>
            );
          })}
        </div>
      </div>
    </AuthCard>
  );
}

/** `/register`: short buyer form for `?as=buyer`, the business (seller) form otherwise. */
export function RegisterForm() {
  const params = useSearchParams();
  return sideOf(params) === "buyer" ? <BuyerRegisterForm /> : <SellerRegisterForm />;
}

export function BuyerRegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof buyerRegisterSchema>>({
    resolver: zodResolver(buyerRegisterSchema),
    defaultValues: { full_name: "", email: "", password: "", confirm: "" },
  });
  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit(async ({ full_name, email, password }) => {
    setFormError(null);
    try {
      // The API signs the new buyer in (cookies).
      const user = await api.post<User>("/auth/register", { full_name, email, password, role: "buyer" });
      qc.setQueryData(qk.me, user);
      toast.success(`Welcome, ${user.full_name.trim().split(/\s+/)[0] || user.full_name}.`);
      router.replace(await destinationAfterSignIn(params.get("next")));
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Create your buyer account"
      description="Enroll in programs, follow each enrollment and keep your receipts in one place."
      links={[
        { href: withSide("/login", params), label: "Already have an account? Sign in" },
        { href: "/register?as=seller", label: "Selling? Business account" },
      ]}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <TextField id="full_name" label="Full name" icon={UserIcon} placeholder="Yasmine Trabelsi" autoComplete="name" reg={register("full_name")} error={errors.full_name} />
          <TextField id="email" label="Email" icon={Mail} type="email" placeholder="you@example.com" autoComplete="email" reg={register("email")} error={errors.email} />
          <TextField
            id="password"
            label="Password"
            icon={Lock}
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            span={1}
            reg={register("password")}
            error={errors.password}
            hint={<StrengthMeter password={password} />}
          />
          <TextField id="confirm" label="Confirm password" icon={Lock} type="password" placeholder="Repeat it" autoComplete="new-password" span={1} reg={register("confirm")} error={errors.confirm} />
        </FieldGrid>
        <FormError message={formError} />
        <p className="mt-3 text-[12.5px] leading-normal text-t3">Payments are simulated: no card details, no real money. Confirmations are posted in your conversation.</p>
        <Cta busy={isSubmitting}>{isSubmitting ? "Creating account" : "Create buyer account"}</Cta>
      </form>
    </AuthCard>
  );
}

export function SellerRegisterForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: "", email: "", business_name: "", field_of_activity: "", role: "owner", team_size: "", country: "", phone: "", password: "", confirm: "" },
  });
  const [password, field, role, team] = useWatch({ control, name: ["password", "field_of_activity", "role", "team_size"] });

  const onSubmit = handleSubmit(async (values) => {
    const body = { ...values, confirm: undefined };
    setFormError(null);
    try {
      // The API signs the new user in (cookies) and echoes the business name.
      const user = await api.post<User & { business_name: string }>("/auth/register", body);
      qc.setQueryData(qk.me, user);
      const first = user.full_name.trim().split(/\s+/)[0] || user.full_name;
      toast.success(`Welcome, ${first}. ${user.business_name || body.business_name} is set up.`);
      router.replace("/dashboard");
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      width={560}
      title="Create your account"
      description="Set up your business console. The owner account gets full access; teammates get the role you pick."
      links={[
        { href: "/login", label: "Already have an account? Sign in" },
        { href: "/register?as=buyer", label: "Just here to learn? Buyer account" },
      ]}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <TextField id="full_name" label="Full name" icon={UserIcon} placeholder="Amira Dridi" autoComplete="name" span={1} reg={register("full_name")} error={errors.full_name} />
          <TextField id="email" label="Work email" icon={Mail} type="email" placeholder="you@company.com" autoComplete="email" span={1} reg={register("email")} error={errors.email} />
          <TextField id="business_name" label="Business name" icon={Building2} placeholder="TECHX Academy" autoComplete="organization" span={1} reg={register("business_name")} error={errors.business_name} />
          <SelectField
            id="field_of_activity"
            label="Field of activity"
            icon={Briefcase}
            placeholder="Select a field"
            options={FIELDS_OF_ACTIVITY.map((f) => ({ v: f, l: f }))}
            value={field}
            span={1}
            reg={register("field_of_activity")}
            error={errors.field_of_activity}
          />
          <SelectField id="role" label="Your role" icon={BadgeCheck} options={SIGNUP_ROLES} value={role} span={1} reg={register("role")} error={errors.role} />
          <SelectField
            id="team_size"
            label="Team size"
            icon={Users}
            placeholder="Select a size"
            options={TEAM_SIZES.map((t) => ({ v: t, l: t }))}
            value={team}
            span={1}
            reg={register("team_size")}
            error={errors.team_size}
          />
          <TextField id="country" label="Country" icon={Globe} placeholder="Tunisia" autoComplete="country-name" span={1} reg={register("country")} error={errors.country} />
          <TextField id="phone" label="Phone" icon={Phone} type="tel" placeholder="+216 20 000 000" autoComplete="tel" optional span={1} reg={register("phone")} error={errors.phone} />
          <TextField
            id="password"
            label="Password"
            icon={Lock}
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            span={1}
            reg={register("password")}
            error={errors.password}
            hint={<StrengthMeter password={password} />}
          />
          <TextField id="confirm" label="Confirm password" icon={Lock} type="password" placeholder="Repeat it" autoComplete="new-password" span={1} reg={register("confirm")} error={errors.confirm} />
        </FieldGrid>
        <FormError message={formError} />
        <p className="mt-3 text-[12.5px] leading-normal text-t3">
          By creating an account you agree to the demo terms. Prices are set server-side and every risky action waits for a human decision.
        </p>
        <Cta busy={isSubmitting}>{isSubmitting ? "Creating account" : "Create account"}</Cta>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/auth/forgot-password", values);
      setSent(true);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Reset your password" description="Enter your work email and we will send a reset link." links={[{ href: "/login", label: "Back to sign in" }]}>
      {sent ? (
        <>
          <SuccessBox icon={Mail}>
            <span className="font-extrabold">Check your inbox.</span> If an account exists for that email, a reset link is on its way.
          </SuccessBox>
          <p className="mt-2.5 text-[12.5px] leading-normal text-t3">No mail leaves this demo: the reset link is written to the API server log.</p>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FieldGrid>
            <TextField id="email" label="Work email" icon={Mail} type="email" placeholder="you@company.com" autoComplete="email" reg={register("email")} error={errors.email} />
          </FieldGrid>
          <FormError message={formError} />
          <Cta busy={isSubmitting}>Send reset link</Cta>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      router.replace("/login?reset=1");
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  if (!token)
    return (
      <AuthCard title="Invalid link" description="This reset link is missing its token. Request a new one." links={[{ href: "/forgot-password", label: "Request a new link" }]}>
        <span />
      </AuthCard>
    );

  return (
    <AuthCard title="Choose a new password" description="At least 8 characters with one digit." links={[{ href: "/login", label: "Back to sign in" }]}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <TextField
            id="password"
            label="New password"
            icon={Lock}
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            reg={register("password")}
            error={errors.password}
            hint={<StrengthMeter password={password} />}
          />
          <TextField id="confirm" label="Confirm password" icon={Lock} type="password" placeholder="Repeat it" autoComplete="new-password" reg={register("confirm")} error={errors.confirm} />
        </FieldGrid>
        <FormError message={formError} />
        <Cta busy={isSubmitting}>Update password</Cta>
      </form>
    </AuthCard>
  );
}
