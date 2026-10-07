import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import { suggestTeam } from '@/data/team-rules'
import type {
  ActionResult,
  DispatchInput,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  SpareIssueInput,
  WriteResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 每个模块的最后一个字段都是它的状态字段（检修状态、备件状态……），展示时以 status 为准。
function statusFieldOf(meta: ModuleMeta): string {
  return meta.fields[meta.fields.length - 1]
}

// 列表、详情都从这里出数：状态字段一律对齐 status，列表和详情不会再各说各话。
function normalizeRow(meta: ModuleMeta | undefined, row: EntryRow): EntryRow {
  if (!meta) {
    return row
  }
  const statusField = statusFieldOf(meta)
  if (row[statusField] === row.status) {
    return row
  }
  return { ...row, [statusField]: row.status }
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
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
  const meta = MODULE_BY_KEY.get(key)
  const matched = filterRows(listRows(key), filters).map((row) => normalizeRow(meta, row))
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 登记：业务编号（第一个字段，如检修编号）是幂等键，重复提交只落一条。
export function createEntry(key: string, payload: Record<string, string | number>): WriteResult {
  const meta = moduleMeta(key)
  const bizField = meta.fields[0]
  const bizValue = String(payload[bizField] ?? '').trim()
  if (bizValue === '') {
    return { ok: false, message: `${bizField}不能为空` }
  }
  const rows = listRows(key)
  const existing = rows.find((row) => String(row[bizField]) === bizValue)
  if (existing) {
    return {
      ok: true,
      duplicated: true,
      row: normalizeRow(meta, existing),
      message: `${meta.entity}「${bizValue}」已经登记过，重复提交只保留一条`,
    }
  }
  const status = meta.statuses[0]
  const row: EntryRow = { id: nextId(rows), status, pending: true, abnormal: false }
  for (const field of meta.fields) {
    const value = payload[field]
    row[field] = typeof value === 'string' ? value.trim() : (value ?? '')
  }
  row[bizField] = bizValue
  row[statusFieldOf(meta)] = status
  saveRows(key, [...rows, row])
  return { ok: true, row, message: `${meta.entity}「${bizValue}」已登记` }
}

// 更新：只放行元数据里登记过的业务字段；状态字段跟着 status 走，不许直接改。
export function updateEntry(
  key: string,
  id: number,
  patch: Record<string, string | number>,
): WriteResult {
  const meta = moduleMeta(key)
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const statusField = statusFieldOf(meta)
  const cleaned: Record<string, string | number> = {}
  for (const [field, value] of Object.entries(patch)) {
    if (!meta.fields.includes(field) || field === statusField) {
      continue
    }
    cleaned[field] = typeof value === 'string' ? value.trim() : value
  }
  const updated: EntryRow = { ...rows[index], ...cleaned, [statusField]: rows[index].status }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, row: updated, message: `${meta.entity}已更新，刷新后内容仍在` }
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
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  if (meta.terminalStatuses?.includes(current)) {
    return { ok: false, message: `${meta.entity}已经是「${current}」，不允许再执行「${action}」` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    [statusFieldOf(meta)]: target,
    pending: meta.terminalStatuses?.includes(target) ? false : target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 备件领用：领用单号是幂等键，同一张单重复提交只扣一次在库量；办理成功台账在库量跟着减。
export function issueSpare(input: SpareIssueInput): WriteResult {
  const orderNo = input.领用单号.trim()
  if (orderNo === '') {
    return { ok: false, message: '领用单号不能为空' }
  }
  const quantity = Math.floor(Number(input.数量))
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: '领用数量要是大于 0 的整数' }
  }
  const issues = listRows('spare-issue')
  const existing = issues.find((row) => String(row['领用单号']) === orderNo)
  if (existing) {
    return {
      ok: true,
      duplicated: true,
      row: existing,
      message: `领用单「${orderNo}」已提交过，在库量只扣一次`,
    }
  }
  const spares = listRows('spare')
  const index = spares.findIndex((row) => String(row['备件编号']) === input.备件编号.trim())
  if (index < 0) {
    return { ok: false, message: `备件台账里没有「${input.备件编号}」` }
  }
  const spare = spares[index]
  if (String(spare.status) === '已报废') {
    return { ok: false, message: `备件「${input.备件编号}」已报废，不能领用` }
  }
  const stock = Number(spare['在库量']) || 0
  if (stock < quantity) {
    return { ok: false, message: `备件「${input.备件编号}」在库量 ${stock}，不够领用 ${quantity}` }
  }
  const remain = stock - quantity
  const spareStatus = remain > 0 ? '在库可用' : '已领用'
  const nextSpares = [...spares]
  nextSpares[index] = {
    ...spare,
    在库量: remain,
    status: spareStatus,
    pending: remain > 0,
    备件状态: spareStatus,
  }
  const issue: EntryRow = {
    id: nextId(issues),
    status: '已领用',
    pending: false,
    abnormal: false,
    领用单号: orderNo,
    备件编号: input.备件编号.trim(),
    备件名称: spare['备件名称'] ?? '',
    领用数量: quantity,
    关联检修编号: input.关联检修编号 ?? '',
    领用班组: input.领用班组 ?? '',
    领用时间: today(),
  }
  saveRows('spare', nextSpares)
  saveRows('spare-issue', [...issues, issue])
  return {
    ok: true,
    row: issue,
    message: `领用单「${orderNo}」已办理，备件在库量由 ${stock} 减为 ${remain}`,
  }
}

// 备件入库：在库量加上入库数量，状态回到在库可用。
export function restockSpare(id: number, quantity: number): WriteResult {
  const count = Math.floor(Number(quantity))
  if (!Number.isFinite(count) || count <= 0) {
    return { ok: false, message: '入库数量要是大于 0 的整数' }
  }
  const rows = listRows('spare')
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的备品备件` }
  }
  if (String(rows[index].status) === '已报废') {
    return { ok: false, message: '已报废的备件不能再入库' }
  }
  const stock = (Number(rows[index]['在库量']) || 0) + count
  const updated: EntryRow = {
    ...rows[index],
    在库量: stock,
    status: '在库可用',
    pending: true,
    备件状态: '在库可用',
  }
  const next = [...rows]
  next[index] = updated
  saveRows('spare', next)
  return { ok: true, row: updated, message: `备件已入库 ${count} 件，当前在库量 ${stock}` }
}

// 检修派工：按检修类别与检修班组带出建议接单班组，最终以检修主管确认的为准；
// 带上更换备件时同步把领用单回写到备件台账，同一张领用单重复提交只扣一次。
export function dispatchOverhaul(id: number, input: DispatchInput = {}): WriteResult {
  const meta = moduleMeta('overhaul')
  const rows = listRows('overhaul')
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的检修记录` }
  }
  const row = rows[index]
  if (meta.terminalStatuses?.includes(String(row.status))) {
    return { ok: false, message: `检修记录已经「${row.status}」，不允许再派工改动` }
  }
  const suggested = suggestTeam(String(row['检修类别'] ?? ''), String(row['检修班组'] ?? ''))
  const team = (input.confirmedTeam ?? '').trim() || suggested
  const spareCode = (input.spareCode ?? '').trim()
  const orderNo = `LY-${String(row['检修编号'] ?? id)}`
  let issueNote = ''
  if (spareCode !== '') {
    const issued = issueSpare({
      领用单号: orderNo,
      备件编号: spareCode,
      数量: input.quantity ?? 1,
      关联检修编号: String(row['检修编号'] ?? ''),
      领用班组: team,
    })
    if (!issued.ok) {
      return { ok: false, message: `派工未生效：${issued.message}` }
    }
    issueNote = issued.duplicated ? `；${issued.message}` : `；领用单「${orderNo}」已回写备件台账`
  }
  const updated: EntryRow = {
    ...row,
    建议班组: suggested,
    接单班组: team,
    派工状态: '已派工',
    领用单号: spareCode !== '' ? orderNo : (row['领用单号'] ?? ''),
  }
  const next = [...rows]
  next[index] = updated
  saveRows('overhaul', next)
  return { ok: true, row: updated, message: `检修记录已派工，接单班组「${team}」${issueNote}` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push(
      [row.id, ...meta.fields.map((field) => normalizeRow(meta, row)[field] ?? ''), row.status].join(','),
    )
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
