// 检修派工的班组建议规则：先按检修类别里的关键词匹配专业检修班，匹配不到再沿用记录上的
// 检修班组，最后兜底综合检修班。建议只作参考，最终以检修主管派工时确认的接单班组为准。
const CATEGORY_TEAM_RULES: { keyword: string; team: string }[] = [
  { keyword: '锅炉', team: '锅炉检修班' },
  { keyword: '汽机', team: '汽机检修班' },
  { keyword: '电气', team: '电气检修班' },
  { keyword: '热控', team: '热控检修班' },
  { keyword: '化水', team: '化水检修班' },
  { keyword: '烟气', team: '烟气检修班' },
]

export const FALLBACK_TEAM = '综合检修班'

// 登记检修记录时检修类别的常用选项，仍可手工填别的
export const OVERHAUL_CATEGORIES = [
  '锅炉检修',
  '汽机检修',
  '电气检修',
  '热控检修',
  '化水检修',
  '烟气检修',
]

export function suggestTeam(category: string, reportTeam: string): string {
  const text = category.trim()
  for (const rule of CATEGORY_TEAM_RULES) {
    if (text.includes(rule.keyword)) {
      return rule.team
    }
  }
  const reporter = reportTeam.trim()
  return reporter === '' ? FALLBACK_TEAM : reporter
}
