import { FastifyPluginAsync } from 'fastify'
import { NotificationsService } from './notifications.service.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { z } from 'zod/v4'
import { wrapResponse, r401, r404 } from '../../utils/schema.js'

const ParamsSchema = z.object({ id: z.string() })
const QuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional().describe('true = non lues uniquement'),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const NotificationData = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().describe('Titre de la notification'),
  body: z.string().describe('Corps du message'),
  type: z.string().describe('Type : reminder | alert | advice | goal'),
  isRead: z.boolean().describe('false = non lue (badge à afficher)'),
  sentAt: z.string().describe('Date d\'envoi ISO 8601'),
  data: z.any().nullable().describe('Données additionnelles liées à la notification'),
})

const NotificationListResponse = wrapResponse(z.object({
  notifications: z.array(NotificationData),
  meta: z.object({
    total: z.number().describe('Nombre total de notifications'),
    page: z.number(),
    limit: z.number(),
    pages: z.number().describe('Nombre total de pages'),
  }),
}))
const NotificationResponse = wrapResponse(NotificationData)
const UnreadCountResponse = wrapResponse(
  z.object({ count: z.number().describe('Nombre de notifications non lues (valeur du badge app)') })
)
const MarkAllReadResponse = wrapResponse(
  z.object({ updated: z.number().describe('Nombre de notifications marquées comme lues') })
)

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new NotificationsService(fastify.prisma)
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', {
    schema: {
      tags: ['Notifications'],
      summary: 'Lister les notifications',
      description: 'Retourne les notifications paginées, triées de la plus récente. Filtrables par statut lu/non lu.',
      security: [{ bearerAuth: [] }],
      querystring: QuerySchema,
      response: { 200: NotificationListResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const { unread, page, limit } = request.query as z.infer<typeof QuerySchema>
      return reply.send(ok(
        await service.findAll(request.user.sub, unread === 'true' ? true : undefined, page, limit)
      ))
    },
  })

  fastify.get('/count', {
    schema: {
      tags: ['Notifications'],
      summary: 'Nombre de notifications non lues',
      description: 'Retourne le count pour le badge rouge sur l\'icône notifications de l\'app.',
      security: [{ bearerAuth: [] }],
      response: { 200: UnreadCountResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      return reply.send(ok(await service.getUnreadCount(request.user.sub)))
    },
  })

  fastify.patch('/:id/read', {
    schema: {
      tags: ['Notifications'],
      summary: 'Marquer une notification comme lue',
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      response: { 200: NotificationResponse, 401: r401, 404: r404 },
    },
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>
      return reply.send(ok(await service.markRead(request.user.sub, id), 'Notification marquée comme lue'))
    },
  })

  fastify.post('/read-all', {
    schema: {
      tags: ['Notifications'],
      summary: 'Marquer toutes les notifications comme lues',
      description: 'Vide le badge de l\'app en une seule requête.',
      security: [{ bearerAuth: [] }],
      response: { 200: MarkAllReadResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      return reply.send(ok(await service.markAllRead(request.user.sub), 'Toutes les notifications ont été marquées comme lues'))
    },
  })

  fastify.delete('/:id', {
    schema: {
      tags: ['Notifications'],
      summary: 'Supprimer une notification',
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

export default notificationsRoutes
