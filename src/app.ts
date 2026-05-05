import Fastify, { FastifyInstance } from 'fastify'
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { ZodError, z } from 'zod/v4'

// Plugins
import prismaPlugin from './plugins/prisma.js'
import scalarPlugin from './plugins/scalar.js'
import supabasePlugin from './plugins/supabase.js'

// Routes
import authRoutes from './modules/auth/auth.routes.js'
import budgetsRoutes from './modules/budgets/budgets.routes.js'
import expensesRoutes from './modules/expenses/expenses.routes.js'
import goalsRoutes from './modules/goals/goals.routes.js'
import statsRoutes from './modules/stats/stats.routes.js'
import specialExpensesRoutes from './modules/special-expenses/special-expenses.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import investmentsRoutes from './modules/investments/investments.routes.js'
import categoriesRoutes from './modules/categories/categories.routes.js'

export async function buildApp(): Promise<FastifyInstance> {
  const isDevelopment = env.NODE_ENV !== 'production'
  const prettyStream = isDevelopment
    ? (() => {
        try {
          const pinoPretty = require('pino-pretty') as (options?: Record<string, unknown>) => NodeJS.WritableStream
          return pinoPretty({
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          })
        } catch {
          return undefined
        }
      })()
    : undefined

  const fastify = Fastify({
    logger: {
      level: isDevelopment ? 'debug' : 'info',
      stream: prettyStream,
    },
    disableRequestLogging: true,
    requestTimeout: 30_000,
  }).withTypeProvider<ZodTypeProvider>()

  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  // ─── Compact request logs ──────────────────────────────────────────────────
  const RESET  = '\x1b[0m'
  const DIM    = '\x1b[2m'
  const BOLD   = '\x1b[1m'
  const GREEN  = '\x1b[32m'
  const YELLOW = '\x1b[33m'
  const RED    = '\x1b[31m'
  const CYAN   = '\x1b[36m'
  const BLUE   = '\x1b[34m'
  const WHITE  = '\x1b[97m'

  const METHOD_COLOR: Record<string, string> = {
    GET: CYAN, POST: GREEN, PATCH: YELLOW, DELETE: RED, OPTIONS: DIM, PUT: BLUE,
  }

  fastify.addHook('onResponse', (request, reply, done) => {
    const method  = request.method
    const url     = request.url.split('?')[0]
    const status  = reply.statusCode
    const ms      = reply.elapsedTime.toFixed(1)
    const query   = request.url.includes('?') ? DIM + ' ?' + request.url.split('?')[1] + RESET : ''

    const methodColor  = METHOD_COLOR[method] ?? WHITE
    const statusColor  = status >= 500 ? RED : status >= 400 ? YELLOW : status >= 300 ? CYAN : GREEN
    const timeColor    = Number(ms) > 500 ? RED : Number(ms) > 100 ? YELLOW : DIM

    const methodStr  = `${methodColor}${BOLD}${method.padEnd(7)}${RESET}`
    const urlStr     = `${WHITE}${url.padEnd(40)}${RESET}${query}`
    const statusStr  = `${statusColor}${BOLD}${status}${RESET}`
    const timeStr    = `${timeColor}${ms}ms${RESET}`

    process.stdout.write(`  ${methodStr} ${urlStr} ${statusStr}  ${timeStr}\n`)
    done()
  })

  // ─── Security ──────────────────────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    
  })

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? env.ALLOWED_ORIGINS.split(',')
      : true, // En développement : accepte toutes les origines
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Trop de requêtes. Réessaie dans 1 minute.',
      },
    }),
  })

  // ─── Core Plugins ──────────────────────────────────────────────────────────
  await fastify.register(prismaPlugin)
  await fastify.register(supabasePlugin)
  await fastify.register(scalarPlugin)

  type AppError = {
    statusCode?: number
    success?: boolean
    error?: { code?: string; message?: string; details?: unknown }
    message?: string
  }

  // ─── Global Error Handler ──────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    const appError = error as AppError

    // Erreurs Zod
    if (error instanceof ZodError) {
      return reply.status(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Données invalides',
          details: z.flattenError(error).fieldErrors,
        },
      })
    }

    // Erreurs métier (statusCode défini)
    if (appError.statusCode && appError.statusCode < 500) {
      return reply.status(appError.statusCode).send({
        success: appError.success ?? false,
        error: appError.error ?? { code: 'ERROR', message: appError.message ?? 'Une erreur est survenue' },
      })
    }

    // Erreurs 500
    fastify.log.error(error)
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production' ? 'Une erreur interne est survenue' : appError.message ?? 'Une erreur interne est survenue',
      },
    })
  })

  // ─── Health Check ──────────────────────────────────────────────────────────
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Vérifier l\'état du serveur',
      response: {
        200: z.object({
          status: z.string(),
          version: z.string(),
          timestamp: z.string(),
        }),
      },
    },
    handler: async () => ({
      status: 'ok',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
    }),
  })

  // ─── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(budgetsRoutes, { prefix: '/budgets' })
  await fastify.register(expensesRoutes, { prefix: '/expenses' })
  await fastify.register(goalsRoutes, { prefix: '/goals' })
  await fastify.register(statsRoutes, { prefix: '/stats' })
  await fastify.register(specialExpensesRoutes, { prefix: '/special-expenses' })
  await fastify.register(notificationsRoutes, { prefix: '/notifications' })
  await fastify.register(investmentsRoutes, { prefix: '/investments' })
  await fastify.register(categoriesRoutes, { prefix: '/categories' })

  // 404 handler
  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route introuvable' },
    })
  })

  return fastify
}
