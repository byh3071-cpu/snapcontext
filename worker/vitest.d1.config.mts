import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations }
        }
      })
    ],
    test: {
      include: ['test-d1/**/*.test.ts'],
      setupFiles: ['./test-d1/apply-migrations.ts']
    }
  }
})
