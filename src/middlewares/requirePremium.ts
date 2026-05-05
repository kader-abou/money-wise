import { FastifyRequest, FastifyReply } from 'fastify'

const PREMIUM_PLANS = ['PREMIUM', 'FAMILY']

/** Refuse l'accès avec 403 si l'utilisateur n'a pas un plan Premium ou Family. */
export async function requirePremium(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!PREMIUM_PLANS.includes(request.user.plan)) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'PREMIUM_REQUIRED',
        message: 'Cette fonctionnalité est réservée aux abonnés Premium. Passe à Premium pour y accéder.',
      },
    })
  }
}
