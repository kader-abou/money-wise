import { FastifyPluginAsync } from 'fastify'
import { BudgetsService } from './budgets.service.js'
import {
  CreateBudgetSchema, UpdateBudgetSchema, BudgetParamsSchema, BudgetQuerySchema,
  BudgetListResponse, BudgetResponse,
  type CreateBudgetInput, type UpdateBudgetInput,
} from './budgets.schema.js'
import { z } from 'zod/v4'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { r401, r404, r409, r422 } from '../../utils/schema.js'

const budgetsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new BudgetsService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/current', {
    schema: {
      tags: ['Budgets'],
      summary: 'Budget du mois en cours',
      description: 'Retourne le budget actuel avec détail par catégorie : montant alloué, dépensé, restant, pourcentage et statut couleur.',
      security: [{ bearerAuth: [] }],
      response: { 200: BudgetResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      return reply.send(ok(await service.findCurrent(request.user.sub)))
    },
  })

  fastify.get('/', {
    schema: {
      tags: ['Budgets'],
      summary: 'Lister tous les budgets',
      description: 'Triés du plus récent au plus ancien. Filtrables par mois et/ou année.',
      security: [{ bearerAuth: [] }],
      querystring: BudgetQuerySchema,
      response: { 200: BudgetListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { month, year } = request.query as z.infer<typeof BudgetQuerySchema>
      return reply.send(ok(await service.findAll(request.user.sub, month, year)))
    },
  })

  fastify.post('/', {
    schema: {
      tags: ['Budgets'],
      summary: 'Créer un budget mensuel',
      description: 'La somme des catégories ne doit pas dépasser le `totalAmount`. Un seul budget par mois/année.',
      security: [{ bearerAuth: [] }],
      body: CreateBudgetSchema,
      response: { 201: BudgetResponse, 400: r422, 401: r401, 409: r409, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.create(request.user.sub, request.body as CreateBudgetInput)
      return reply.status(201).send(ok(result, 'Budget créé avec succès'))
    },
  })

  fastify.get('/:id', {
    schema: {
      tags: ['Budgets'],
      summary: 'Obtenir un budget par ID',
      security: [{ bearerAuth: [] }],
      params: BudgetParamsSchema,
      response: { 200: BudgetResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof BudgetParamsSchema>
      return reply.send(ok(await service.findOne(request.user.sub, id)))
    },
  })

  fastify.patch('/:id', {
    schema: {
      tags: ['Budgets'],
      summary: 'Modifier un budget',
      description: 'Si `categories` est fourni, les catégories existantes sont remplacées intégralement.',
      security: [{ bearerAuth: [] }],
      params: BudgetParamsSchema,
      body: UpdateBudgetSchema,
      response: { 200: BudgetResponse, 401: r401, 404: r404, 422: r422 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof BudgetParamsSchema>
      const result = await service.update(request.user.sub, id, request.body as UpdateBudgetInput)
      return reply.send(ok(result, 'Budget mis à jour'))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Budgets'],
      summary: 'Supprimer un budget',
      description: 'Suppression définitive du budget et de toutes ses catégories.',
      security: [{ bearerAuth: [] }],
      params: BudgetParamsSchema,
      response: { 204: z.null(), 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof BudgetParamsSchema>
      await service.delete(request.user.sub, id)
      return reply.status(204).send()
    },
  })
}

export default budgetsRoutes
