import { z } from 'zod/v4'

/** Corps de la requête d'inscription : email, mot de passe, prénom/nom, devise */
export const RegisterSchema = z.object({
  email: z.string().email('Email invalide'),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/, 'Numéro de téléphone invalide')
    .optional(),
  firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(50),
  lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(50),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  currency: z.enum(['XOF', 'EUR', 'USD', 'GNF', 'XAF']).default('XOF'),
})

/** Corps de la requête de connexion : email, mot de passe, token FCM optionnel */
export const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  fcmToken: z.string().optional(),
})

/** Corps de la requête de renouvellement de session via refresh token */
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
})

/** Corps de la requête de changement de mot de passe (authentifié) */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

/** Corps de la requête de mise à jour du profil utilisateur (tous les champs optionnels) */
export const UpdateProfileSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
  currency: z.enum(['XOF', 'EUR', 'USD', 'GNF', 'XAF']).optional(),
  timezone: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminder1Time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:mm requis').optional(),
  reminder2Time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:mm requis').optional(),
  reminder3Time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:mm requis').optional(),
})

/** Type TypeScript inféré du schéma d'inscription */
export type RegisterInput = z.infer<typeof RegisterSchema>

/** Type TypeScript inféré du schéma de connexion */
export type LoginInput = z.infer<typeof LoginSchema>

/** Type TypeScript inféré du schéma de refresh token */
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>

/** Type TypeScript inféré du schéma de changement de mot de passe */
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>

/** Type TypeScript inféré du schéma de mise à jour du profil */
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
