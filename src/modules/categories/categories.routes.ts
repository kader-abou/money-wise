import { FastifyPluginAsync } from 'fastify'
import { CategoriesService } from './categories.service.js'
import {
  CreateCategorySchema, UpdateCategorySchema, CategoryParamsSchema,
  type CreateCategoryInput, type UpdateCategoryInput,
} from './categories.schema.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { z } from 'zod/v4'
import { wrapResponse, CategoryData, r401, r403, r404, r409 } from '../../utils/schema.js'

const CategoryListResponse = wrapResponse(z.array(CategoryData))
const CategoryResponse = wrapResponse(CategoryData)

const categoriesRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CategoriesService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', {
    schema: {
      tags: ['Categories'],
      summary: 'Lister les catégories disponibles',
      description: 'Retourne les catégories système (`isSystem: true`) et les catégories personnalisées de l\'utilisateur. À appeler au chargement de l\'app.',
      security: [{ bearerAuth: [] }],
      response: { 200: CategoryListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      return reply.send(ok(await service.findAll(request.user.sub)))
    },
  })

  fastify.post('/', {
    schema: {
      tags: ['Categories'],
      summary: 'Créer une catégorie personnalisée',
      description: 'Crée une catégorie visible uniquement par cet utilisateur (ex: "Voyage Maldives", "Argent de poche").',
      security: [{ bearerAuth: [] }],
      body: CreateCategorySchema,
      response: { 201: CategoryResponse, 401: r401, 409: r409 },
    },
    handler: async (request, reply) => {
      const result = await service.create(request.user.sub, request.body as CreateCategoryInput)
      return reply.status(201).send(ok(result, 'Catégorie créée'))
    },
  })

  fastify.patch('/:id', {
    schema: {
      tags: ['Categories'],
      summary: 'Modifier une catégorie personnalisée',
      description: 'Seules les catégories créées par l\'utilisateur (`isSystem: false`) peuvent être modifiées.',
      security: [{ bearerAuth: [] }],
      params: CategoryParamsSchema,
      body: UpdateCategorySchema,
      response: { 200: CategoryResponse, 401: r401, 403: r403, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof CategoryParamsSchema>
      const result = await service.update(request.user.sub, id, request.body as UpdateCategoryInput)
      return reply.send(ok(result, 'Catégorie mise à jour'))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Categories'],
      summary: 'Supprimer une catégorie personnalisée',
      description: 'Impossible si des dépenses sont encore liées (409). Réassigne d\'abord les dépenses concernées.',
      security: [{ bearerAuth: [] }],
      params: CategoryParamsSchema,
      response: { 204: z.null(), 401: r401, 403: r403, 404: r404, 409: r409 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof CategoryParamsSchema>
      await service.delete(request.user.sub, id)
      return reply.status(204).send()
    },
  })
}

export default categoriesRoutes
