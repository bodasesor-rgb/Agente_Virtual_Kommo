import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/lucy";

export default defineConfig({
  schema: path.join(here, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
