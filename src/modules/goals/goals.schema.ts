import { z } from 'zod/v4'
import { wrapResponse } from '../../utils/schema.js'

/** Corps de la requête de création d'un objectif d'épargne */
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

/** Corps de la requête de modification d'un objectif (tous les champs optionnels) */
export const UpdateGoalSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  targetAmount: z.number().positive().optional(),
  monthlyTarget: z.number().positive().optional(),
  deadline: z.coerce.date().optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

/** Corps de la requête d'ajout d'un versement sur un objectif */
export const AddContributionSchema = z.object({
  amount: z.number().positive('Le montant doit être positif'),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().max(500).optional(),
})

/** Corps de la requête de bilan mensuel d'un objectif */
export const MonthlyCheckSchema = z.object({
  goalId: z.string().cuid(),
  isAchieved: z.boolean(),
  actualAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
})

/** Paramètres d'URL contenant l'identifiant de l'objectif */
export const GoalParamsSchema = z.object({
  id: z.string().cuid('ID invalide'),
})

// ─── Response schemas ─────────────────────────────────────────────────────────

/** Schéma d'un versement individuel sur un objectif */
const ContributionData = z.object({
  id: z.string().describe('Identifiant unique du versement'),
  goalId: z.string().describe("ID de l'objectif parent"),
  amount: z.number().describe('Montant versé'),
  note: z.string().nullable().describe('Note optionnelle sur le versement'),
  date: z.string().describe('Date du versement ISO 8601'),
  createdAt: z.string().describe('Date de création ISO 8601'),
})

/** Schéma complet d'un objectif d'épargne avec progression et versements */
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

/** Schéma d'un élément du récapitulatif mensuel d'objectif */
const RecapItemData = z.object({
  id: z.string(),
  name: z.string(),
  monthlyTarget: z.number().describe('Objectif mensuel défini'),
  amountContributed: z.number().describe('Montant réellement versé ce mois'),
  achieved: z.boolean().describe('true si l\'objectif mensuel est atteint'),
  shortfall: z.number().describe('Manque à combler (0 si atteint)'),
  advice: z.string().nullable().describe('Conseil personnalisé si objectif non atteint'),
})

/** Réponse contenant la liste de tous les objectifs actifs */
export const GoalListResponse = wrapResponse(z.array(GoalData))

/** Réponse contenant un seul objectif */
export const GoalResponse = wrapResponse(GoalData)

/** Réponse après ajout d'un versement : objectif mis à jour + message de félicitations */
export const GoalContributeResponse = wrapResponse(
  z.object({
    goal: GoalData,
    message: z.string().describe('Félicitations si objectif atteint, confirmation sinon'),
  })
)

/** Réponse du récapitulatif mensuel de tous les objectifs avec versements */
export const GoalRecapResponse = wrapResponse(z.array(RecapItemData))

/** Type TypeScript inféré du schéma de création d'objectif */
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>

/** Type TypeScript inféré du schéma de modification d'objectif */
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>

/** Type TypeScript inféré du schéma d'ajout de versement */
export type AddContributionInput = z.infer<typeof AddContributionSchema>
