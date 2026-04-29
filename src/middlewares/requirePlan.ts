import { FastifyRequest, FastifyReply } from 'fastify'

export function requirePlan(...plans: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userPlan = (request.user as any).plan
    if (!plans.includes(userPlan)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'PREMIUM_REQUIRED',
          message: `Cette fonctionnalité nécessite un abonnement ${plans.join(' ou ')}. Passez à MoneyWise Premium !`,
        },
      })
    }
  }
}
