import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// On Render the site is built from the repository root but lives in ssms/.
// Settings saved as Render "Secret Files" (.env or .env.local) are placed in
// the repository root and in /etc/secrets, where Next.js doesn't look — read
// them here. A setting that is already defined always wins.
for (const dir of [path.resolve(process.cwd(), ".."), "/etc/secrets"]) {
  for (const name of [".env", ".env.local", ".env.production"]) {
    const file = path.join(dir, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
    }
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
