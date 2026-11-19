import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Avatar } from "./Avatar";

// Your account, the parts every app has: a picture, a name, turning a guest
// into a real account, changing your password, signing out, and deleting it
// all. Each control is one Supabase call; the comments say which.

type Props = {
  me: { id: string; name: string; avatar_path: string | null };
  // the page owns its own player table (crew, cooks, traders), so it saves these
  onRename: (name: string) => Promise<string | null>;
  onAvatar: (path: string | null) => Promise<string | null>;
  onSignedOut: () => void;
};

type Msg = { tone: "good" | "bad"; text: string } | null;

export function Account({ me, onRename, onAvatar, onSignedOut }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // getUser() asks the Auth server, so it's always current (getSession()
  // only reads what's stored in the browser)
  const refreshUser = () => supabase.auth.getUser().then(({ data }) => setUser(data.user));
  useEffect(() => {
    refreshUser();
  }, []);

  const guest = user?.is_anonymous ?? false;

  async function run(work: () => Promise<Msg>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await work());
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  // Storage: shrink the picture in the browser, upload it to avatars/<your id>/,
  // point your profile at it, and delete the old one.
  const upload = (file: File) =>
    run(async () => {
      const blob = await shrink(file, 256);
      const path = `${me.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
      if (error) return { tone: "bad", text: error.message };
      const saveError = await onAvatar(path);
      if (saveError) return { tone: "bad", text: saveError };
      if (me.avatar_path) await supabase.storage.from("avatars").remove([me.avatar_path]);
      return { tone: "good", text: "New picture saved." };
    });

  const removePicture = () =>
    run(async () => {
      if (me.avatar_path) await supabase.storage.from("avatars").remove([me.avatar_path]);
      const err = await onAvatar(null);
      return err ? { tone: "bad", text: err } : { tone: "good", text: "Picture removed." };
    });

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const err = await onRename(name.trim());
      return err ? { tone: "bad", text: err } : { tone: "good", text: "Name saved." };
    });
  };

  // A guest becomes a real account by adding an email and password to the
  // same user. Same id, so every row they own stays theirs.
  const saveProgress = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { data, error } = await supabase.auth.updateUser({ email, password });
      if (error) return { tone: "bad", text: error.message };
      await refreshUser();
      return data.user?.is_anonymous === false
        ? { tone: "good", text: `Saved. You can sign in as ${email} from any device.` }
        : { tone: "good", text: "Check your email to confirm, and your account is saved." };
    });
  };

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      setPassword("");
      return error ? { tone: "bad", text: error.message } : { tone: "good", text: "Password changed." };
    });
  };

  async function signOut() {
    await supabase.auth.signOut();
    onSignedOut();
  }

  // Deleting a user needs the secret key, so it happens in an Edge Function.
  const deleteAccount = () =>
    run(async () => {
      const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) {
        const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        return { tone: "bad", text: body?.error ?? error.message };
      }
      await supabase.auth.signOut({ scope: "local" });
      onSignedOut();
      return null;
    });

  return (
    <section className="panel account">
      <h2>Your account</h2>

      <div className="account-row">
        <Avatar name={me.name} path={me.avatar_path} size={56} />
        <div className="account-who">
          <b>{me.name}</b>
          <div className="small muted">
            {user ? (guest ? "Guest: this device only, until you save it below" : user.email) : "…"}
          </div>
        </div>
      </div>

      <div className="account-actions">
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          {me.avatar_path ? "Change picture" : "Add a picture"}
        </button>
        {me.avatar_path && (
          <button type="button" className="link small" disabled={busy} onClick={removePicture}>remove</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>

      <form className="account-form" onSubmit={rename}>
        <label className="small muted" htmlFor="acct-name">Name</label>
        <div className="inline">
          <input id="acct-name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={busy || !name.trim() || name.trim() === me.name}>Save</button>
        </div>
      </form>

      {guest ? (
        <form className="account-form" onSubmit={saveProgress}>
          <div className="small"><b>Save your progress.</b> Add an email and password to keep this account and use it on any device.</div>
          <input type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" autoComplete="new-password" placeholder="Password (6+ characters)" minLength={6} required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy}>Save my account</button>
        </form>
      ) : (
        user && (
          <form className="account-form" onSubmit={changePassword}>
            <label className="small muted" htmlFor="acct-pw">Change password</label>
            <div className="inline">
              <input id="acct-pw" type="password" autoComplete="new-password" minLength={6} required placeholder="New password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button disabled={busy}>Change</button>
            </div>
          </form>
        )
      )}

      {msg && <p className={`small ${msg.tone}`}>{msg.text}</p>}

      <div className="account-actions">
        <button type="button" onClick={signOut}>Sign out</button>
        {confirmDelete ? (
          <>
            <button type="button" className="danger" disabled={busy} onClick={deleteAccount}>Yes, delete everything</button>
            <button type="button" className="link small" onClick={() => setConfirmDelete(false)}>cancel</button>
          </>
        ) : (
          <button type="button" className="link small" onClick={() => setConfirmDelete(true)}>Delete my account</button>
        )}
      </div>
    </section>
  );
}

// Resize to fit in size x size and re-encode as WebP, so uploads stay small.
async function shrink(file: File, size: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't read that image"))), "image/webp", 0.85),
  );
}
