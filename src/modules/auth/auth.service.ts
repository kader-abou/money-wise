import { PrismaClient } from '@prisma/client'
import { SupabaseClient } from '@supabase/supabase-js'
import { RegisterInput, LoginInput, UpdateProfileInput } from './auth.schema.js'
import { fail } from '../../utils/response.js'

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private supabase: SupabaseClient,
  ) {}

  /**
   * Inscrit un nouvel utilisateur.
   * Crée le compte dans Supabase Auth, puis le profil dans la table `users`.
   * @throws 409 si l'email est déjà utilisé
   */
  async register(input: RegisterInput) {
    const { data, error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { firstName: input.firstName, lastName: input.lastName },
      },
    })

    if (error) {
      const code = error.message.includes('already') ? 409 : 400
      throw { statusCode: code, ...fail('AUTH_ERROR', error.message) }
    }

    const authUser = data.user!

    const user = await this.prisma.user.create({
      data: {
        id: authUser.id,
        email: authUser.email!,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        currency: input.currency,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, currency: true, timezone: true, plan: true,
        planExpiresAt: true, reminderEnabled: true, createdAt: true,
      },
    })

    return { user, session: data.session }
  }

  /**
   * Connecte un utilisateur existant.
   * Met à jour le FCM token si fourni (nécessaire pour les notifications push).
   * @throws 401 si les identifiants sont incorrects
   */
  async login(input: LoginInput) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })

    if (error || !data.user) {
      throw { statusCode: 401, ...fail('INVALID_CREDENTIALS', 'Email ou mot de passe incorrect') }
    }

    if (input.fcmToken) {
      await this.prisma.user.update({
        where: { id: data.user.id },
        data: { fcmToken: input.fcmToken },
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: data.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, currency: true, timezone: true, plan: true,
        planExpiresAt: true, reminderEnabled: true, createdAt: true,
      },
    })

    return { user, session: data.session }
  }

  /**
   * Renouvelle la session à partir d'un refresh token Supabase.
   * @throws 401 si le refresh token est invalide ou expiré
   */
  async refreshSession(refreshToken: string) {
    const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken })

    if (error || !data.session) {
      throw { statusCode: 401, ...fail('INVALID_REFRESH_TOKEN', 'Refresh token invalide ou expiré') }
    }

    return { session: data.session }
  }

  /**
   * Change le mot de passe via l'API admin Supabase.
   * Ne nécessite pas l'ancien mot de passe — la vérification est faite en amont via le token.
   * @throws 400 si Supabase retourne une erreur
   */
  async changePassword(userId: string, newPassword: string) {
    const { error } = await this.supabase.auth.admin.updateUserById(userId, { password: newPassword })

    if (error) throw { statusCode: 400, ...fail('AUTH_ERROR', error.message) }

    return { message: 'Mot de passe mis à jour avec succès' }
  }

  /**
   * Récupère le profil complet d'un utilisateur incluant ses préférences de rappels.
   * @throws 404 si l'utilisateur n'existe pas dans la table `users`
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, phone: true, firstName: true, lastName: true,
        currency: true, timezone: true, plan: true, planExpiresAt: true,
        reminderEnabled: true, reminder1Time: true, reminder2Time: true,
        reminder3Time: true, createdAt: true,
      },
    })

    if (!user) throw { statusCode: 404, ...fail('NOT_FOUND', 'Utilisateur introuvable') }
    return user
  }

  /**
   * Met à jour les informations de profil (prénom, devise, rappels, etc.).
   * Ne touche pas aux credentials Supabase Auth (email/mot de passe).
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        currency: true, reminderEnabled: true,
        reminder1Time: true, reminder2Time: true, reminder3Time: true,
      },
    })
  }

  /**
   * Révoque la session active côté Supabase.
   * Le token devient immédiatement invalide.
   */
  async logout(accessToken: string) {
    await this.supabase.auth.admin.signOut(accessToken)
  }
}
