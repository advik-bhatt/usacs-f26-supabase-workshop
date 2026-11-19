import { supabase } from "../lib/supabase";

// Profile pictures live in the public "avatars" bucket, one folder per user.
// A public bucket means the URL works without a token, so leaderboards can
// show everyone's picture. Writing is still locked down by RLS (see the
// accounts migration): you can only touch your own folder.
export const avatarUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;

export function Avatar({ name, path, size = 28 }: { name: string; path?: string | null; size?: number }) {
  const url = avatarUrl(path);
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return url ? (
    <img className="avatar" src={url} alt="" style={style} />
  ) : (
    <span className="avatar initials" style={style} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
