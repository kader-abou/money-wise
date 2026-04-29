import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USER_ID = 'c82a4496-7a87-48d5-a072-99aee23e0c33'

async function main() {
  console.log('🌱 Seeding test data for user', USER_ID)

  // ─── Catégorie personnalisée ───────────────────────────────────────────────
  const catVoyage = await prisma.category.upsert({
    where: { id: 'test_voyage_maldives' },
    update: {},
    create: {
      id: 'test_voyage_maldives',
      userId: USER_ID,
      name: 'Voyage Maldives',
      icon: '🏝️',
      color: '#00BCD4',
      isSystem: false,
    },
  })

  console.log('✅ Custom category created:', catVoyage.name)

  // ─── Budget du mois en cours ───────────────────────────────────────────────
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const budget = await prisma.budget.upsert({
    where: { userId_month_year: { userId: USER_ID, month, year } },
    update: {},
    create: {
      userId: USER_ID,
      month,
      year,
      totalAmount: 350000,
      note: 'Budget test avril 2026',
      categories: {
        create: [
          { categoryId: 'sys_alimentation', amount: 80000 },
          { categoryId: 'sys_transport', amount: 40000 },
          { categoryId: 'sys_loyer', amount: 120000 },
          { categoryId: 'sys_loisirs', amount: 30000 },
          { categoryId: 'sys_sante', amount: 30000 },
          { categoryId: 'sys_restaurant', amount: 50000 },
        ],
      },
    },
  })

  console.log(`✅ Budget ${month}/${year} created: ${budget.id}`)

  // ─── Dépenses du mois ─────────────────────────────────────────────────────
  const expenses = [
    { categoryId: 'sys_alimentation', amount: 12500, description: 'Marché du samedi', date: new Date(`${year}-${String(month).padStart(2, '0')}-05`) },
    { categoryId: 'sys_alimentation', amount: 8000, description: 'Supermarché', date: new Date(`${year}-${String(month).padStart(2, '0')}-10`) },
    { categoryId: 'sys_transport', amount: 5000, description: 'Taxi semaine', date: new Date(`${year}-${String(month).padStart(2, '0')}-07`) },
    { categoryId: 'sys_transport', amount: 15000, description: 'Carburant', date: new Date(`${year}-${String(month).padStart(2, '0')}-12`), isRecurring: true },
    { categoryId: 'sys_restaurant', amount: 18000, description: 'Déjeuner avec collègues', date: new Date(`${year}-${String(month).padStart(2, '0')}-09`) },
    { categoryId: 'sys_loisirs', amount: 12000, description: 'Cinéma + sortie', date: new Date(`${year}-${String(month).padStart(2, '0')}-13`) },
    { categoryId: 'sys_sante', amount: 7500, description: 'Pharmacie', date: new Date(`${year}-${String(month).padStart(2, '0')}-08`) },
    { categoryId: 'test_voyage_maldives', amount: 25000, description: 'Mise de côté vol', date: new Date(`${year}-${String(month).padStart(2, '0')}-11`) },
  ]

  for (const exp of expenses) {
    await prisma.expense.create({
      data: {
        userId: USER_ID,
        budgetId: budget.id,
        isRecurring: false,
        ...exp,
      },
    })
  }

  // Mettre à jour le spent des catégories budget
  const spentMap: Record<string, number> = {}
  for (const exp of expenses) {
    spentMap[exp.categoryId] = (spentMap[exp.categoryId] ?? 0) + exp.amount
  }

  const budgetCats = await prisma.budgetCategory.findMany({ where: { budgetId: budget.id } })
  for (const bc of budgetCats) {
    if (spentMap[bc.categoryId]) {
      await prisma.budgetCategory.update({
        where: { id: bc.id },
        data: { spent: spentMap[bc.categoryId] },
      })
    }
  }

  console.log(`✅ ${expenses.length} expenses created`)

  // ─── Objectifs d'épargne ──────────────────────────────────────────────────
  const goal1 = await prisma.savingGoal.create({
    data: {
      userId: USER_ID,
      name: 'Téléphone Samsung S25',
      targetAmount: 450000,
      currentAmount: 90000,
      monthlyTarget: 75000,
      deadline: new Date('2026-09-30'),
      icon: '📱',
      color: '#3F51B5',
      contributions: {
        create: [
          { amount: 50000, date: new Date('2026-02-01'), note: 'Premier versement' },
          { amount: 40000, date: new Date('2026-03-01'), note: 'Versement mars' },
        ],
      },
    },
  })

  const goal2 = await prisma.savingGoal.create({
    data: {
      userId: USER_ID,
      name: 'Voyage Maldives 2027',
      targetAmount: 2500000,
      currentAmount: 125000,
      monthlyTarget: 150000,
      deadline: new Date('2027-01-15'),
      icon: '✈️',
      color: '#00ACC1',
      contributions: {
        create: [
          { amount: 75000, date: new Date('2026-03-15'), note: 'Début épargne voyage' },
          { amount: 50000, date: new Date('2026-04-10'), note: 'Versement avril' },
        ],
      },
    },
  })

  console.log(`✅ Goals created: ${goal1.name}, ${goal2.name}`)

  // ─── Dépenses spéciales planifiées ────────────────────────────────────────
  await prisma.specialExpense.createMany({
    data: [
      {
        userId: USER_ID,
        name: 'Loyer mai 2026',
        estimatedAmount: 120000,
        scheduledDate: new Date('2026-05-01'),
        remindDaysBefore: [7, 3, 1],
        note: 'Virement propriétaire',
      },
      {
        userId: USER_ID,
        name: 'Assurance véhicule',
        estimatedAmount: 85000,
        scheduledDate: new Date('2026-06-15'),
        remindDaysBefore: [14, 7, 3],
        note: 'Renouvellement annuel',
      },
      {
        userId: USER_ID,
        name: 'Rentrée scolaire',
        estimatedAmount: 200000,
        scheduledDate: new Date('2026-09-01'),
        remindDaysBefore: [30, 14, 7],
        note: 'Frais de scolarité + fournitures',
      },
    ],
  })

  console.log('✅ Special expenses created')
  console.log('\n🎉 Test seed complete!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
