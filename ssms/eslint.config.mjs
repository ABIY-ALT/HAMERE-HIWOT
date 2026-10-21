import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The unrestricted service-role client reaches every Sunday school's data.
// Sunday-school code uses the tenant-scoped client from authorize()
// (lib/tenant/db.ts); only the files below may use the unrestricted one.
const UNRESTRICTED_CLIENT = [
  "lib/supabase/server.ts",
  "lib/tenant/**",
  "lib/billing/**",
  "lib/platform/**",
  "lib/security/**",
  "lib/auth/session.ts",
  "app/login/actions.ts",
  "app/register/**",
  "app/platform/**",
  "app/api/cron/route.ts",
  "app/exam/actions.ts", // finds whose exam a ticket is
  "lib/auth/temp-password.ts", // logins are shared by Sunday schools; admin rights checked in all of them
  "app/dashboard/telegram/actions.ts", // one bot per Sunday school
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              importNames: ["createAdminClient"],
              message: "Use the tenant-scoped client from authorize() (lib/tenant/db.ts).",
            },
            {
              name: "@/lib/tenant/db",
              importNames: ["platformClient"],
              message: "Use the tenant-scoped client from authorize(); the platform client reaches every Sunday school.",
            },
          ],
        },
      ],
    },
  },
  { files: UNRESTRICTED_CLIENT, rules: { "no-restricted-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
