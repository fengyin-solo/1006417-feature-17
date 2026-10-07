/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  /** 终态：进入这些状态后不允许再执行任何状态动作（如检修已完工不许改回检修中） */
  terminalStatuses?: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

/** 登记 / 更新 / 派工 / 领用这类写操作的返回：duplicated 表示命中幂等约束、没有重复落数据 */
export type WriteResult = {
  ok: boolean
  message: string
  row?: EntryRow
  duplicated?: boolean
}

/** 检修派工入参：接单班组以检修主管确认的为准，不填则用系统建议 */
export type DispatchInput = {
  confirmedTeam?: string
  spareCode?: string
  quantity?: number
}

/** 备件领用入参：领用单号是幂等键，同一张单重复提交只扣一次在库量 */
export type SpareIssueInput = {
  领用单号: string
  备件编号: string
  数量: number
  关联检修编号?: string
  领用班组?: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
