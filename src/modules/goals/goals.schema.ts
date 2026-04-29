import { z } from 'zod/v4'
import { wrapResponse } from '../../utils/schema.js'

export const CreateGoalSchema = z.object({
  name: z.string().min(2).max(100),
  targetAmount: z.number().positive(),
  monthlyTarget: z.number().positive().optional(),
  deadline: z.coerce.date().refine((d) => d > new Date(), {
    message: "La date d'échéance doit être dans le futur",
  }),
  icon: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex invalide (ex: #3B82F6)')
    .optional(),
})

export const UpdateGoalSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  targetAmount: z.number().positive().optional(),
  monthlyTarget: z.number().positive().optional(),
  deadline: z.coerce.date().optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export const AddContributionSchema = z.object({
  amount: z.number().positive('Le montant doit être positif'),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().max(500).optional(),
})

export const MonthlyCheckSchema = z.object({
  goalId: z.string().cuid(),
  isAchieved: z.boolean(),
  actualAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
})

export const GoalParamsSchema = z.object({
  id: z.string().cuid('ID invalide'),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

const ContributionData = z.object({
  id: z.string().describe('Identifiant unique du versement'),
  goalId: z.string().describe("ID de l'objectif parent"),
  amount: z.number().describe('Montant versé'),
  note: z.string().nullable().describe('Note optionnelle sur le versement'),
  date: z.string().describe('Date du versement ISO 8601'),
  createdAt: z.string().describe('Date de création ISO 8601'),
})

export const GoalData = z.object({
  id: z.string().describe("Identifiant unique de l'objectif"),
  userId: z.string().describe("UUID de l'utilisateur"),
  name: z.string().describe("Nom de l'objectif (ex: Téléphone Samsung, Voyage Maldives)"),
  targetAmount: z.number().describe('Montant total à atteindre'),
  currentAmount: z.number().describe('Montant déjà épargné'),
  monthlyTarget: z.number().nullable().describe('Objectif de versement mensuel recommandé'),
  deadline: z.string().describe("Date limite pour atteindre l'objectif ISO 8601"),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).describe('ACTIVE = en cours, COMPLETED = atteint, CANCELLED = abandonné'),
  icon: z.string().nullable().describe('Emoji représentant l\'objectif'),
  color: z.string().nullable().describe('Couleur hexadécimale pour l\'affichage'),
  contributions: z.array(ContributionData).describe('5 derniers versements (tous pour GET /:id)'),
  remaining: z.number().describe('Montant restant à épargner'),
  percentage: z.number().describe('Pourcentage de progression (0-100+)'),
  daysLeft: z.number().describe('Nombre de jours avant la deadline'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const RecapItemData = z.object({
  id: z.string(),
  name: z.string(),
  monthlyTarget: z.number().describe('Objectif mensuel défini'),
  amountContributed: z.number().describe('Montant réellement versé ce mois'),
  achieved: z.boolean().describe('true si l\'objectif mensuel est atteint'),
  shortfall: z.number().describe('Manque à combler (0 si atteint)'),
  advice: z.string().nullable().describe('Conseil personnalisé si objectif non atteint'),
})

export const GoalListResponse = wrapResponse(z.array(GoalData))
export const GoalResponse = wrapResponse(GoalData)
export const GoalContributeResponse = wrapResponse(
  z.object({
    goal: GoalData,
    message: z.string().describe('Félicitations si objectif atteint, confirmation sinon'),
  })
)
export const GoalRecapResponse = wrapResponse(z.array(RecapItemData))

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
export type AddContributionInput = z.infer<typeof AddContributionSchema>
