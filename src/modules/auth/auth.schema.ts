import { z } from 'zod/v4'

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

export const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  fcmToken: z.string().optional(),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
})

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

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
