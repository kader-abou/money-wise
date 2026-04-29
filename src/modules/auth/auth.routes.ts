import { FastifyPluginAsync } from 'fastify'
import { AuthService } from './auth.service.js'
import { z } from 'zod/v4'
import {
  RegisterSchema, LoginSchema, UpdateProfileSchema,
  type RegisterInput, type LoginInput, type UpdateProfileInput,
} from './auth.schema.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { ok } from '../../utils/response.js'
import { wrapResponse, r401, r409, r422 } from '../../utils/schema.js'

const ChangePasswordSchema = z.object({ newPassword: z.string().min(8) })

const UserData = z.object({
  id: z.string().describe('UUID Supabase de l\'utilisateur'),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable().optional(),
  currency: z.enum(['XOF', 'EUR', 'USD', 'GNF', 'XAF']),
  timezone: z.string().optional(),
  plan: z.enum(['FREE', 'PREMIUM', 'FAMILY']).describe('FREE = accès standard, PREMIUM = stats avancées'),
  planExpiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  reminderEnabled: z.boolean(),
  createdAt: z.union([z.string(), z.date()]).optional(),
})

const SessionData = z.object({
  access_token: z.string().describe('JWT à inclure dans Authorization: Bearer <token>'),
  refresh_token: z.string().describe('Token de renouvellement (géré automatiquement par le SDK Supabase)'),
  expires_in: z.number().describe('Durée de validité en secondes'),
  token_type: z.literal('bearer'),
})

const AuthResponse = wrapResponse(z.object({ user: UserData, session: SessionData }))
const ProfileResponse = wrapResponse(UserData)

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AuthService(fastify.prisma, fastify.supabase)

  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: "Inscription d'un nouvel utilisateur",
      description: 'Crée un compte Supabase Auth + profil utilisateur. Retourne un token de session directement utilisable.',
      body: RegisterSchema,
      response: { 201: AuthResponse, 409: r409, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.register(request.body as RegisterInput)
      return reply.status(201).send(ok(result, 'Inscription réussie'))
    },
  })

  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Connexion utilisateur',
      description: 'Retourne un `access_token` JWT à utiliser dans `Authorization: Bearer <token>` pour toutes les routes protégées.',
      body: LoginSchema,
      response: { 200: AuthResponse, 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.login(request.body as LoginInput)
      return reply.send(ok(result, 'Connexion réussie'))
    },
  })

  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: "Profil de l'utilisateur connecté",
      security: [{ bearerAuth: [] }],
      response: { 200: ProfileResponse, 401: r401 },
    },
    handler: async (request, reply) => {
      const result = await service.getProfile(request.user.sub)
      return reply.send(ok(result))
    },
  })

  fastify.patch('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Mettre à jour le profil',
      description: 'Met à jour nom, téléphone, devise, timezone, horaires de rappels.',
      security: [{ bearerAuth: [] }],
      body: UpdateProfileSchema,
      response: { 200: ProfileResponse, 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const result = await service.updateProfile(request.user.sub, request.body as UpdateProfileInput)
      return reply.send(ok(result, 'Profil mis à jour'))
    },
  })

  fastify.post('/change-password', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Changer le mot de passe',
      security: [{ bearerAuth: [] }],
      body: ChangePasswordSchema,
      response: { 200: wrapResponse(z.object({ message: z.string() })), 401: r401, 422: r422 },
    },
    handler: async (request, reply) => {
      const { newPassword } = request.body as z.infer<typeof ChangePasswordSchema>
      const result = await service.changePassword(request.user.sub, newPassword)
      return reply.send(ok(result))
    },
  })

  fastify.post('/logout', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Déconnexion',
      description: 'Invalide la session côté Supabase. Le token ne sera plus accepté.',
      security: [{ bearerAuth: [] }],
      response: { 200: wrapResponse(z.null()), 401: r401 },
    },
    handler: async (request, reply) => {
      const token = request.headers.authorization!.slice(7)
      await service.logout(token)
      return reply.send(ok(null, 'Déconnexion réussie'))
    },
  })
}

export default authRoutes
