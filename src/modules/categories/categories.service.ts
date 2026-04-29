import { PrismaClient } from '@prisma/client'
import { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js'
import { fail } from '../../utils/response.js'

export class CategoriesService {
  constructor(private prisma: PrismaClient) {}

  /** Retourne les catégories système (visibles par tous) + les catégories personnalisées de l'utilisateur. */
  async findAll(userId: string) {
    const categories = await this.prisma.category.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    })
    return categories
  }

  /**
   * Crée une catégorie personnalisée pour l'utilisateur.
   * @throws 409 si une catégorie avec ce nom existe déjà pour cet utilisateur
   */
  async create(userId: string, input: CreateCategoryInput) {
    const existing = await this.prisma.category.findFirst({
      where: { userId, name: { equals: input.name, mode: 'insensitive' } },
    })
    if (existing) {
      throw { statusCode: 409, ...fail('CATEGORY_EXISTS', `Une catégorie "${input.name}" existe déjà`) }
    }

    return this.prisma.category.create({
      data: { userId, name: input.name, icon: input.icon, color: input.color, isSystem: false },
    })
  }

  /**
   * Met à jour une catégorie personnalisée.
   * @throws 404 si introuvable ou appartient à un autre utilisateur
   * @throws 403 si tentative de modifier une catégorie système
   */
  async update(userId: string, id: string, input: UpdateCategoryInput) {
    const category = await this.prisma.category.findFirst({ where: { id } })

    if (!category) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Catégorie introuvable') }
    }
    if (category.isSystem) {
      throw { statusCode: 403, ...fail('FORBIDDEN', 'Les catégories système ne peuvent pas être modifiées') }
    }
    if (category.userId !== userId) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Catégorie introuvable') }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    })
  }

  /**
   * Supprime une catégorie personnalisée.
   * @throws 403 si tentative de supprimer une catégorie système
   * @throws 409 si des dépenses sont encore liées à cette catégorie
   */
  async delete(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id } })

    if (!category) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Catégorie introuvable') }
    }
    if (category.isSystem) {
      throw { statusCode: 403, ...fail('FORBIDDEN', 'Les catégories système ne peuvent pas être supprimées') }
    }
    if (category.userId !== userId) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Catégorie introuvable') }
    }

    const linkedExpenses = await this.prisma.expense.count({ where: { categoryId: id } })
    if (linkedExpenses > 0) {
      throw {
        statusCode: 409,
        ...fail('CATEGORY_IN_USE', `Cette catégorie est utilisée par ${linkedExpenses} dépense(s). Réassigne-les avant de supprimer.`),
      }
    }

    await this.prisma.category.delete({ where: { id } })
  }
}
