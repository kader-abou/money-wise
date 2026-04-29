import { FastifyPluginAsync } from 'fastify'
import { ExpensesService } from './expenses.service.js'
import {
  CreateExpenseSchema, UpdateExpenseSchema, ExpenseParamsSchema, ExpenseQuerySchema,
  ExpenseListResponse, ExpenseResponse, CreateExpenseResponse,
  type CreateExpenseInput, type UpdateExpenseInput, type ExpenseQueryInput,
} from './expenses.schema.js'
import { z } from 'zod/v4'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { r401, r404, r422 } from '../../utils/schema.js'

const expensesRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ExpensesService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', {
    schema: {
      tags: ['Expenses'],
      summary: 'Lister les dépenses avec pagination et filtres',
      description: 'Filtrables par catégorie, période (from/to) et budget. Inclut la catégorie complète (nom, icône, couleur).',
      security: [{ bearerAuth: [] }],
      querystring: ExpenseQuerySchema,
      response: { 200: ExpenseListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const result = await service.findAll(request.user.sub, request.query as ExpenseQueryInput)
      return reply.send({ success: true, ...result })
    },
  })

  fastify.post('/', {
    schema: {
      tags: ['Expenses'],
      summary: 'Enregistrer une dépense',
      description: 'Met à jour automatiquement le `spent` du budget de la catégorie du mois. Retourne une alerte si le seuil 50%, 80% ou 100% est franchi.',
      security: [{ bearerAuth: [] }],
      body: CreateExpenseSchema,
      response: { 201: CreateExpenseResponse, 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.create(request.user.sub, request.body as CreateExpenseInput)
      return reply.status(201).send(ok(result, 'Dépense enregistrée'))
    },
  })

  fastify.get('/:id', {
    schema: {
      tags: ['Expenses'],
      summary: 'Obtenir une dépense par ID',
      security: [{ bearerAuth: [] }],
      params: ExpenseParamsSchema,
      response: { 200: ExpenseResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ExpenseParamsSchema>
      return reply.send(ok(await service.findOne(request.user.sub, id)))
    },
  })

  fastify.patch('/:id', {
    schema: {
      tags: ['Expenses'],
      summary: 'Modifier une dépense',
      description: 'Si le montant ou la catégorie change, le `spent` des budgets est recalculé automatiquement.',
      security: [{ bearerAuth: [] }],
      params: ExpenseParamsSchema,
      body: UpdateExpenseSchema,
      response: { 200: ExpenseResponse, 401: r401, 404: r404, 422: r422 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ExpenseParamsSchema>
      const result = await service.update(request.user.sub, id, request.body as UpdateExpenseInput)
      return reply.send(ok(result, 'Dépense modifiée'))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Expenses'],
      summary: 'Supprimer une dépense',
      description: 'Supprime la dépense et décrémente le `spent` du budget associé.',
      security: [{ bearerAuth: [] }],
      params: ExpenseParamsSchema,
      response: { 204: z.null(), 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ExpenseParamsSchema>
      await service.delete(request.user.sub, id)
      return reply.status(204).send()
    },
  })
}

export default expensesRoutes
