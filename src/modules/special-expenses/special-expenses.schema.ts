import { z } from 'zod/v4'
import { wrapResponse } from '../../utils/schema.js'

/** Corps de la requête de création d'une dépense planifiée */
export const CreateSpecialExpenseSchema = z.object({
  name: z.string().min(2),
  estimatedAmount: z.number().positive(),
  scheduledDate: z.iso.datetime(),
  remindDaysBefore: z.array(z.number().int().positive())
    .default([7, 3, 1])
    .describe('Nombre de jours avant la date prévue où envoyer un rappel (ex: [7, 3, 1])'),
  note: z.string().optional(),
})

/** Corps de la requête de modification d'une dépense planifiée (tous les champs optionnels) */
export const UpdateSpecialExpenseSchema = CreateSpecialExpenseSchema.partial()

/** Corps de la requête de marquage d'une dépense comme complétée */
export const MarkCompletedSchema = z.object({
  actualAmount: z.number().positive().optional().describe('Montant réellement payé (si différent de l\'estimation)'),
  note: z.string().optional(),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

/** Schéma complet d'une dépense planifiée dans les réponses API */
export const SpecialExpenseData = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().describe('Nom de la dépense planifiée (ex: Loyer mai, Assurance véhicule)'),
  estimatedAmount: z.number().describe('Montant estimé'),
  actualAmount: z.number().nullable().describe('Montant réel payé, renseigné lors du marquage comme complété'),
  scheduledDate: z.string().describe('Date prévue pour la dépense ISO 8601'),
  remindDaysBefore: z.array(z.number()).describe('Rappels en jours avant la date (ex: [7,3,1] = rappel J-7, J-3, J-1)'),
  isCompleted: z.boolean().describe('true une fois la dépense effectuée'),
  completedAt: z.string().nullable().describe('Date à laquelle la dépense a été marquée comme complétée'),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Réponse contenant la liste de toutes les dépenses planifiées */
export const SpecialExpenseListResponse = wrapResponse(z.array(SpecialExpenseData))

/** Réponse contenant une seule dépense planifiée */
export const SpecialExpenseResponse = wrapResponse(SpecialExpenseData)

/** Type TypeScript inféré du schéma de création de dépense planifiée */
export type CreateSpecialExpenseInput = z.infer<typeof CreateSpecialExpenseSchema>

/** Type TypeScript inféré du schéma de modification de dépense planifiée */
export type UpdateSpecialExpenseInput = z.infer<typeof UpdateSpecialExpenseSchema>

/** Type TypeScript inféré du schéma de marquage comme complété */
export type MarkCompletedInput = z.infer<typeof MarkCompletedSchema>
