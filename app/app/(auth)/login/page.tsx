"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";

type Mode = "password" | "link" | "signup" | "forgot";

const COPY: Record<Mode, { title: string; hint: string; submit: string; busy: string }> = {
  password: { title: "Sign in", hint: "Use your email and password.", submit: "Sign in", busy: "Signing in…" },
  link: { title: "Sign in", hint: "We'll email you a sign-in link. No password needed.", submit: "Email me a sign-in link", busy: "Sending…" },
  signup: { title: "Create your account", hint: "Free while we're in early access.", submit: "Create account", busy: "Creating…" },
  forgot: { title: "Reset your password", hint: "We'll email you a link to set a new one.", submit: "Email me a reset link", busy: "Sending…" },
};

const MIN_PASSWORD = 10;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "password");
  const next = safeNext(params.get("redirectTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That link didn't work. It may have expired, so request a new one." : null
  );
  const copy = COPY[mode];

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
  }

  /** Email links come back through /auth/callback, which sets the session and continues to `to`. */
  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const auth = createSupabaseBrowserClient().auth;

    if (mode === "password") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) return fail(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      router.replace(next);
      router.refresh();
      return;
    }
    if (mode === "signup") {
      if (password.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters.`);
      const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } });
      if (error) return fail(error.message);
      // No session means the project wants the email confirmed first
      if (!data.session) return setState("sent");
      router.replace(next);
      router.refresh();
      return;
    }
    const { error } = mode === "link"
      ? await auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } })
      : await auth.resetPasswordForEmail(email, { redirectTo: callback("/account#password") });
    if (error) return fail(error.message);
    setState("sent");
  }

  function fail(message: string) {
    setError(message);
    setState("idle");
  }

  if (state === "sent") {
    const what = mode === "signup" ? "a link to confirm your email" : mode === "forgot" ? "a password reset link" : "a sign-in link";
    return (
      <div className="text-center" role="status">
        <MailCheck className="mx-auto size-10 text-plat" aria-hidden />
        <h1 className="mt-4 text-2xl">Check your email</h1>
        <p className="mt-2 text-muted-foreground">
          We sent {what} to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <Button variant="link" className="mt-4" onClick={() => setState("idle")}>Use a different email</Button>
      </div>
    );
  }

  const signingIn = mode === "password" || mode === "link";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>
      </div>
      {signingIn && (
        <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 rounded-lg bg-secondary p-1 text-sm">
          {(["password", "link"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
              className={`rounded-md py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {m === "password" ? "Password" : "Email link"}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      {(mode === "password" || mode === "signup") && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "password" && (
              <button type="button" onClick={() => switchTo("forgot")} className="text-xs text-plat hover:underline">Forgot password?</button>
            )}
          </div>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? MIN_PASSWORD : undefined}
            aria-describedby={mode === "signup" ? "password-hint" : undefined} />
          {mode === "signup" && <p id="password-hint" className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={state === "sending"}>{state === "sending" ? copy.busy : copy.submit}</Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>Have an account? <button type="button" onClick={() => switchTo("password")} className="font-medium text-plat hover:underline">Sign in</button></>
        ) : mode === "forgot" ? (
          <button type="button" onClick={() => switchTo("password")} className="font-medium text-plat hover:underline">Back to sign in</button>
        ) : (
          <>New here? <button type="button" onClick={() => switchTo("signup")} className="font-medium text-plat hover:underline">Create an account</button></>
        )}
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">Public records only. Not legal, title or investment advice.</p>
    </main>
  );
}
