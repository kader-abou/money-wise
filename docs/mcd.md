# MCD — MoneyWise API

> Visualiser sur [mermaid.live](https://mermaid.live) ou avec l'extension **Mermaid Preview** dans VS Code.

```mermaid
erDiagram
    USER {
        uuid    id              PK
        string  email           UK
        string  phone           UK
        string  firstName
        string  lastName
        enum    currency        "XOF | EUR | USD | GNF | XAF"
        string  timezone
        string  fcmToken        "Token push Firebase"
        enum    plan            "FREE | PREMIUM | FAMILY"
        datetime planExpiresAt
        boolean reminderEnabled
        string  reminder1Time   "HH:mm"
        string  reminder2Time   "HH:mm"
        string  reminder3Time   "HH:mm"
    }

    CATEGORY {
        string  id        PK
        uuid    userId    FK  "null = catégorie système"
        string  name
        string  icon      "Emoji"
        string  color     "#RRGGBB"
        boolean isSystem  "true = prédéfinie"
    }

    BUDGET {
        string  id          PK
        uuid    userId      FK
        int     month       "1-12"
        int     year
        decimal totalAmount
        enum    currency
        string  note
    }

    BUDGET_CATEGORY {
        string  id         PK
        string  budgetId   FK
        string  categoryId FK
        decimal amount     "Montant alloué"
        decimal spent      "Montant dépensé (mis à jour auto)"
    }

    EXPENSE {
        string  id          PK
        uuid    userId      FK
        string  budgetId    FK  "Optionnel"
        string  categoryId  FK
        decimal amount
        string  description
        datetime date
        boolean isRecurring
    }

    SPECIAL_EXPENSE {
        string   id               PK
        uuid     userId           FK
        string   name
        decimal  estimatedAmount
        decimal  actualAmount     "Renseigné à la complétion"
        datetime scheduledDate
        int[]    remindDaysBefore "ex: [7, 3, 1]"
        boolean  isCompleted
        datetime completedAt
        string   note
    }

    SAVING_GOAL {
        string  id            PK
        uuid    userId        FK
        string  name
        decimal targetAmount  "Montant cible"
        decimal currentAmount "Épargne accumulée (calculé)"
        decimal monthlyTarget "Versement mensuel conseillé"
        datetime deadline
        enum    status        "ACTIVE | COMPLETED | CANCELLED"
        string  icon
        string  color
    }

    GOAL_CONTRIBUTION {
        string  id      PK
        string  goalId  FK
        decimal amount  "Montant versé"
        string  note
        datetime date
    }

    INVESTMENT_ADVICE_CACHE {
        string   id       PK
        uuid     userId   FK
        string   provider "anthropic | google | groq | xai | openai"
        json     result   "Réponse IA complète"
        datetime cachedAt "Expire à minuit"
    }

    NOTIFICATION {
        string   id     PK
        uuid     userId FK
        string   title
        string   body
        string   type   "reminder | alert | advice | goal"
        boolean  isRead
        datetime sentAt
        json     data   "Données contextuelles optionnelles"
    }

    USER ||--o{ CATEGORY         : "crée"
    USER ||--o{ BUDGET           : "possède"
    USER ||--o{ EXPENSE          : "enregistre"
    USER ||--o{ SPECIAL_EXPENSE  : "planifie"
    USER ||--o{ SAVING_GOAL      : "définit"
    USER ||--o{ NOTIFICATION     : "reçoit"
    USER ||--o{ INVESTMENT_ADVICE_CACHE : "cache IA"

    BUDGET   ||--|{ BUDGET_CATEGORY : "alloue"
    CATEGORY ||--o{ BUDGET_CATEGORY : "utilisée dans"

    BUDGET   ||--o{ EXPENSE : "rattachée à"
    CATEGORY ||--|{ EXPENSE : "catégorise"

    SAVING_GOAL ||--o{ GOAL_CONTRIBUTION : "reçoit versements"
```
