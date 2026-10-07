import { issueNoOf } from '@/data/dispatch'
import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 备件领用清单挂在备件台账模块下，不单独注册成业务模块。
const SPARE_ISSUE_KEY = 'spare-issue'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if ((meta.finalStatuses ?? []).includes(current)) {
    return { ok: false, message: `${meta.entity}已是「${current}」，不允许再执行「${action}」` }
  }
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function getEntry(key: string, id: number): EntryRow | null {
  return listRows(key).find((row) => Number(row.id) === id) ?? null
}

/** 登记新记录；带 uniqueField 时同一字段值只落一条，重复提交直接挡下。 */
export function createEntry(
  key: string,
  values: Record<string, string>,
  uniqueField?: string,
): ActionResult & { id?: number } {
  const meta = moduleMeta(key)
  const rows = listRows(key)
  if (uniqueField) {
    const value = String(values[uniqueField] ?? '').trim()
    if (!value) {
      return { ok: false, message: `${uniqueField}不能为空` }
    }
    if (rows.some((row) => String(row[uniqueField] ?? '').trim() === value)) {
      return { ok: false, message: `${uniqueField}「${value}」已存在，同一${uniqueField}只保留一条记录` }
    }
  }
  const id = nextId(rows)
  const row: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    ...values,
  }
  saveRows(key, [...rows, row])
  return { ok: true, message: `${meta.entity}已登记，当前状态「${meta.statuses[0]}」`, id }
}

/** 修改记录的普通字段（不改状态），例如补填更换备件；写库后刷新不丢。 */
export function updateEntry(
  key: string,
  id: number,
  changes: Record<string, string | number>,
): ActionResult {
  const meta = moduleMeta(key)
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const next = [...rows]
  next[index] = { ...next[index], ...changes }
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已更新` }
}

/** 备件台账里当前可领用的备件（在库可用且在库量大于 0）。 */
export function listAvailableSpares(): EntryRow[] {
  return listRows('spare').filter(
    (row) => String(row.status) === '在库可用' && Number(row['在库量'] ?? 0) > 0,
  )
}

/** 备件台账的领用清单，派工回写的结果在这里看。 */
export function listSpareIssues(): EntryRow[] {
  return listRows(SPARE_ISSUE_KEY)
}

export type DispatchInput = {
  id: number
  /** 检修主管最终确认的接单班组（建议只作参考）。 */
  crew: string
  /** 检修主管，即确认人。 */
  confirmer: string
  /** 本次要领用的备件编号；不领备件时留空。 */
  spareCode?: string
  quantity?: number
}

/**
 * 检修派工：确认接单班组，并把备件领用回写到备件台账。
 * 领用单号由「检修编号 + 备件编号」唯一确定，同一张领用单重复提交只扣一次在库量；
 * 全部校验通过才落库，任何一步失败都不写，避免两边对不上。
 */
export function dispatchOverhaul(input: DispatchInput): ActionResult {
  const rows = listRows('overhaul')
  const index = rows.findIndex((row) => Number(row.id) === input.id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${input.id} 的检修记录` }
  }
  const row = rows[index]
  if (String(row.status) === '已完工') {
    return { ok: false, message: '检修记录已完工，不允许再派工' }
  }
  const crew = input.crew.trim()
  if (!crew) {
    return { ok: false, message: '请先确认接单班组再派工' }
  }
  const confirmer = input.confirmer.trim()
  if (!confirmer) {
    return { ok: false, message: '请填写检修主管作为确认人' }
  }
  const overhaulNo = String(row['检修编号'] ?? '').trim()
  const spareCode = (input.spareCode ?? '').trim()
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1))

  const updated: EntryRow = {
    ...row,
    接单班组: crew,
    确认人: confirmer,
    派工时间: nowText(),
  }
  let spareRows: EntryRow[] | null = null
  let issueRows: EntryRow[] | null = null
  let issueMessage = ''

  if (spareCode) {
    const spares = listRows('spare')
    const spareIndex = spares.findIndex((spare) => String(spare['备件编号']) === spareCode)
    if (spareIndex < 0) {
      return { ok: false, message: `备件台账里没有编号为 ${spareCode} 的备件` }
    }
    const spare = spares[spareIndex]
    if (String(spare.status) !== '在库可用') {
      return { ok: false, message: `备件 ${spareCode} 当前状态「${spare.status}」，不能领用` }
    }
    const issueNo = issueNoOf(overhaulNo, spareCode)
    const issues = listRows(SPARE_ISSUE_KEY)
    if (issues.some((issue) => String(issue['领用单号']) === issueNo)) {
      // 同一张领用单重复提交：清单不重复登记，在库量也不再扣。
      issueMessage = `；领用单 ${issueNo} 已办理过，在库量不重复扣减`
    } else {
      const stock = Number(spare['在库量'] ?? 0)
      if (stock < quantity) {
        return { ok: false, message: `备件 ${spareCode} 在库量 ${stock}，不足本次领用 ${quantity}` }
      }
      spareRows = [...spares]
      spareRows[spareIndex] = { ...spare, 在库量: stock - quantity }
      issueRows = [
        ...issues,
        {
          id: nextId(issues),
          status: '已领用',
          pending: false,
          abnormal: false,
          领用单号: issueNo,
          检修编号: overhaulNo,
          备件编号: spareCode,
          备件名称: spare['备件名称'],
          领用数量: quantity,
          接单班组: crew,
          经办人: confirmer,
          办理时间: nowText(),
        },
      ]
      if (!String(updated['更换备件'] ?? '').trim()) {
        updated['更换备件'] = `${spare['备件名称']}(${spareCode})×${quantity}`
      }
      issueMessage = `；领用单 ${issueNo} 已登记，${spareCode} 在库量 ${stock} → ${stock - quantity}`
    }
  }

  const next = [...rows]
  next[index] = updated
  saveRows('overhaul', next)
  if (spareRows) {
    saveRows('spare', spareRows)
  }
  if (issueRows) {
    saveRows(SPARE_ISSUE_KEY, issueRows)
  }
  return { ok: true, message: `检修记录已派工给「${crew}」（${confirmer}确认）${issueMessage}` }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
