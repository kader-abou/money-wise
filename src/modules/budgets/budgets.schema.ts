import { z } from 'zod/v4'
import { wrapResponse, CategoryData } from '../../utils/schema.js'

const CategoryAllocation = z.object({
  categoryId: z.string().min(1, 'La catégorie est requise'),
  amount: z.number().positive('Le montant doit être positif'),
})

export const CreateBudgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  totalAmount: z.number().positive('Le budget total doit être positif'),
  note: z.string().max(500).optional(),
  categories: z
    .array(CategoryAllocation)
    .min(1, 'Au moins une catégorie requise')
    .refine(
      (cats) => {
        const ids = cats.map((c) => c.categoryId)
        return new Set(ids).size === ids.length
      },
      { message: 'Chaque catégorie ne peut apparaître qu\'une seule fois' },
    ),
})

export const UpdateBudgetSchema = z.object({
  totalAmount: z.number().positive().optional(),
  note: z.string().max(500).optional(),
  categories: z.array(CategoryAllocation).optional(),
})

export const BudgetParamsSchema = z.object({
  id: z.string().min(1, 'ID invalide'),
})

export const BudgetQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

const BudgetCategoryData = z.object({
  id: z.string(),
  budgetId: z.string(),
  categoryId: z.string(),
  category: CategoryData,
  amount: z.number().describe('Montant alloué à cette catégorie'),
  spent: z.number().describe('Montant dépensé dans cette catégorie'),
  remaining: z.number().describe('Montant restant (amount - spent)'),
  percentage: z.number().describe('Pourcentage consommé (0-100+)'),
  status: z.enum(['green', 'orange', 'red', 'black']).describe('green < 50% | orange 50-80% | red 80-100% | black > 100%'),
})

export const BudgetData = z.object({
  id: z.string(),
  userId: z.string(),
  month: z.number().describe('Mois (1-12)'),
  year: z.number().describe('Année'),
  totalAmount: z.number().describe('Budget total du mois'),
  note: z.string().nullable(),
  totalSpent: z.number().describe('Total dépensé toutes catégories confondues'),
  remaining: z.number().describe('Budget restant'),
  percentage: z.number().describe('Pourcentage du budget consommé'),
  status: z.enum(['green', 'orange', 'red', 'black']).describe('Statut global du budget'),
  categories: z.array(BudgetCategoryData).describe('Détail par catégorie'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const BudgetListResponse = wrapResponse(z.array(BudgetData))
export const BudgetResponse = wrapResponse(BudgetData)

export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>
