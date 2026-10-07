import type { EntryRow } from './types'

// 派工基础数据与建议规则：只负责“算什么”，不写数据，写库统一走 local-service。

export const OVERHAUL_CATEGORIES = ['机械检修', '电气检修', '热控检修'] as const

export const OVERHAUL_TEAMS = ['检修一班', '检修二班', '检修三班'] as const

/** 可接单的班组清单，主管确认时从这里选。 */
export const ACCEPT_CREWS = ['机务检修班', '电气检修班', '热控检修班', '综合检修班'] as const

/** 没有历史派工可参考时，按检修类别给的兜底建议。 */
const CATEGORY_DEFAULT_CREW: Record<string, string> = {
  机械检修: '机务检修班',
  电气检修: '电气检修班',
  热控检修: '热控检修班',
}

/**
 * 建议接单班组：优先看同一「检修类别 + 检修班组」的历史记录里主管确认过的接单班组，
 * 没有历史再按检修类别给默认值。建议只作参考，最终以检修主管确认的为准。
 */
export function suggestAcceptCrew(
  overhaulRows: EntryRow[],
  category: string,
  team: string,
): string {
  const history = overhaulRows.filter(
    (row) =>
      String(row['检修类别'] ?? '') === category &&
      String(row['检修班组'] ?? '') === team &&
      String(row['接单班组'] ?? '').trim() !== '',
  )
  if (history.length > 0) {
    return String(history[history.length - 1]['接单班组'])
  }
  return CATEGORY_DEFAULT_CREW[category] ?? '综合检修班'
}

/** 领用单号：由检修编号 + 备件编号唯一确定，同一张领用单重复提交时单号相同，只扣一次。 */
export function issueNoOf(overhaulNo: string, spareCode: string): string {
  return `LY-${overhaulNo}-${spareCode}`
}
