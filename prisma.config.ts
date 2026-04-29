/// <reference types="node" />
import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config()

export default defineConfig({
  datasource: {
    // DIRECT_URL (port 5432) pour les opérations CLI (db push, migrate, generate)
    // DATABASE_URL (port 6543 pooler) reste utilisé par l'app au runtime via PrismaClient
    url: (process.env.DIRECT_URL || process.env.DATABASE_URL)!,
  },
})
