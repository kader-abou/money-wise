import { FastifyPluginAsync } from 'fastify'
import { GoalsService } from './goals.service.js'
import { z } from 'zod/v4'
import {
  CreateGoalSchema, UpdateGoalSchema, AddContributionSchema, GoalParamsSchema,
  GoalListResponse, GoalResponse, GoalContributeResponse, GoalRecapResponse,
  type CreateGoalInput, type UpdateGoalInput, type AddContributionInput,
} from './goals.schema.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { r401, r404, r422 } from '../../utils/schema.js'

const StatusQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional().describe('Filtrer par statut'),
})
const RecapParamsSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).describe('Mois (1-12)'),
  year: z.coerce.number().int().min(2020).describe('Année'),
})

const goalsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new GoalsService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', {
    schema: {
      tags: ['Goals'],
      summary: "Lister les objectifs d'épargne",
      description: 'Retourne tous les objectifs triés par deadline croissante. Filtre optionnel par statut. Inclut les 5 derniers versements par objectif.',
      security: [{ bearerAuth: [] }],
      querystring: StatusQuerySchema,
      response: { 200: GoalListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { status } = request.query as z.infer<typeof StatusQuerySchema>
      return reply.send(ok(await service.findAll(request.user.sub, status)))
    },
  })

  fastify.post('/', {
    schema: {
      tags: ['Goals'],
      summary: "Créer un objectif d'épargne",
      description: 'Le champ `monthlyTarget` permet de calculer combien mettre de côté chaque mois pour atteindre l\'objectif à temps.',
      security: [{ bearerAuth: [] }],
      body: CreateGoalSchema,
      response: { 201: GoalResponse, 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.create(request.user.sub, request.body as CreateGoalInput)
      return reply.status(201).send(ok(result, 'Objectif créé'))
    },
  })

  fastify.get('/recap/:month/:year', {
    schema: {
      tags: ['Goals'],
      summary: "Récapitulatif mensuel des objectifs",
      description: 'Compare le montant versé ce mois vs le `monthlyTarget`. Inclut un conseil si insuffisant.',
      security: [{ bearerAuth: [] }],
      params: RecapParamsSchema,
      response: { 200: GoalRecapResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { month, year } = request.params as z.infer<typeof RecapParamsSchema>
      return reply.send(ok(await service.getMonthlyRecap(request.user.sub, month, year)))
    },
  })

  fastify.get('/:id', {
    schema: {
      tags: ['Goals'],
      summary: "Obtenir un objectif d'épargne",
      description: "Retourne l'objectif avec l'historique complet de tous ses versements.",
      security: [{ bearerAuth: [] }],
      params: GoalParamsSchema,
      response: { 200: GoalResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof GoalParamsSchema>
      return reply.send(ok(await service.findOne(request.user.sub, id)))
    },
  })

  fastify.patch('/:id', {
    schema: {
      tags: ['Goals'],
      summary: "Modifier un objectif d'épargne",
      description: 'Met à jour les métadonnées. Ne modifie pas les contributions existantes.',
      security: [{ bearerAuth: [] }],
      params: GoalParamsSchema,
      body: UpdateGoalSchema,
      response: { 200: GoalResponse, 401: r401, 404: r404, 422: r422 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof GoalParamsSchema>
      const result = await service.update(request.user.sub, id, request.body as UpdateGoalInput)
      return reply.send(ok(result, 'Objectif mis à jour'))
    },
  })

  fastify.post('/:id/contribute', {
    schema: {
      tags: ['Goals'],
      summary: 'Ajouter un versement à un objectif',
      description: 'Si le montant cible est atteint, le statut passe à COMPLETED et un message de félicitations est retourné.',
      security: [{ bearerAuth: [] }],
      params: GoalParamsSchema,
      body: AddContributionSchema,
      response: { 201: GoalContributeResponse, 400: r422, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof GoalParamsSchema>
      const result = await service.addContribution(request.user.sub, id, request.body as AddContributionInput)
      return reply.status(201).send(ok(result))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Goals'],
      summary: "Supprimer un objectif d'épargne",
      description: 'Suppression définitive avec toutes les contributions associées.',
      security: [{ bearerAuth: [] }],
      params: GoalParamsSchema,
      response: { 204: z.null(), 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof GoalParamsSchema>
      await service.delete(request.user.sub, id)
      return reply.status(204).send()
    },
  })
}

export default goalsRoutes
