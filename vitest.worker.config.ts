import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/worker/**/*.test.ts"],
    pool: "@cloudflare/vitest-pool-workers",
    poolOptions: {
      workers: {
        isolatedStorage: true,
        main: "./worker/index.ts",
        miniflare: {
          // Keep SQLite paths below the Windows path-length limit while retaining
          // per-file storage isolation. pnpm already ignores node_modules/.tmp.
          durableObjectsPersist: "./node_modules/.tmp/vitest-worker/durable-objects"
        },
        wrangler: {
          configPath: "./wrangler.jsonc"
        }
      }
    }
  }
});
