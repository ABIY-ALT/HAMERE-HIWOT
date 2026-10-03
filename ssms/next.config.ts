import type { NextConfig } from "next";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const clean = (value: string) => value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();

// Render "Secret Files" named after a setting (e.g. a file NEXT_PUBLIC_SUPABASE_URL
// whose contents are the value) are read as that setting. They are available
// during the build and at run time in /etc/secrets.
const SECRETS = process.env.SECRETS_DIR ?? "/etc/secrets";
if (existsSync(SECRETS)) {
  for (const name of readdirSync(SECRETS)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || process.env[name] !== undefined) continue;
    let value = readFileSync(path.join(SECRETS, name), "utf8").trim();
    // Tolerate the whole "NAME=value" line pasted as the contents
    const line = value.match(new RegExp(`^${name}\\s*=\\s*([\\s\\S]*)$`));
    if (line) value = line[1];
    process.env[name] = clean(value);
  }
}

// On Render the site is built from the repository root but lives in ssms/.
// Settings saved as Render "Secret Files" (.env or .env.local) are placed in
// the repository root and in /etc/secrets, where Next.js doesn't look — read
// them here. A setting that is already defined always wins.
for (const dir of [path.resolve(process.cwd(), ".."), SECRETS]) {
  for (const name of [".env", ".env.local", ".env.production"]) {
    const file = path.join(dir, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = clean(match[2]);
    }
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
