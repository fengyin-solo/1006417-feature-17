<template>
  <section class="page" data-module="overhaul">
    <header class="page-head">
      <div>
        <h2>设备检修管理管理</h2>
        <p class="page-desc">维护检修记录，围绕检修编号、检修设备、检修类别、检修班组做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记检修记录</button>
        <button class="btn" type="button" @click="exportRows">导出设备检修管理清单</button>
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
            <button class="link" type="button" @click="openDispatch(row)">派工</button>
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button class="link" type="button" @click="openEdit(row)">编辑</button>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无设备检修管理数据，可先登记检修记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条设备检修管理记录</span>
      <span v-if="noticeMessage" class="success-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3>登记检修记录</h3>
        <div class="form-grid">
          <label v-for="field in createFields" :key="field.key" class="form-item">
            <span>{{ field.key }}</span>
            <input
              v-model="createForm[field.key]"
              :type="field.type ?? 'text'"
              :list="field.list"
              :placeholder="field.key === '检修编号' ? '同一编号重复提交只落一条' : ''"
            />
          </label>
        </div>
        <datalist id="overhaul-categories">
          <option v-for="item in categories" :key="item" :value="item" />
        </datalist>
        <datalist id="spare-codes">
          <option v-for="item in spareOptions" :key="item" :value="item" />
        </datalist>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showCreate = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">确认登记</button>
        </div>
      </div>
    </div>

    <div v-if="editRow" class="modal-mask" @click.self="editRow = null">
      <div class="modal">
        <h3>编辑检修记录「{{ editRow['检修编号'] }}」</h3>
        <div class="form-grid">
          <label v-for="field in editFields" :key="field.key" class="form-item">
            <span>{{ field.key }}</span>
            <input
              v-model="editForm[field.key]"
              :type="field.type ?? 'text'"
              :list="field.list"
            />
          </label>
        </div>
        <p class="hint-text">更换备件等修改会保存到本机，刷新后仍在；检修状态只能走动作流转。</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="editRow = null">取消</button>
          <button class="btn primary" type="button" @click="submitEdit">保存修改</button>
        </div>
      </div>
    </div>

    <div v-if="dispatchRow" class="modal-mask" @click.self="dispatchRow = null">
      <div class="modal">
        <h3>检修派工「{{ dispatchRow['检修编号'] }}」</h3>
        <dl class="detail-list">
          <div><dt>检修设备</dt><dd>{{ dispatchRow['检修设备'] || '—' }}</dd></div>
          <div><dt>检修类别</dt><dd>{{ dispatchRow['检修类别'] || '—' }}</dd></div>
          <div><dt>检修班组</dt><dd>{{ dispatchRow['检修班组'] || '—' }}</dd></div>
          <div><dt>建议接单班组</dt><dd>{{ suggestedTeam }}</dd></div>
        </dl>
        <div class="form-grid">
          <label class="form-item">
            <span>接单班组（检修主管确认）</span>
            <input v-model="dispatchForm.confirmedTeam" :placeholder="`默认按建议：${suggestedTeam}`" />
          </label>
          <label class="form-item">
            <span>领用备件编号</span>
            <input v-model="dispatchForm.spareCode" list="spare-codes" placeholder="不填则本次不领用备件" />
          </label>
          <label class="form-item">
            <span>领用数量</span>
            <input v-model.number="dispatchForm.quantity" type="number" min="1" step="1" />
          </label>
        </div>
        <p class="hint-text">
          建议班组只作参考，最终以检修主管确认的接单班组为准；派工会把领用单回写到备件台账并扣减在库量，同一张领用单重复提交只扣一次。
        </p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="dispatchRow = null">取消</button>
          <button class="btn primary" type="button" @click="submitDispatch">确认派工</button>
        </div>
      </div>
    </div>

    <div v-if="detailRow" class="modal-mask" @click.self="detailRow = null">
      <div class="modal">
        <h3>检修记录详情「{{ detailRow['检修编号'] }}」</h3>
        <dl class="detail-list">
          <div><dt>当前状态</dt><dd>{{ detailRow.status }}</dd></div>
          <div v-for="field in detailFields" :key="field">
            <dt>{{ field }}</dt>
            <dd>{{ detailRow[field] || '—' }}</dd>
          </div>
        </dl>
        <div class="modal-actions">
          <button class="btn" type="button" @click="detailRow = null">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createEntry,
  dispatchOverhaul,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
  updateEntry,
} from '@/api/local-service'
import { OVERHAUL_CATEGORIES, suggestTeam } from '@/data/team-rules'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('overhaul')
const columns = ["检修编号", "检修设备", "检修类别", "检修班组", "更换备件", "建议班组", "接单班组", "派工状态", "检修状态"]
const actions = ["提交开工", "确认完工", "申请延期"]
const statuses = ["待开工", "检修中", "已完工", "已延期"]
const stats = [{"label": "待开工检修", "value": 0}, {"label": "检修中记录", "value": 0}, {"label": "本月完工数", "value": 0}]
const categories = OVERHAUL_CATEGORIES

type FormField = { key: string; type?: string; list?: string }
const createFields: FormField[] = [
  { key: '检修编号' },
  { key: '检修设备' },
  { key: '检修类别', list: 'overhaul-categories' },
  { key: '检修班组' },
  { key: '计划工期' },
  { key: '完工日期', type: 'date' },
  { key: '更换备件', list: 'spare-codes' },
]
const editFields = createFields.filter((field) => field.key !== '检修编号')
const detailFields = meta.fields

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const spareOptions = ref<string[]>([])

const showCreate = ref(false)
const createForm = ref<Record<string, string>>({})
const editRow = ref<EntryRow | null>(null)
const editForm = ref<Record<string, string>>({})
const dispatchRow = ref<EntryRow | null>(null)
const dispatchForm = ref({ confirmedTeam: '', spareCode: '', quantity: 1 })
const detailRow = ref<EntryRow | null>(null)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const suggestedTeam = computed(() => {
  if (!dispatchRow.value) {
    return ''
  }
  return suggestTeam(
    String(dispatchRow.value['检修类别'] ?? ''),
    String(dispatchRow.value['检修班组'] ?? ''),
  )
})

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function nextOverhaulCode(): string {
  const max = rows.value.reduce((acc, row) => {
    const matched = /^OVER-(\d+)$/.exec(String(row['检修编号'] ?? ''))
    return matched ? Math.max(acc, Number(matched[1])) : acc
  }, 0)
  return `OVER-${String(max + 1).padStart(4, '0')}`
}

function openCreate() {
  createForm.value = { 检修编号: nextOverhaulCode(), 派工状态: '未派工' }
  showCreate.value = true
}

function submitCreate() {
  errorMessage.value = ''
  const result = createEntry(meta.key, createForm.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  showCreate.value = false
  noticeMessage.value = result.message
  reload()
}

function openEdit(row: EntryRow) {
  editRow.value = row
  editForm.value = {}
  for (const field of editFields) {
    editForm.value[field.key] = String(row[field.key] ?? '')
  }
}

function submitEdit() {
  if (!editRow.value) {
    return
  }
  errorMessage.value = ''
  const result = updateEntry(meta.key, Number(editRow.value.id), editForm.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  editRow.value = null
  noticeMessage.value = result.message
  reload()
}

function openDispatch(row: EntryRow) {
  dispatchRow.value = row
  dispatchForm.value = {
    confirmedTeam: '',
    spareCode: String(row['更换备件'] ?? ''),
    quantity: 1,
  }
}

function submitDispatch() {
  if (!dispatchRow.value) {
    return
  }
  errorMessage.value = ''
  const result = dispatchOverhaul(Number(dispatchRow.value.id), {
    confirmedTeam: dispatchForm.value.confirmedTeam,
    spareCode: dispatchForm.value.spareCode,
    quantity: dispatchForm.value.quantity,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  dispatchRow.value = null
  noticeMessage.value = result.message
  reload()
}

function openDetail(row: EntryRow) {
  detailRow.value = row
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '设备检修管理列表读取失败'
  }
}

onMounted(() => {
  reload()
  spareOptions.value = listEntries('spare').items.map((row) => String(row['备件编号']))
})
</script>
