import { useState } from "react";
import { supabase } from "../lib/supabase";

// Every way in, the way most apps do it:
//   guest       signInAnonymously(): a real user id, no email (convert later)
//   sign in     signInWithPassword()
//   sign up     signUp()
//   magic link  signInWithOtp(): an email with a one-time link
//   forgot      resetPasswordForEmail(): an email with a link to set a new one
//
// On the local stack every email lands in Mailpit (http://127.0.0.1:54324),
// not a real inbox.

type Mode = "guest" | "signin" | "signup" | "magic" | "forgot";

export function AuthGate({ title, blurb }: { title: string; blurb: string }) {
  const [mode, setMode] = useState<Mode>("guest");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  // where the links in emails send people back to
  const redirectTo = location.origin + location.pathname;

  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setMessage(null);
    let error: { message: string } | null = null;
    let sent: string | null = null;

    if (mode === "guest") {
      ({ error } = await supabase.auth.signInAnonymously());
    } else if (mode === "signin") {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    } else if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      error = err;
      // projects with email confirmation on return a user but no session yet
      if (!err && !data.session) sent = "Check your email to confirm your account, then sign in.";
    } else if (mode === "magic") {
      ({ error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }));
      if (!error) sent = "Check your email for a sign-in link.";
    } else if (mode === "forgot") {
      ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }));
      if (!error) sent = "Check your email for a link to set a new password.";
    }

    setBusy(false);
    if (error) setMessage({ tone: "bad", text: error.message });
    else if (sent) setMessage({ tone: "good", text: sent });
    // otherwise onAuthStateChange in the page picks up the new session
  }

  const tabs: [Mode, string][] = [
    ["guest", "Guest"],
    ["signin", "Sign in"],
    ["signup", "Create account"],
    ["magic", "Email link"],
  ];

  return (
    <main className="signup auth">
      <h1>{title}</h1>
      <p className="muted">{blurb}</p>

      <div className="auth-tabs">
        {tabs.map(([m, label]) => (
          <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => { setMode(m); setMessage(null); }}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={go}>
        {mode === "guest" ? (
          <p className="small muted">
            Jump straight in with no email. You get a real account behind the scenes (<code>signInAnonymously()</code>),
            and you can save it with an email later without losing anything.
          </p>
        ) : (
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        )}
        {(mode === "signin" || mode === "signup") && (
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "Pick a password (6+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        )}
        <button disabled={busy}>
          {busy
            ? "…"
            : { guest: "Play as a guest", signin: "Sign in", signup: "Create account", magic: "Email me a link", forgot: "Email me a reset link" }[mode]}
        </button>
      </form>

      {mode === "signin" && (
        <button type="button" className="link small" onClick={() => { setMode("forgot"); setMessage(null); }}>
          Forgot your password?
        </button>
      )}
      {message && <p className={message.tone}>{message.text}</p>}
      {(mode === "magic" || mode === "forgot" || mode === "signup") && (
        <p className="small muted">Running locally? Emails show up in Mailpit at http://127.0.0.1:54324, not your real inbox.</p>
      )}
    </main>
  );
}

// Shown after someone clicks the link in a password-reset email. supabase-js
// signs them in from the link and fires a PASSWORD_RECOVERY event; all that's
// left is to pick the new password.
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <main className="signup auth">
      <h1>Set a new password</h1>
      <form onSubmit={save}>
        <input type="password" autoComplete="new-password" placeholder="New password (6+ characters)" minLength={6} required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy}>{busy ? "…" : "Save password"}</button>
      </form>
      {error && <p className="bad">{error}</p>}
    </main>
  );
}
