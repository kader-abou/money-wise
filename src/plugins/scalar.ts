import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import openApiPlugin from "@fastify/swagger";
import scalarPlugin from "@scalar/fastify-api-reference";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { env } from "../config/env.js";

const scalarDocsPlugin: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(openApiPlugin, {
    transform: jsonSchemaTransform,
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "MoneyWise API",
        description: `
            ## API de gestion financière personnelle

            ### Authentification
            Toutes les routes protégées requièrent un header :
            \`\`\`
            Authorization: Bearer <access_token>
            \`\`\`
            Obtenu via \`POST /auth/login\`.

            ### Codes couleur budget
            | Seuil | Couleur | Signification |
            |-------|---------|---------------|
            | 0–49% | 🟢 green | Bonne gestion |
            | 50–79% | 🟠 orange | Attention |
            | 80–99% | 🔴 red | Budget presque épuisé |
            | ≥100% | ⛔ black | Dépassement |

            ### Catégories
            Les catégories sont dynamiques. Appelle \`GET /categories\` pour récupérer les IDs à utiliser dans les dépenses et budgets.
                    `,
                    version: "1.1.0",
        contact: {
          name: "MoneyWise Support",
          email: "support@moneywise.app",
        },
      },
      // Les serveurs sont injectés dynamiquement via le hook ci-dessous
      servers: [
        { url: `http://localhost:${env.PORT}`, description: "Local" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Access token JWT obtenu via POST /auth/login",
          },
        },
      },
      tags: [
        { name: "Health",           description: "Santé du serveur" },
        { name: "Auth",             description: "Inscription, connexion, profil" },
        { name: "Categories",       description: "Catégories système et personnalisées" },
        { name: "Budgets",          description: "Budgets mensuels par catégorie" },
        { name: "Expenses",         description: "Dépenses courantes" },
        { name: "Special Expenses", description: "Dépenses spéciales planifiées (loyer, assurance…)" },
        { name: "Goals",            description: "Objectifs d'épargne" },
        { name: "Stats",            description: "Statistiques multi-périodes" },
        { name: "Notifications",    description: "Notifications push" },
        { name: "Investments",      description: "Conseils d'investissement (Afrique de l'Ouest)" },
      ],
    },
  });

  // Injecte dynamiquement l'URL du serveur selon l'hôte de la requête
  fastify.addHook("onRequest", (request, _reply, done) => {
    const host = request.headers.host
    if (host && request.url === "/docs/openapi.json") {
      const protocol = request.headers["x-forwarded-proto"] ?? "http"
      const dynamicUrl = `${protocol}://${host}`
      const spec = fastify.swagger() as any
      if (spec?.servers) {
        const exists = spec.servers.some((s: any) => s.url === dynamicUrl)
        if (!exists) {
          spec.servers.unshift({ url: dynamicUrl, description: "Actif" })
        }
      }
    }
    done()
  })

  await fastify.register(scalarPlugin, {
    routePrefix: "/docs",
    configuration: {
      theme: "purple",
      title: "MoneyWise API",
      defaultHttpClient: {
        targetKey: "node",
        clientKey: "fetch",
      },
    },
  });
});

export default scalarDocsPlugin;
