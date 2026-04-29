import { z } from 'zod/v4'
import { wrapResponse } from '../../utils/schema.js'

export const CreateSpecialExpenseSchema = z.object({
  name: z.string().min(2),
  estimatedAmount: z.number().positive(),
  scheduledDate: z.string().datetime(),
  remindDaysBefore: z.array(z.number().int().positive())
    .default([7, 3, 1])
    .describe('Nombre de jours avant la date prévue où envoyer un rappel (ex: [7, 3, 1])'),
  note: z.string().optional(),
})

export const UpdateSpecialExpenseSchema = CreateSpecialExpenseSchema.partial()

export const MarkCompletedSchema = z.object({
  actualAmount: z.number().positive().optional().describe('Montant réellement payé (si différent de l\'estimation)'),
  note: z.string().optional(),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

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

export const SpecialExpenseListResponse = wrapResponse(z.array(SpecialExpenseData))
export const SpecialExpenseResponse = wrapResponse(SpecialExpenseData)

export type CreateSpecialExpenseInput = z.infer<typeof CreateSpecialExpenseSchema>
export type UpdateSpecialExpenseInput = z.infer<typeof UpdateSpecialExpenseSchema>
export type MarkCompletedInput = z.infer<typeof MarkCompletedSchema>
