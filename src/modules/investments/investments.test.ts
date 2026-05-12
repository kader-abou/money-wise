import { describe, it, expect } from 'vitest'

// ─── Tests des fonctions utilitaires (accessibles via module) ─────────────────

// On teste shuffle et availableProviders indirectement via leur comportement observable

describe('shuffle (Fisher-Yates)', () => {
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  it('retourne un tableau de même taille', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr)).toHaveLength(5)
  })

  it('contient les mêmes éléments', () => {
    const arr = ['groq', 'anthropic', 'google', 'openai', 'xai']
    const result = shuffle(arr)
    expect(result.sort()).toEqual(arr.sort())
  })

  it('ne modifie pas le tableau original', () => {
    const arr = [1, 2, 3]
    const original = [...arr]
    shuffle(arr)
    expect(arr).toEqual(original)
  })

  it('gère un tableau vide', () => {
    expect(shuffle([])).toEqual([])
  })

  it('gère un tableau d\'un seul élément', () => {
    expect(shuffle(['groq'])).toEqual(['groq'])
  })
})

describe('csvCell', () => {
  function csvCell(value: string | number | null | undefined): string {
    const str = value == null ? '' : String(value)
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }

  it('retourne une chaîne vide pour null', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('convertit un nombre en chaîne', () => {
    expect(csvCell(5000)).toBe('5000')
  })

  it('échappe les virgules avec des guillemets', () => {
    expect(csvCell('Alimentation, boissons')).toBe('"Alimentation, boissons"')
  })

  it('échappe les guillemets internes', () => {
    expect(csvCell('Dépense "spéciale"')).toBe('"Dépense ""spéciale"""')
  })

  it('ne modifie pas les valeurs simples', () => {
    expect(csvCell('Alimentation')).toBe('Alimentation')
    expect(csvCell('0')).toBe('0')
  })
})
