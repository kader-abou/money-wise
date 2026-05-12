import { FastifyPluginAsync } from "fastify";
import { InvestmentsService, type LLMProvider } from "./investments.service.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requirePremium } from "../../middlewares/requirePremium.js";
import { ok } from "../../utils/response.js";
import { z } from "zod/v4";
import { wrapResponse, r401, r403, r422 } from "../../utils/schema.js";

const AdviceQuerySchema = z.object({
  amount: z.coerce
    .number()
    .positive("Le montant doit être positif")
    .describe("Montant disponible à investir"),
  currency: z.string().default("XOF").describe("Devise (défaut: XOF)"),
  provider: z
    .enum(["auto", "anthropic", "google", "groq", "xai", "openai"])
    .default("auto")
    .describe(
      "auto = teste les providers disponibles aléatoirement | groq | google | anthropic | openai | xai",
    ),
});

const AdviceItemData = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]),
});

const InvestmentOptionData = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string(),
  expectedReturn: z.string(),
  minAmount: z.number(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  timeHorizon: z.string(),
  recommended: z
    .boolean()
    .describe("true si accessible avec le montant disponible"),
  personalizedReason: z
    .string()
    .describe("Pourquoi cette option pour cet utilisateur spécifiquement"),
});

const InvestmentAdviceResponse = wrapResponse(
  z.object({
    amount: z.number(),
    currency: z.string(),
    provider: z.string().describe("Modèle IA utilisé"),
    analysis: z
      .string()
      .describe("Analyse personnalisée de la situation financière"),
    advice: z
      .array(AdviceItemData)
      .describe("Conseils ciblés basés sur les données réelles"),
    investmentOptions: z.array(InvestmentOptionData),
    warnings: z
      .array(z.string())
      .describe("Alertes sur des patterns préoccupants"),
  }),
);

const investmentsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new InvestmentsService(fastify.prisma);
  fastify.addHook("preHandler", authenticate);
  // fastify.addHook('preHandler', requirePremium)

  fastify.get("/advice", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => `investments:${request.user?.sub ?? request.ip}`,
      },
    },
    schema: {
      tags: ["Investments"],
      summary: "Conseils d'investissement personnalisés par IA 🔒 Premium",
      description: `Analyse les dépenses (3 derniers mois), objectifs d'épargne et budget de l'utilisateur pour générer des conseils sur mesure. **Réservé aux abonnés Premium.**

        **Providers disponibles :**
        - \`anthropic\` — Claude Opus 4.7 (le plus précis, nécessite ANTHROPIC_API_KEY)
        - \`google\` — Gemini 2.0 Flash (rapide, nécessite GOOGLE_AI_API_KEY)
        - \`groq\` — LLaMA 3.3 70B via Groq (gratuit avec GROQ_API_KEY)

        Obtenir des clés gratuites : [Groq](https://console.groq.com) · [Google AI](https://aistudio.google.com)`,
      security: [{ bearerAuth: [] }],
      querystring: AdviceQuerySchema,
      response: {
        200: InvestmentAdviceResponse,
        400: r422,
        401: r401,
        403: r403,
      },
    },
    handler: async (request, reply) => {
      const { amount, currency, provider } = request.query as z.infer<
        typeof AdviceQuerySchema
      >;
      const result =
        provider === "auto"
          ? await service.getAutoAdvice(request.user.sub, amount, currency)
          : await service.getPersonalizedAdvice(
              request.user.sub,
              amount,
              currency,
              provider as LLMProvider,
            );
      return reply.send(ok(result));
    },
  });
};

export default investmentsRoutes;
