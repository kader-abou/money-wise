import { z } from 'zod/v4'

/** Corps de la requête de création d'une catégorie personnalisée */
export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide (format #RRGGBB)').optional(),
})

/** Corps de la requête de modification d'une catégorie (tous les champs optionnels) */
export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide (format #RRGGBB)').optional(),
})

/** Paramètres d'URL contenant l'identifiant de la catégorie */
export const CategoryParamsSchema = z.object({
  id: z.string().min(1, 'ID invalide'),
})

/** Type TypeScript inféré du schéma de création de catégorie */
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>

/** Type TypeScript inféré du schéma de modification de catégorie */
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>
