import { FastifyPluginAsync } from 'fastify'
import { SpecialExpensesService } from './special-expenses.service.js'
import {
  CreateSpecialExpenseSchema, UpdateSpecialExpenseSchema, MarkCompletedSchema,
  SpecialExpenseListResponse, SpecialExpenseResponse,
  type CreateSpecialExpenseInput, type UpdateSpecialExpenseInput, type MarkCompletedInput,
} from './special-expenses.schema.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { z } from 'zod/v4'
import { r401, r404, r422 } from '../../utils/schema.js'

const ParamsSchema = z.object({ id: z.string() })
const QuerySchema = z.object({
  completed: z.enum(['true', 'false']).optional().describe('Filtrer par statut : true = complétées, false = en attente'),
})

const specialExpensesRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new SpecialExpensesService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Lister les dépenses spéciales planifiées',
      description: 'Retourne toutes les dépenses spéciales (loyer, assurance, rentrée scolaire…). Filtrables par statut.',
      security: [{ bearerAuth: [] }],
      querystring: QuerySchema,
      response: { 200: SpecialExpenseListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { completed } = request.query as z.infer<typeof QuerySchema>
      return reply.send(ok(await service.findAll(request.user.sub, completed === undefined ? undefined : completed === 'true')))
    },
  })

  fastify.get('/upcoming', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Dépenses spéciales dans les 7 prochains jours',
      description: 'Utile pour une alerte dashboard : dépenses importantes à venir cette semaine.',
      security: [{ bearerAuth: [] }],
      response: { 200: SpecialExpenseListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      return reply.send(ok(await service.getUpcoming(request.user.sub, 7)))
    },
  })

  fastify.get('/:id', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Obtenir une dépense spéciale par ID',
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      response: { 200: SpecialExpenseResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>
      return reply.send(ok(await service.findOne(request.user.sub, id)))
    },
  })

  fastify.post('/', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Créer une dépense spéciale planifiée',
      description: 'Planifie une grosse dépense future. Des rappels seront envoyés selon `remindDaysBefore`.',
      security: [{ bearerAuth: [] }],
      body: CreateSpecialExpenseSchema,
      response: { 201: SpecialExpenseResponse, 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.create(request.user.sub, request.body as CreateSpecialExpenseInput)
      return reply.status(201).send(ok(result, 'Dépense spéciale créée avec succès'))
    },
  })

  fastify.patch('/:id', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Modifier une dépense spéciale',
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      body: UpdateSpecialExpenseSchema,
      response: { 200: SpecialExpenseResponse, 401: r401, 404: r404, 422: r422 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>
      const result = await service.update(request.user.sub, id, request.body as UpdateSpecialExpenseInput)
      return reply.send(ok(result, 'Dépense spéciale mise à jour'))
    },
  })

  fastify.post('/:id/complete', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Marquer une dépense spéciale comme complétée',
      description: 'On peut renseigner le montant réel si différent de l\'estimation.',
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      body: MarkCompletedSchema,
      response: { 200: SpecialExpenseResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>
      const result = await service.markCompleted(request.user.sub, id, request.body as MarkCompletedInput)
      return reply.send(ok(result, 'Dépense spéciale marquée comme complétée'))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Special Expenses'],
      summary: 'Supprimer une dépense spéciale',
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      response: { 204: z.null(), 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>
      await service.delete(request.user.sub, id)
      return reply.status(204).send()
    },
  })
}

export default specialExpensesRoutes
