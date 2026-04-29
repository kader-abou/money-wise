import { z } from 'zod/v4'

/** Enveloppe une réponse de succès dans le format standard { success, data, message? } */
export function wrapResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true).describe('Toujours true pour une réponse réussie'),
    data: dataSchema,
    message: z.string().optional().describe('Message informatif optionnel'),
  })
}

/** Réponse d'erreur standard */
export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().describe('Code machine (ex: NOT_FOUND, BUDGET_EXISTS, VALIDATION_ERROR)'),
    message: z.string().describe('Message lisible'),
    details: z.any().optional().describe('Détails de validation (présent pour les erreurs 422)'),
  }),
})

/** Raccourcis par code HTTP */
export const r401 = ErrorResponse.describe('Token manquant ou expiré')
export const r403 = ErrorResponse.describe('Accès refusé (ex: abonnement Premium requis, ressource système)')
export const r404 = ErrorResponse.describe('Ressource introuvable')
export const r409 = ErrorResponse.describe('Conflit (ex: budget déjà existant, catégorie dupliquée)')
export const r422 = ErrorResponse.describe('Données invalides (erreur de validation Zod)')

/** Schéma commun d'une catégorie */
export const CategoryData = z.object({
  id: z.string().describe('Identifiant unique de la catégorie'),
  userId: z.string().nullable().describe('null pour les catégories système, UUID pour les catégories personnalisées'),
  name: z.string().describe('Nom de la catégorie'),
  icon: z.string().nullable().describe('Emoji ou icône'),
  color: z.string().nullable().describe('Couleur hexadécimale (#RRGGBB)'),
  isSystem: z.boolean().describe('true = catégorie prédéfinie, false = créée par l\'utilisateur'),
  createdAt: z.string().describe('Date de création ISO 8601'),
})
