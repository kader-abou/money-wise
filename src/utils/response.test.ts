import { describe, it, expect } from 'vitest'
import { getBudgetStatus, getBudgetPercentage, ok, fail } from './response.js'

describe('getBudgetStatus', () => {
  it('retourne green quand total est 0', () => {
    expect(getBudgetStatus(0, 0)).toBe('green')
  })

  it('retourne green en dessous de 20%', () => {
    expect(getBudgetStatus(0, 100)).toBe('green')
    expect(getBudgetStatus(19, 100)).toBe('green')
  })

  it('retourne yellow entre 20% et 49%', () => {
    expect(getBudgetStatus(20, 100)).toBe('yellow')
    expect(getBudgetStatus(49, 100)).toBe('yellow')
  })

  it('retourne orange entre 50% et 79%', () => {
    expect(getBudgetStatus(50, 100)).toBe('orange')
    expect(getBudgetStatus(79, 100)).toBe('orange')
  })

  it('retourne red entre 80% et 99%', () => {
    expect(getBudgetStatus(80, 100)).toBe('red')
    expect(getBudgetStatus(99, 100)).toBe('red')
  })

  it('retourne black à 100% et au-delà', () => {
    expect(getBudgetStatus(100, 100)).toBe('black')
    expect(getBudgetStatus(150, 100)).toBe('black')
  })
})

describe('getBudgetPercentage', () => {
  it('retourne 0 quand total est 0', () => {
    expect(getBudgetPercentage(0, 0)).toBe(0)
  })

  it('calcule le pourcentage correct', () => {
    expect(getBudgetPercentage(50, 100)).toBe(50)
    expect(getBudgetPercentage(100, 100)).toBe(100)
    expect(getBudgetPercentage(0, 100)).toBe(0)
  })

  it('arrondit à l\'entier le plus proche', () => {
    expect(getBudgetPercentage(1, 3)).toBe(33)
    expect(getBudgetPercentage(2, 3)).toBe(67)
  })

  it('peut dépasser 100 en cas de dépassement', () => {
    expect(getBudgetPercentage(150, 100)).toBe(150)
  })
})

describe('ok', () => {
  it('encapsule les données dans une réponse success', () => {
    const res = ok({ id: '1', name: 'test' })
    expect(res.success).toBe(true)
    expect(res.data).toEqual({ id: '1', name: 'test' })
    expect(res.message).toBeUndefined()
  })

  it('inclut le message optionnel', () => {
    const res = ok(null, 'Créé avec succès')
    expect(res.message).toBe('Créé avec succès')
  })
})

describe('fail', () => {
  it('construit une réponse d\'erreur', () => {
    const res = fail('NOT_FOUND', 'Ressource introuvable')
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe('NOT_FOUND')
    expect(res.error?.message).toBe('Ressource introuvable')
  })

  it('inclut les détails optionnels', () => {
    const details = { field: 'email' }
    const res = fail('VALIDATION_ERROR', 'Données invalides', details)
    expect(res.error?.details).toEqual(details)
  })
})
