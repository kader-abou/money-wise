import { FastifyRequest, FastifyReply } from 'fastify'

export interface AuthUser {
  sub: string
  email: string
  plan: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token manquant. Veuillez vous connecter.' },
    })
  }

  const token = authHeader.slice(7)
  const { data, error } = await request.server.supabase.auth.getUser(token)

  if (error || !data.user) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token invalide ou expiré. Veuillez vous reconnecter.' },
    })
  }

  const dbUser = await request.server.prisma.user.findUnique({
    where: { id: data.user.id },
    select: { plan: true, planExpiresAt: true },
  })

  let plan = dbUser?.plan ?? 'FREE'

  // Downgrade silencieux si le plan Premium a expiré
  if (plan !== 'FREE' && dbUser?.planExpiresAt && dbUser.planExpiresAt < new Date()) {
    plan = 'FREE'
    request.server.prisma.user.update({
      where: { id: data.user.id },
      data: { plan: 'FREE', planExpiresAt: null },
    }).catch(() => {})
  }

  request.user = {
    sub: data.user.id,
    email: data.user.email!,
    plan,
  }
}
