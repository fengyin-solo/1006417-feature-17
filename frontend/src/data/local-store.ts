import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'waste-to-energy-plant:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 历史脏数据清理：同一检修编号只留一条，状态以流转最靠后的为准，
// 修掉“班组重复提交、列表和详情状态对不上”的存量数据。
const OVERHAUL_STATUS_RANK: Record<string, number> = {
  待开工: 0,
  检修中: 1,
  已延期: 1,
  已完工: 2,
}

function normalizeOverhaul(rows: EntryRow[]): EntryRow[] {
  const indexByNo = new Map<string, number>()
  const result: EntryRow[] = []
  let changed = false
  for (const row of rows) {
    const no = String(row['检修编号'] ?? '').trim()
    if (!no) {
      result.push(row)
      continue
    }
    const kept = indexByNo.get(no)
    if (kept === undefined) {
      indexByNo.set(no, result.length)
      result.push(row)
      continue
    }
    changed = true
    const rank = (entry: EntryRow) => OVERHAUL_STATUS_RANK[String(entry.status)] ?? 0
    if (rank(row) > rank(result[kept])) {
      result[kept] = row
    }
  }
  return changed ? result : rows
}

// 旧数据没有「在库量」字段：在库可用的补一个默认库存，其余补 0，让派工领用能跑起来。
const SPARE_DEFAULT_STOCK = 10

function normalizeSpare(rows: EntryRow[]): EntryRow[] {
  if (rows.every((row) => row['在库量'] !== undefined)) {
    return rows
  }
  return rows.map((row) =>
    row['在库量'] === undefined
      ? { ...row, 在库量: String(row.status) === '在库可用' ? SPARE_DEFAULT_STOCK : 0 }
      : row,
  )
}

const NORMALIZERS: Record<string, (rows: EntryRow[]) => EntryRow[]> = {
  overhaul: normalizeOverhaul,
  spare: normalizeSpare,
}

function applyNormalizers(data: Record<string, EntryRow[]>): boolean {
  let changed = false
  for (const [key, normalize] of Object.entries(NORMALIZERS)) {
    const rows = data[key]
    if (!rows) {
      continue
    }
    const normalized = normalize(rows)
    if (normalized !== rows) {
      data[key] = normalized
      changed = true
    }
  }
  return changed
}

function persist(data: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    persist(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    if (applyNormalizers(merged)) {
      persist(merged)
    }
    return merged
  } catch {
    persist(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
