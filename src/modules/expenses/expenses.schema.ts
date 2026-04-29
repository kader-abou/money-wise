import { z } from 'zod/v4'
import { wrapResponse, CategoryData } from '../../utils/schema.js'

export const CreateExpenseSchema = z.object({
  amount: z.number().positive('Le montant doit être positif'),
  categoryId: z.string().min(1, 'La catégorie est requise'),
  description: z.string().max(500).optional(),
  date: z.coerce.date(),
  budgetId: z.string().optional(),
  isRecurring: z.boolean().optional(),
})

export const UpdateExpenseSchema = z.object({
  amount: z.number().positive().optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  date: z.coerce.date().optional(),
  isRecurring: z.boolean().optional(),
})

export const ExpenseParamsSchema = z.object({
  id: z.string().min(1, 'ID invalide'),
})

export const ExpenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().optional().describe('Filtrer par catégorie'),
  from: z.coerce.date().optional().describe('Date de début (ISO 8601)'),
  to: z.coerce.date().optional().describe('Date de fin (ISO 8601)'),
  budgetId: z.string().optional().describe('Filtrer par budget'),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

export const ExpenseData = z.object({
  id: z.string(),
  userId: z.string(),
  budgetId: z.string().nullable().describe('Budget associé, null si non rattaché'),
  categoryId: z.string(),
  category: CategoryData,
  amount: z.number().describe('Montant de la dépense'),
  description: z.string().nullable().describe('Description libre'),
  date: z.string().describe('Date de la dépense ISO 8601'),
  isRecurring: z.boolean().describe('true si la dépense est récurrente (abonnement, loyer…)'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ExpenseListResponse = wrapResponse(
  z.object({
    expenses: z.array(ExpenseData),
    meta: z.object({
      total: z.number().describe('Nombre total de dépenses'),
      page: z.number(),
      limit: z.number(),
      pages: z.number().describe('Nombre total de pages'),
    }),
  })
)

export const ExpenseResponse = wrapResponse(ExpenseData)

export const CreateExpenseResponse = wrapResponse(
  z.object({
    expense: ExpenseData,
    budgetAlert: z.string().nullable().describe('Alerte si seuil 50%/80%/100% du budget atteint'),
  })
)

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>
export type ExpenseQueryInput = z.infer<typeof ExpenseQuerySchema>
