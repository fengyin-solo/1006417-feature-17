<template>
  <section class="page" data-module="spare">
    <header class="page-head">
      <div>
        <h2>备件台账管理管理</h2>
        <p class="page-desc">维护备品备件，围绕备件编号、备件名称、规格型号、所属系统做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记备品备件</button>
        <button class="btn" type="button" @click="exportRows">导出备件台账管理清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无备件台账管理数据，可先登记备品备件</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">备件领用清单</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in issueColumns" :key="column">{{ column }}</th>
          <th>当前状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in issueRows" :key="String(row.id)">
          <td v-for="column in issueColumns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
        </tr>
        <tr v-if="!issueRows.length">
          <td :colspan="issueColumns.length + 1" class="empty-state">暂无领用记录，办理领用或检修派工后会出现在这里</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条备件台账管理记录 · {{ issueRows.length }} 张领用单</span>
      <span v-if="noticeMessage" class="success-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="issueRow" class="modal-mask" @click.self="issueRow = null">
      <div class="modal">
        <h3>办理领用「{{ issueRow['备件编号'] }}」{{ issueRow['备件名称'] }}</h3>
        <dl class="detail-list">
          <div><dt>当前在库量</dt><dd>{{ issueRow['在库量'] ?? 0 }}</dd></div>
          <div><dt>领用单号</dt><dd>{{ issueOrderNo }}</dd></div>
        </dl>
        <div class="form-grid">
          <label class="form-item">
            <span>领用数量</span>
            <input v-model.number="issueForm.quantity" type="number" min="1" step="1" />
          </label>
          <label class="form-item">
            <span>关联检修编号</span>
            <input v-model="issueForm.overhaulNo" list="overhaul-codes" placeholder="选填，关联后单号取 LY-检修编号" />
          </label>
          <label class="form-item">
            <span>领用班组</span>
            <input v-model="issueForm.team" placeholder="选填" />
          </label>
        </div>
        <datalist id="overhaul-codes">
          <option v-for="item in overhaulOptions" :key="item" :value="item" />
        </datalist>
        <p class="hint-text">办完后在库量跟着减；同一张领用单重复提交只扣一次。</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="issueRow = null">取消</button>
          <button class="btn primary" type="button" @click="submitIssue">确认领用</button>
        </div>
      </div>
    </div>

    <div v-if="restockRow" class="modal-mask" @click.self="restockRow = null">
      <div class="modal">
        <h3>登记入库「{{ restockRow['备件编号'] }}」{{ restockRow['备件名称'] }}</h3>
        <div class="form-grid">
          <label class="form-item">
            <span>入库数量</span>
            <input v-model.number="restockForm.quantity" type="number" min="1" step="1" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" @click="restockRow = null">取消</button>
          <button class="btn primary" type="button" @click="submitRestock">确认入库</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  issueSpare,
  listEntries,
  moduleMeta,
  restockSpare,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('spare')
const columns = ["备件编号", "备件名称", "规格型号", "所属系统", "存放库位", "在库量", "最低储备量", "责任人员", "备件状态"]
const actions = ["登记入库", "办理领用", "报废备件"]
const statuses = ["待入库", "在库可用", "已领用", "已报废"]
const stats = [{"label": "在库可用备件", "value": 0}, {"label": "已领用备件", "value": 0}, {"label": "待入库备件", "value": 0}]
const issueColumns = ["领用单号", "备件编号", "备件名称", "领用数量", "关联检修编号", "领用班组", "领用时间"]

const rows = ref<EntryRow[]>([])
const issueRows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const overhaulOptions = ref<string[]>([])

const issueRow = ref<EntryRow | null>(null)
const issueForm = ref({ quantity: 1, overhaulNo: '', team: '' })
const restockRow = ref<EntryRow | null>(null)
const restockForm = ref({ quantity: 1 })

const todayLabel = (() => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
})()

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 关联了检修编号就与检修派工共用同一张领用单，否则按备件+日期出单，重复提交也只扣一次。
const issueOrderNo = computed(() => {
  if (!issueRow.value) {
    return ''
  }
  const overhaulNo = issueForm.value.overhaulNo.trim()
  return overhaulNo === ''
    ? `LY-${String(issueRow.value['备件编号'])}-${todayLabel}`
    : `LY-${overhaulNo}`
})

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '备品备件登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  if (action === '办理领用') {
    issueRow.value = row
    issueForm.value = { quantity: 1, overhaulNo: '', team: '' }
    return
  }
  if (action === '登记入库') {
    restockRow.value = row
    restockForm.value = { quantity: 1 }
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function submitIssue() {
  if (!issueRow.value) {
    return
  }
  errorMessage.value = ''
  const result = issueSpare({
    领用单号: issueOrderNo.value,
    备件编号: String(issueRow.value['备件编号']),
    数量: issueForm.value.quantity,
    关联检修编号: issueForm.value.overhaulNo.trim(),
    领用班组: issueForm.value.team.trim(),
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  issueRow.value = null
  noticeMessage.value = result.message
  reload()
}

function submitRestock() {
  if (!restockRow.value) {
    return
  }
  errorMessage.value = ''
  const result = restockSpare(Number(restockRow.value.id), restockForm.value.quantity)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  restockRow.value = null
  noticeMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    issueRows.value = listEntries('spare-issue').items
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '备件台账管理列表读取失败'
  }
}

onMounted(() => {
  reload()
  overhaulOptions.value = listEntries('overhaul').items.map((row) => String(row['检修编号']))
})
</script>
