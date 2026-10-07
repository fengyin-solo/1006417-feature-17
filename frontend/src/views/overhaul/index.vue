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
          <td v-for="column in columns" :key="column">{{ row[column] || '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
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
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="createVisible" class="modal-mask" @click.self="createVisible = false">
      <form class="modal-card" @submit.prevent="submitCreate">
        <h3>登记检修记录</h3>
        <label class="form-item">
          <span>检修编号</span>
          <input v-model="createForm['检修编号']" placeholder="例如 OVER-0004" />
        </label>
        <label class="form-item">
          <span>检修设备</span>
          <input v-model="createForm['检修设备']" placeholder="例如 #1焚烧炉给料器" />
        </label>
        <label class="form-item">
          <span>检修类别</span>
          <select v-model="createForm['检修类别']">
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>检修班组</span>
          <select v-model="createForm['检修班组']">
            <option v-for="item in teams" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>计划工期</span>
          <input v-model="createForm['计划工期']" placeholder="例如 3天" />
        </label>
        <label class="form-item">
          <span>更换备件</span>
          <input v-model="createForm['更换备件']" placeholder="可留空，派工领用后自动带出" />
        </label>
        <p class="modal-tip">同一检修编号只落一条，重复提交会被挡下。</p>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <div class="modal-actions">
          <button class="btn primary" type="submit">提交登记</button>
          <button class="btn ghost" type="button" @click="createVisible = false">取消</button>
        </div>
      </form>
    </div>

    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal-card">
        <h3>检修记录详情 · {{ detail['检修编号'] }}</h3>
        <dl class="detail-grid">
          <template v-for="column in columns" :key="column">
            <dt>{{ column }}</dt>
            <dd>{{ detail[column] || '—' }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ detail.status }}</dd>
          <template v-if="detail['确认人']">
            <dt>确认人</dt>
            <dd>{{ detail['确认人'] }}（{{ detail['派工时间'] }}）</dd>
          </template>
        </dl>

        <div class="detail-section">
          <h4>更换备件</h4>
          <div class="inline-form">
            <input v-model="spareText" :disabled="detailDone" placeholder="登记本次更换的备件" />
            <button class="btn" type="button" :disabled="detailDone" @click="saveSpareText">保存</button>
          </div>
        </div>

        <div class="detail-section">
          <h4>派工</h4>
          <p v-if="detailDone" class="modal-tip">已完工的记录不允许再派工。</p>
          <template v-else>
            <p class="modal-tip">
              建议接单班组：{{ suggestedCrew }}（按检修类别与检修班组带出，仅供参考，以检修主管确认为准）
            </p>
            <div class="inline-form">
              <label class="form-item">
                <span>接单班组</span>
                <select v-model="dispatchForm.crew">
                  <option v-for="item in crews" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>检修主管</span>
                <input v-model="dispatchForm.confirmer" placeholder="确认人" />
              </label>
            </div>
            <div class="inline-form">
              <label class="form-item">
                <span>领用备件</span>
                <select v-model="dispatchForm.spareCode">
                  <option value="">不领用备件</option>
                  <option v-for="spare in availableSpares" :key="String(spare['备件编号'])" :value="String(spare['备件编号'])">
                    {{ spare['备件编号'] }} · {{ spare['备件名称'] }}（在库 {{ spare['在库量'] }}）
                  </option>
                </select>
              </label>
              <label class="form-item">
                <span>领用数量</span>
                <input v-model.number="dispatchForm.quantity" type="number" min="1" :disabled="!dispatchForm.spareCode" />
              </label>
            </div>
            <div class="modal-actions">
              <button class="btn primary" type="button" @click="submitDispatch">确认派工</button>
            </div>
          </template>
          <p v-if="detailMessage" class="modal-tip">{{ detailMessage }}</p>
        </div>

        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
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
  listAvailableSpares,
  listEntries,
  moduleMeta,
  runAction as applyAction,
  updateEntry,
} from '@/api/local-service'
import { ACCEPT_CREWS, OVERHAUL_CATEGORIES, OVERHAUL_TEAMS, suggestAcceptCrew } from '@/data/dispatch'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('overhaul')
const columns = ["检修编号", "检修设备", "检修类别", "检修班组", "计划工期", "完工日期", "更换备件", "接单班组"]
const actions = ["提交开工", "确认完工", "申请延期"]
const statuses = ["待开工", "检修中", "已完工", "已延期"]
const stats = [{"label": "待开工检修", "value": 0}, {"label": "检修中记录", "value": 0}, {"label": "本月完工数", "value": 0}]
const categories = [...OVERHAUL_CATEGORIES]
const teams = [...OVERHAUL_TEAMS]
const crews = [...ACCEPT_CREWS]

const store = useSessionStore()

const rows = ref<EntryRow[]>([])
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

const createVisible = ref(false)
const createError = ref('')
const createForm = ref<Record<string, string>>({})

const detail = ref<EntryRow | null>(null)
const detailMessage = ref('')
const spareText = ref('')
const availableSpares = ref<EntryRow[]>([])
const dispatchForm = ref({ crew: '', confirmer: '', spareCode: '', quantity: 1 })

const detailDone = computed(() => String(detail.value?.status) === '已完工')
const suggestedCrew = computed(() =>
  detail.value
    ? suggestAcceptCrew(rows.value, String(detail.value['检修类别'] ?? ''), String(detail.value['检修班组'] ?? ''))
    : '',
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function nextOverhaulNo(): string {
  const max = rows.value.reduce((acc, row) => {
    const matched = /^OVER-(\d+)$/.exec(String(row['检修编号'] ?? ''))
    return matched ? Math.max(acc, Number(matched[1])) : acc
  }, 0)
  return `OVER-${String(max + 1).padStart(4, '0')}`
}

function openCreate() {
  createError.value = ''
  createForm.value = {
    检修编号: nextOverhaulNo(),
    检修设备: '',
    检修类别: categories[0],
    检修班组: teams[0],
    计划工期: '',
    更换备件: '',
  }
  createVisible.value = true
}

function submitCreate() {
  createError.value = ''
  const result = createEntry(meta.key, createForm.value, '检修编号')
  if (!result.ok) {
    createError.value = result.message
    return
  }
  createVisible.value = false
  reload()
}

function openDetail(row: EntryRow) {
  detail.value = { ...row }
  spareText.value = String(row['更换备件'] ?? '')
  detailMessage.value = ''
  availableSpares.value = listAvailableSpares()
  dispatchForm.value = {
    crew: String(row['接单班组'] ?? '').trim() || suggestedCrew.value,
    confirmer: store.operator,
    spareCode: '',
    quantity: 1,
  }
}

function closeDetail() {
  detail.value = null
}

function syncDetail() {
  if (!detail.value) {
    return
  }
  const fresh = rows.value.find((row) => Number(row.id) === Number(detail.value?.id))
  if (fresh) {
    detail.value = { ...fresh }
    spareText.value = String(fresh['更换备件'] ?? '')
  }
  availableSpares.value = listAvailableSpares()
}

function saveSpareText() {
  if (!detail.value) {
    return
  }
  const result = updateEntry(meta.key, Number(detail.value.id), { 更换备件: spareText.value.trim() })
  detailMessage.value = result.message
  if (result.ok) {
    reload()
  }
}

function submitDispatch() {
  if (!detail.value) {
    return
  }
  const result = dispatchOverhaul({
    id: Number(detail.value.id),
    crew: dispatchForm.value.crew,
    confirmer: dispatchForm.value.confirmer,
    spareCode: dispatchForm.value.spareCode,
    quantity: dispatchForm.value.quantity,
  })
  detailMessage.value = result.message
  if (result.ok) {
    reload()
  }
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
    syncDetail()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '设备检修管理列表读取失败'
  }
}

onMounted(reload)
</script>
