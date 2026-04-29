export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export function ok<T>(data: T, message?: string, meta?: ApiResponse['meta']): ApiResponse<T> {
  return { success: true, data, message, meta }
}

export function fail(code: string, message: string, details?: unknown): ApiResponse {
  return { success: false, error: { code, message, details } }
}

// ─── Budget color thresholds ──────────────────────────────────────────────────

export type BudgetStatus = 'green' | 'yellow' | 'orange' | 'red' | 'black'

export function getBudgetStatus(spent: number, total: number): BudgetStatus {
  if (total === 0) return 'green'
  const ratio = spent / total
  if (ratio >= 1) return 'black'
  if (ratio >= 0.8) return 'red'
  if (ratio >= 0.5) return 'orange'
  if (ratio >= 0.5) return 'yellow'
  return 'green'
}

export function getBudgetPercentage(spent: number, total: number): number {
  if (total === 0) return 0
  return Math.round((spent / total) * 100)
}
