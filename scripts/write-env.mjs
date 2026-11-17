// Reads the running local stack's URL and publishable key out of
// `supabase status` and writes them to .env.local for Vite and the bots.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let status;
try {
  status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  console.error("Couldn't read `supabase status`. Is the stack running? Try: npx supabase start");
  process.exit(1);
}

const lines = [
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
  "",
];

writeFileSync(".env.local", lines.join("\n"));
console.log(`wrote .env.local -> ${status.API_URL}`);
