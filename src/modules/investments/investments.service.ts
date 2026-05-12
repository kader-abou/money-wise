import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { fail } from '../../utils/response.js'

/** Identifiant d'un provider IA supporté. */
export type LLMProvider = 'anthropic' | 'google' | 'groq' | 'xai' | 'openai'

/**
 * Retourne la liste des providers qui ont une clé API définie dans l'environnement.
 * Groq et Google sont placés en tête car ils sont gratuits et rapides.
 */
function availableProviders(): LLMProvider[] {
  const all: Array<[LLMProvider, string | undefined]> = [
    ['groq',      process.env.GROQ_API_KEY],
    ['google',    process.env.GOOGLE_AI_API_KEY],
    ['openai',    process.env.OPENAI_API_KEY],
    ['anthropic', process.env.ANTHROPIC_API_KEY],
    ['xai',       process.env.XAI_API_KEY],
  ]
  return all.filter(([, key]) => !!key).map(([provider]) => provider)
}

/**
 * Mélange un tableau dans un ordre aléatoire (algorithme Fisher-Yates).
 * Utilisé pour répartir la charge entre les providers en mode auto.
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Métadonnées label/modèle par provider. */
const PROVIDERS: Record<LLMProvider, { label: string; model: string }> = {
  anthropic: { label: 'Claude Opus 4.7',          model: 'claude-opus-4-7' },
  google:    { label: 'Gemini 3 Flash Preview',    model: 'gemini-3-flash-preview' },
  groq:      { label: 'LLaMA 3.3 70B (Groq)',      model: 'llama-3.3-70b-versatile' },
  xai:       { label: 'Grok 4 Reasoning (xAI)',    model: 'grok-4.20-reasoning' },
  openai:    { label: 'GPT-4o (OpenAI)',           model: 'gpt-4o' },
}

const SYSTEM_PROMPT = `Tu es un conseiller financier expert spécialisé dans l'Afrique de l'Ouest (zone UEMOA/CEDEAO).
Tu analyses la situation financière personnelle d'un utilisateur et fournis des conseils d'investissement personnalisés, directs et actionnables en français.

Produits d'investissement disponibles :
- Mobile Money (Djamo, Wave) : 3-5%/an, minimum 5 000 XOF, risque faible, liquidité immédiate
- Microfinance SFD agréée : 6-9%/an, minimum 25 000 XOF, risque faible, 6-24 mois
- BRVM (bourse régionale UEMOA) : 8-15%/an, minimum 50 000 XOF, risque élevé, 2-5 ans
- Bons du Trésor BCEAO : 5-7%/an, minimum 100 000 XOF, risque faible, 3-12 mois
- Crowdfunding Immobilier : 8-12%/an, minimum 200 000 XOF, risque moyen, 1-3 ans

Règles strictes :
- Ne recommande que ce qui est accessible avec le montant disponible
- Contextualise chaque conseil aux données réelles de l'utilisateur
- Sois honnête : si la situation est préoccupante, dis-le clairement
- Réponds UNIQUEMENT en JSON valide selon le format demandé`

const JSON_INSTRUCTION = `
Réponds avec ce JSON exact (aucun texte avant ou après) :
{
  "analysis": "string — analyse de 2-3 phrases sur la situation réelle",
  "advice": [
    { "title": "string", "description": "string", "priority": "high|medium|low" }
  ],
  "investmentOptions": [
    {
      "type": "string (MOBILE_MONEY|MICROFINANCE|BRVM|TREASURY_BILLS|REAL_ESTATE_CROWDFUNDING)",
      "title": "string",
      "description": "string",
      "expectedReturn": "string",
      "minAmount": number,
      "riskLevel": "LOW|MEDIUM|HIGH",
      "timeHorizon": "string",
      "recommended": boolean,
      "personalizedReason": "string — pourquoi CETTE option pour CET utilisateur"
    }
  ],
  "warnings": ["string"]
}`

export class InvestmentsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Sélectionne automatiquement un provider IA disponible et retourne des conseils personnalisés.
   *
   * Algorithme :
   * 1. Filtre les providers qui ont une clé API configurée.
   * 2. Les mélange aléatoirement pour répartir la charge.
   * 3. Essaie chaque provider dans l'ordre — si l'un échoue (rate limit, erreur réseau),
   *    passe silencieusement au suivant.
   * 4. Retourne le premier résultat réussi (depuis le cache ou frais).
   *
   * @param userId   - UUID de l'utilisateur connecté
   * @param amount   - Montant disponible à investir
   * @param currency - Devise (ex: XOF)
   * @throws 503 si aucune clé API n'est configurée
   * @throws 503 si tous les providers ont échoué, avec le détail de chaque erreur
   */
  async getAutoAdvice(userId: string, amount: number, currency: string) {
    const providers = shuffle(availableProviders())

    if (providers.length === 0) {
      throw {
        statusCode: 503,
        ...fail('NO_PROVIDER', 'Aucune clé API IA configurée. Ajoute au moins GROQ_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY.'),
      }
    }

    const errors: string[] = []

    for (const provider of providers) {
      try {
        return await this.getPersonalizedAdvice(userId, amount, currency, provider)
      } catch (err: any) {
        const msg = err?.error?.message ?? err?.message ?? String(err)
        errors.push(`${PROVIDERS[provider].label}: ${msg}`)
        console.warn(`[Auto] ${provider} a échoué, on essaie le suivant...`)
      }
    }

    throw {
      statusCode: 503,
      ...fail('ALL_PROVIDERS_FAILED', `Tous les providers IA ont échoué. Détails : ${errors.join(' | ')}`),
    }
  }

  /**
   * Génère des conseils d'investissement personnalisés via un provider IA spécifique.
   *
   * Retourne le cache de la journée si disponible pour éviter de consommer des tokens inutilement.
   * Sinon, collecte le contexte financier réel de l'utilisateur (dépenses, objectifs, budget)
   * et envoie une requête à l'IA. Le résultat est mis en cache jusqu'à minuit.
   *
   * @param userId   - UUID de l'utilisateur connecté
   * @param amount   - Montant disponible à investir
   * @param currency - Devise (ex: XOF)
   * @param provider - Provider IA à utiliser (défaut: anthropic)
   * @throws 400 si la clé API du provider est manquante
   * @throws 500 si la réponse de l'IA n'est pas un JSON valide
   */
  async getPersonalizedAdvice(userId: string, amount: number, currency: string, provider: LLMProvider = 'anthropic') {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const tomorrowMidnight = new Date(todayStart)
    tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1)

    // ─── Retourner le cache si déjà généré aujourd'hui ────────────────────────
    const cached = await this.prisma.investmentAdviceCache.findUnique({
      where: { userId_provider: { userId, provider } },
    })

    if (cached && cached.cachedAt >= todayStart) {
      return {
        ...(cached.result as object),
        fromCache: true,
        cachedAt: cached.cachedAt.toISOString(),
        refreshAvailableAt: tomorrowMidnight.toISOString(),
        cacheMessage: `Ces conseils ont été générés aujourd'hui. Les données n'ayant pas changé, nous te retournons la même analyse pour éviter toute consommation inutile. De nouveaux conseils seront disponibles demain.`,
      }
    }

    // ─── Collecte du contexte financier réel ─────────────────────────────────
    const [expenses, goals, budget] = await Promise.all([
      this.getExpensesSummary(userId),
      this.getGoalsSummary(userId),
      this.getBudgetStatus(userId),
    ])

    const userContext = {
      montantDisponible: amount,
      devise: currency,
      depensesParCategorie: expenses,
      objectifsEpargne: goals,
      budgetMoisEnCours: budget,
    }

    const userMessage = `Analyse cette situation financière :\n\n${JSON.stringify(userContext, null, 2)}\n\n${JSON_INSTRUCTION}`

    // ─── Appel au provider IA ─────────────────────────────────────────────────
    let raw: string
    switch (provider) {
      case 'anthropic': raw = await this.callAnthropic(userMessage); break
      case 'google':    raw = await this.callGoogle(userMessage);    break
      case 'groq':      raw = await this.callGroq(userMessage);      break
      case 'xai':       raw = await this.callXAI(userMessage);       break
      case 'openai':    raw = await this.callOpenAI(userMessage);    break
      default:          throw { statusCode: 400, ...fail('INVALID_PROVIDER', `Provider inconnu : ${provider}`) }
    }

    let parsed: object
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw { statusCode: 500, ...fail('AI_PARSE_ERROR', `Réponse IA invalide (${PROVIDERS[provider].label})`) }
    }

    // ─── Mise en cache jusqu'à minuit ─────────────────────────────────────────
    const result = { amount, currency, provider: PROVIDERS[provider].label, ...parsed }

    await this.prisma.investmentAdviceCache.upsert({
      where:  { userId_provider: { userId, provider } },
      create: { userId, provider, result, cachedAt: new Date() },
      update: { result, cachedAt: new Date() },
    })

    return {
      ...result,
      fromCache: false,
      cachedAt: new Date().toISOString(),
      refreshAvailableAt: tomorrowMidnight.toISOString(),
      cacheMessage: `Analyse fraîche générée maintenant. Pour économiser les tokens, nous retournerons cette même analyse pour toute nouvelle demande aujourd'hui.`,
    }
  }

  /**
   * Appelle l'API Anthropic (Claude Opus 4.7) avec prompt caching et structured output.
   * Le system prompt est mis en cache côté Anthropic pour réduire les coûts.
   *
   * @param userMessage - Message utilisateur contenant le contexte financier + instruction JSON
   * @throws 400 si ANTHROPIC_API_KEY n'est pas configurée
   */
  private async callAnthropic(userMessage: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw { statusCode: 400, ...fail('MISSING_KEY', 'ANTHROPIC_API_KEY non configurée') }

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: PROVIDERS.anthropic.model,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    })

    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('No text block')
    return block.text
  }

  /**
   * Appelle Gemini via l'endpoint compatible OpenAI de Google AI.
   * Détecte les troncatures (finish_reason: length) et remonte une erreur explicite.
   *
   * @param userMessage - Message utilisateur contenant le contexte financier + instruction JSON
   * @throws 400 si GOOGLE_AI_API_KEY n'est pas configurée
   * @throws 429 si la limite de 15 req/min du free tier est atteinte
   * @throws 500 si la réponse est tronquée (max_tokens atteint)
   */
  private async callGoogle(userMessage: string): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw { statusCode: 400, ...fail('MISSING_KEY', 'GOOGLE_AI_API_KEY non configurée') }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })

    try {
      const response = await client.chat.completions.create({
        model: PROVIDERS.google.model,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
      })

      const choice = response.choices[0]
      if (choice?.finish_reason === 'length') {
        throw {
          statusCode: 500,
          ...fail('RESPONSE_TRUNCATED', `Gemini a tronqué sa réponse (${response.usage?.completion_tokens} tokens). Utilise ?provider=groq qui supporte plus de tokens.`),
        }
      }

      return choice?.message?.content ?? '{}'
    } catch (err: any) {
      if (err?.statusCode) throw err
      if (err?.status === 429) {
        throw { statusCode: 429, ...fail('RATE_LIMIT', 'Limite Gemini atteinte (15 req/min). Utilise ?provider=groq') }
      }
      throw err
    }
  }

  /**
   * Appelle LLaMA 3.3 70B via l'API Groq (compatible OpenAI).
   * Groq est le provider recommandé en mode auto : gratuit et très rapide.
   *
   * @param userMessage - Message utilisateur contenant le contexte financier + instruction JSON
   * @throws 400 si GROQ_API_KEY n'est pas configurée
   * @throws 429 si la limite du free tier est atteinte (14 400 req/jour, 30 req/min)
   */
  private async callGroq(userMessage: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw { statusCode: 400, ...fail('MISSING_KEY', 'GROQ_API_KEY non configurée') }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    try {
      const response = await client.chat.completions.create({
        model: PROVIDERS.groq.model,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
      })
      return response.choices[0]?.message?.content ?? '{}'
    } catch (err: any) {
      if (err?.status === 429) {
        throw {
          statusCode: 429,
          ...fail('RATE_LIMIT', 'Limite Groq atteinte. Free tier : 14 400 req/jour, 30 req/min. Réessaie dans un instant.'),
        }
      }
      throw err
    }
  }

  /**
   * Appelle GPT-4o via l'API OpenAI officielle.
   *
   * @param userMessage - Message utilisateur contenant le contexte financier + instruction JSON
   * @throws 400 si OPENAI_API_KEY n'est pas configurée
   * @throws 429 si le quota OpenAI est dépassé
   */
  private async callOpenAI(userMessage: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw { statusCode: 400, ...fail('MISSING_KEY', 'OPENAI_API_KEY non configurée') }

    const client = new OpenAI({ apiKey })

    try {
      const response = await client.chat.completions.create({
        model: PROVIDERS.openai.model,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
      })
      return response.choices[0]?.message?.content ?? '{}'
    } catch (err: any) {
      if (err?.status === 429) {
        throw { statusCode: 429, ...fail('RATE_LIMIT', 'Limite OpenAI atteinte. Vérifie ton quota sur platform.openai.com') }
      }
      throw err
    }
  }

  /**
   * Appelle Grok 4 via l'API Responses de xAI (format natif, pas compatible OpenAI).
   * Nécessite un compte xAI avec crédits sur console.x.ai.
   *
   * @param userMessage - Message utilisateur contenant le contexte financier + instruction JSON
   * @throws 400 si XAI_API_KEY n'est pas configurée
   * @throws 429 si la limite xAI est atteinte
   */
  private async callXAI(userMessage: string): Promise<string> {
    const apiKey = process.env.XAI_API_KEY
    if (!apiKey) throw { statusCode: 400, ...fail('MISSING_KEY', 'XAI_API_KEY non configurée') }

    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: PROVIDERS.xai.model,
        instructions: SYSTEM_PROMPT,
        input: userMessage,
        text: { format: { type: 'json_object' } },
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 429) {
        throw { statusCode: 429, ...fail('RATE_LIMIT', 'Limite xAI Grok atteinte. Réessaie dans un instant.') }
      }
      throw { statusCode: res.status, ...fail('XAI_ERROR', `Erreur Grok ${res.status}: ${body}`) }
    }

    const data = await res.json() as any
    const text = data?.output?.find((o: any) => o.type === 'message')
      ?.content?.find((c: any) => c.type === 'output_text')
      ?.text ?? '{}'

    return text
  }

  // ─── Context builders ────────────────────────────────────────────────────────

  /**
   * Agrège les dépenses des 3 derniers mois par catégorie avec leur pourcentage du total.
   * Triées de la plus élevée à la plus faible pour mettre en évidence les postes importants.
   *
   * @param userId - UUID de l'utilisateur
   */
  private async getExpensesSummary(userId: string) {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const expenses = await this.prisma.expense.findMany({
      where: { userId, date: { gte: threeMonthsAgo } },
      include: { category: { select: { name: true } } },
    })

    const byCategory: Record<string, number> = {}
    for (const e of expenses) {
      const name = e.category.name
      byCategory[name] = (byCategory[name] ?? 0) + Number(e.amount)
    }

    const total = Object.values(byCategory).reduce((s, v) => s + v, 0)
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => ({
        category,
        total: amount,
        pourcentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
  }

  /**
   * Retourne les objectifs d'épargne actifs avec leur progression et échéance.
   * Permet à l'IA de conseiller en tenant compte des engagements d'épargne existants.
   *
   * @param userId - UUID de l'utilisateur
   */
  private async getGoalsSummary(userId: string) {
    const goals = await this.prisma.savingGoal.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { name: true, targetAmount: true, currentAmount: true, deadline: true, monthlyTarget: true },
    })

    return goals.map((g: any) => ({
      nom: g.name,
      objectif: Number(g.targetAmount),
      epargneActuelle: Number(g.currentAmount),
      progression: Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100),
      versementMensuelRecommande: g.monthlyTarget ? Number(g.monthlyTarget) : null,
      echeance: g.deadline.toISOString().split('T')[0],
    }))
  }

  /**
   * Retourne le statut du budget du mois en cours : total, dépensé, restant,
   * et liste des catégories dépassées. Retourne null si aucun budget n'est défini.
   *
   * @param userId - UUID de l'utilisateur
   */
  private async getBudgetStatus(userId: string) {
    const now = new Date()
    const budget = await this.prisma.budget.findUnique({
      where: { userId_month_year: { userId, month: now.getMonth() + 1, year: now.getFullYear() } },
      include: { categories: { include: { category: { select: { name: true } } } } },
    })

    if (!budget) return null

    const total = Number(budget.totalAmount)
    const spent = budget.categories.reduce((s: number, c: { spent: unknown }) => s + Number(c.spent), 0)

    return {
      budgetTotal: total,
      depense: spent,
      restant: total - spent,
      pourcentageConsomme: total > 0 ? Math.round((spent / total) * 100) : 0,
      categoriesDepassees: budget.categories
        .filter((c: any) => Number(c.spent) > Number(c.amount))
        .map((c: any) => c.category.name),
    }
  }
}

// ─── JSON Schema (Anthropic structured output) ───────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string' },
    advice: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'description', 'priority'],
        additionalProperties: false,
      },
    },
    investmentOptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          expectedReturn: { type: 'string' },
          minAmount: { type: 'number' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          timeHorizon: { type: 'string' },
          recommended: { type: 'boolean' },
          personalizedReason: { type: 'string' },
        },
        required: ['type', 'title', 'description', 'expectedReturn', 'minAmount', 'riskLevel', 'timeHorizon', 'recommended', 'personalizedReason'],
        additionalProperties: false,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['analysis', 'advice', 'investmentOptions', 'warnings'],
  additionalProperties: false,
}
