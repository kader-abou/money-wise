# Architecture — MoneyWise API

> Visualiser sur [mermaid.live](https://mermaid.live) ou avec l'extension **Mermaid Preview** dans VS Code.

## Vue d'ensemble des couches

```mermaid
flowchart TD
    CLIENT(["📱 App Mobile\nFlutter / React Native"])

    subgraph API ["🚀 Fastify API  (port 2026)"]
        direction TB
        MW["🔒 Middleware\nauthenticate()\nSupabase JWT verify"]
        RL["⏱ Rate Limit\n100 req/min"]
        ROUTES["📡 Routes\n/auth  /budgets  /expenses\n/goals  /stats  /categories\n/notifications  /investments\n/special-expenses"]
        SERVICES["⚙️ Services\nLogique métier"]
        JOBS["⏰ Cron Jobs\nRappels 7h00\nReminders 12h/20h40/8h30"]
    end

    subgraph DATA ["💾 Données"]
        PRISMA["🗄 Prisma ORM\nPrismaPg adapter"]
        DB[("PostgreSQL\nSupabase")]
    end

    subgraph AI ["🤖 IA Investments"]
        ANTHROPIC["Claude Opus 4.7"]
        GOOGLE["Gemini Flash"]
        GROQ["LLaMA 3.3 70B"]
        XAI["Grok 4"]
        OPENAI["GPT-4o"]
    end

    subgraph AUTH ["🔑 Auth"]
        SUPABASE["Supabase Auth\nJWT tokens"]
    end

    CLIENT -->|"Bearer token"| RL
    RL --> MW
    MW -->|"✅ token valide"| ROUTES
    MW -->|"❌ 401"| CLIENT
    ROUTES --> SERVICES
    SERVICES --> PRISMA
    PRISMA --> DB
    JOBS --> SERVICES
    SERVICES -->|"provider=?"| AI
    CLIENT -->|"login / register"| SUPABASE
    SUPABASE -->|"JWT"| CLIENT
```

---

## Flux de création d'une dépense

```mermaid
sequenceDiagram
    participant App as 📱 App Mobile
    participant API as 🚀 API
    participant DB  as 🗄 PostgreSQL

    App->>API: POST /expenses { amount, categoryId, date }
    API->>API: authenticate() — vérifie JWT Supabase

    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT expense
    API->>DB: SELECT budget (même mois/année)

    alt Budget trouvé avec cette catégorie
        API->>DB: UPDATE budget_category SET spent += amount
        API->>API: Vérifie seuils 50% / 80% / 100%
    end

    API->>DB: COMMIT
    API-->>App: { expense, budgetAlert: "⚠️ 80% atteint" | null }
```

---

## Flux conseil IA (investments)

```mermaid
sequenceDiagram
    participant App  as 📱 App Mobile
    participant API  as 🚀 API
    participant Cache as 🗄 Cache DB
    participant IA   as 🤖 Provider IA

    App->>API: GET /investments/advice?amount=50000&provider=groq

    API->>Cache: Cache trouvé aujourd'hui ?

    alt Cache valide (même journée)
        Cache-->>API: résultat en cache
        API-->>App: { ...result, fromCache: true }
    else Pas de cache
        API->>API: getExpensesSummary()\ngetGoalsSummary()\ngetBudgetStatus()
        API->>IA: Prompt + contexte financier réel
        IA-->>API: JSON { analysis, advice, investmentOptions, warnings }
        API->>Cache: Upsert résultat (expire à minuit)
        API-->>App: { ...result, fromCache: false }
    end
```

---

## Structure des modules

```
src/
├── app.ts                    ← Bootstrap Fastify, middlewares, routes
├── server.ts                 ← Listen, graceful shutdown, banner
├── config/env.ts             ← Variables d'environnement (Zod)
├── middlewares/
│   └── authenticate.ts       ← Vérification JWT Supabase
├── plugins/
│   ├── prisma.ts             ← Prisma client (PrismaPg adapter)
│   ├── supabase.ts           ← Supabase admin client
│   └── scalar.ts             ← Documentation API interactive
├── utils/
│   ├── response.ts           ← ok(), fail(), getBudgetStatus()
│   └── schema.ts             ← wrapResponse(), r401, r404...
├── modules/
│   ├── auth/
│   ├── budgets/
│   ├── categories/
│   ├── expenses/
│   ├── goals/
│   ├── investments/
│   ├── notifications/
│   ├── special-expenses/
│   └── stats/
└── jobs/
    ├── scheduler.ts
    ├── special-expense-reminders.job.ts
    └── daily-reminders.job.ts
```
