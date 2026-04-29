import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const systemCategories = [
  { id: 'sys_alimentation', name: 'Alimentation', icon: '🛒', color: '#4CAF50' },
  { id: 'sys_transport', name: 'Transport', icon: '🚗', color: '#2196F3' },
  { id: 'sys_loyer', name: 'Loyer', icon: '🏠', color: '#9C27B0' },
  { id: 'sys_sante', name: 'Santé', icon: '💊', color: '#F44336' },
  { id: 'sys_education', name: 'Éducation', icon: '📚', color: '#FF9800' },
  { id: 'sys_loisirs', name: 'Loisirs', icon: '🎮', color: '#00BCD4' },
  { id: 'sys_restaurant', name: 'Restaurant', icon: '🍽️', color: '#FF5722' },
  { id: 'sys_services', name: 'Services', icon: '💡', color: '#607D8B' },
  { id: 'sys_epargne', name: 'Épargne', icon: '💰', color: '#FFC107' },
  { id: 'sys_investissement', name: 'Investissement', icon: '📈', color: '#3F51B5' },
  { id: 'sys_voyage', name: 'Voyage', icon: '✈️', color: '#00ACC1' },
  { id: 'sys_famille', name: 'Famille', icon: '👨‍👩‍👧', color: '#E91E63' },
  { id: 'sys_habillement', name: 'Habillement', icon: '👗', color: '#795548' },
  { id: 'sys_autre', name: 'Autre', icon: '📦', color: '#9E9E9E' },
]

async function main() {
  console.log('Seeding system categories...')

  for (const cat of systemCategories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name, icon: cat.icon, color: cat.color },
      create: { ...cat, isSystem: true, userId: null },
    })
  }

  console.log(`✅ ${systemCategories.length} system categories seeded`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
