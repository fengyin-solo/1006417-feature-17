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

    <section class="ledger">
      <h3>备件领用清单</h3>
      <p class="page-desc">检修派工确认的备件领用会回写到这里；同一张领用单重复提交只扣一次在库量。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in issueColumns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="issue in issues" :key="String(issue.id)">
            <td v-for="column in issueColumns" :key="column">{{ issue[column] ?? '—' }}</td>
          </tr>
          <tr v-if="!issues.length">
            <td :colspan="issueColumns.length" class="empty-state">暂无领用记录，检修派工领用备件后自动登记</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条备件台账管理记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  listSpareIssues,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('spare')
const columns = ["备件编号", "备件名称", "规格型号", "所属系统", "存放库位", "在库量", "最低储备量", "责任人员", "备件状态"]
const actions = ["登记入库", "办理领用", "报废备件"]
const statuses = ["待入库", "在库可用", "已领用", "已报废"]
const stats = [{"label": "在库可用备件", "value": 0}, {"label": "已领用备件", "value": 0}, {"label": "待入库备件", "value": 0}]
const issueColumns = ["领用单号", "检修编号", "备件编号", "备件名称", "领用数量", "接单班组", "经办人", "办理时间"]

const rows = ref<EntryRow[]>([])
const issues = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

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
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    issues.value = listSpareIssues()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '备件台账管理列表读取失败'
  }
}

onMounted(reload)
</script>
