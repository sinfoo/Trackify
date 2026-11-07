"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, type FieldError, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { User } from "@/lib/types";

export const DEMO_PASSWORD = "Demo!2026";
export const DEMO_ACCOUNTS = [
  { email: "admin@demo.techx", role: "Super admin" },
  { email: "finance@demo.techx", role: "Finance" },
  { email: "security@demo.techx", role: "Security" },
  { email: "sales@demo.techx", role: "Sales" },
  { email: "viewer@demo.techx", role: "Viewer" },
];

const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");
const newPassword = z.string().min(8, "At least 8 characters");

export const loginSchema = z.object({ email, password: z.string().min(1, "Password is required") });
export const registerSchema = z
  .object({ full_name: z.string().trim().min(2, "Enter your full name"), email, password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "RATE_LIMITED") return "Too many attempts. Wait a few minutes and try again.";
    return e.message;
  }
  return "Could not reach the server. Try again.";
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  reg,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  reg: UseFormRegisterReturn;
  error?: FieldError;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-10 text-base"
        {...reg}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-text">
          {error.message}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger-text">
      {message}
    </p>
  );
}

function Heading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await api.post<User>("/auth/login", values);
      qc.setQueryData(qk.me, user);
      router.replace(safeNext(params.get("next")));
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  const quickFill = (addr: string) => {
    setValue("email", addr, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <>
      <Heading title="Sign in" description="Operations console for the agent team." />
      {(params.get("registered") || params.get("reset")) && (
        <p role="status" className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-text">
          {params.get("registered") ? "Account created. Sign in to continue." : "Password updated. Sign in with your new password."}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" reg={register("email")} error={errors.email} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          reg={register("password")}
          error={errors.password}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-info-text hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-info-text hover:underline">
          Create account
        </Link>
      </div>
      <div className="mt-6 border-t pt-5">
        <p className="mb-2 text-sm font-medium">Demo accounts</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Click to fill. Password <span className="num">{DEMO_PASSWORD}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => quickFill(a.email)}
              aria-label={`Fill ${a.role} demo account ${a.email}`}
              className="rounded-full border bg-secondary px-3 py-1 text-sm font-medium transition-colors duration-150 ease-out hover:bg-accent"
            >
              {a.role}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async ({ full_name, email, password }) => {
    setFormError(null);
    try {
      await api.post("/auth/register", { full_name, email, password });
      router.replace("/login?registered=1");
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <>
      <Heading title="Create account" description="New accounts start with read-only access." />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="full_name" label="Full name" autoComplete="name" reg={register("full_name")} error={errors.full_name} />
        <Field id="email" label="Email" type="email" autoComplete="email" reg={register("email")} error={errors.email} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" reg={register("password")} error={errors.password} />
        <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" reg={register("confirm")} error={errors.confirm} />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? "Creating account" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-info-text hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/auth/forgot-password", values);
      setSent(true);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  if (sent)
    return (
      <div className="text-center">
        <CircleCheck aria-hidden className="mx-auto mb-3 size-8 text-success-text" />
        <Heading title="Check your inbox" description="If an account exists for that email, a reset link is on its way." />
        <Link href="/login" className="text-sm text-info-text hover:underline">
          Back to sign in
        </Link>
      </div>
    );

  return (
    <>
      <Heading title="Reset password" description="We will email you a reset link." />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" reg={register("email")} error={errors.email} />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="mt-4 inline-block text-sm text-info-text hover:underline">
        Back to sign in
      </Link>
    </>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

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
      <>
        <Heading title="Invalid link" description="This reset link is missing its token. Request a new one." />
        <Link href="/forgot-password" className="text-sm text-info-text hover:underline">
          Request a new link
        </Link>
      </>
    );

  return (
    <>
      <Heading title="Choose a new password" />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="password" label="New password" type="password" autoComplete="new-password" reg={register("password")} error={errors.password} />
        <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" reg={register("confirm")} error={errors.confirm} />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={isSubmitting}>
          Update password
        </Button>
      </form>
    </>
  );
}
