import { FastifyPluginAsync } from 'fastify'
import { StatsService } from './stats.service.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { z } from 'zod/v4'
import { wrapResponse, r401, r403 } from '../../utils/schema.js'

const PeriodSchema = z.enum(['day', 'week', 'month', 'quarter', 'semester', 'year'])

const SummaryQuerySchema = z.object({
  period: PeriodSchema.describe('Période. quarter/semester/year → Premium uniquement'),
  date: z.coerce.date().optional().describe('Date de référence (défaut: aujourd\'hui)'),
})
const TrendQuerySchema = z.object({
  months: z.coerce.number().min(1).max(12).default(6).describe('Nombre de mois glissants (1-12)'),
})
const TopExpensesQuerySchema = z.object({
  period: PeriodSchema.default('month'),
  limit: z.coerce.number().min(1).max(20).default(5).describe('Nombre de dépenses à retourner (max 20)'),
})

const DistributionItem = z.object({
  categoryId: z.string(),
  name: z.string().describe('Nom de la catégorie'),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  amount: z.number().describe('Total dépensé dans cette catégorie'),
  percentage: z.number().describe('Part en % du total'),
})

const BudgetComparison = z.object({
  budgeted: z.number(),
  spent: z.number(),
  remaining: z.number().describe('Négatif si dépassé'),
  percentage: z.number(),
}).nullable()

const SummaryResponse = wrapResponse(z.object({
  period: PeriodSchema,
  from: z.string(),
  to: z.string(),
  total: z.number().describe('Total des dépenses sur la période'),
  count: z.number().describe('Nombre de dépenses'),
  distribution: z.array(DistributionItem).describe('Répartition par catégorie, triée par montant décroissant'),
  budgetComparison: BudgetComparison.describe('Disponible uniquement pour period=month'),
  advice: z.array(z.string()).describe('Conseils automatiques basés sur les seuils'),
}))

const TrendResponse = wrapResponse(z.array(z.object({
  month: z.number(),
  year: z.number(),
  label: z.string().describe('Libellé formaté (ex: "avr. 2026")'),
  total: z.number(),
  count: z.number(),
})))

const TopExpensesResponse = wrapResponse(z.array(z.object({
  id: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  date: z.string(),
  categoryId: z.string(),
  category: z.object({ id: z.string(), name: z.string(), icon: z.string().nullable(), color: z.string().nullable() }),
})))

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new StatsService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/summary', {
    schema: {
      tags: ['Stats'],
      summary: 'Résumé des dépenses par période',
      description: 'Total, répartition par catégorie (icône/couleur), comparaison budget (pour `month`), et conseils. Les périodes `quarter`, `semester`, `year` sont réservées Premium.',
      security: [{ bearerAuth: [] }],
      querystring: SummaryQuerySchema,
      response: { 200: SummaryResponse, 401: r401, 403: r403 },
    },
    handler: async (request, reply) => {
      const { period, date } = request.query as z.infer<typeof SummaryQuerySchema>
      const premiumPeriods = ['quarter', 'semester', 'year']
      if (premiumPeriods.includes(period) && request.user.plan === 'FREE') {
        return reply.status(403).send({
          success: false,
          error: { code: 'PREMIUM_REQUIRED', message: 'Les statistiques trimestrielles, semestrielles et annuelles sont réservées aux abonnés Premium.' },
        })
      }
      return reply.send(ok(await service.getSummary(request.user.sub, period, date)))
    },
  })

  fastify.get('/trend', {
    schema: {
      tags: ['Stats'],
      summary: 'Tendance des dépenses sur N mois glissants',
      description: 'Évolution mensuelle des dépenses. Idéal pour un graphique de ligne dans l\'app.',
      security: [{ bearerAuth: [] }],
      querystring: TrendQuerySchema,
      response: { 200: TrendResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { months } = request.query as z.infer<typeof TrendQuerySchema>
      return reply.send(ok(await service.getTrend(request.user.sub, months)))
    },
  })

  fastify.get('/top-expenses', {
    schema: {
      tags: ['Stats'],
      summary: 'Les dépenses les plus élevées de la période',
      description: 'Retourne les N dépenses les plus chères avec leur catégorie. Utile pour identifier les postes exceptionnels.',
      security: [{ bearerAuth: [] }],
      querystring: TopExpensesQuerySchema,
      response: { 200: TopExpensesResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { period, limit } = request.query as z.infer<typeof TopExpensesQuerySchema>
      return reply.send(ok(await service.getTopExpenses(request.user.sub, period, limit)))
    },
  })
}

export default statsRoutes
