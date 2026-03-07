import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Sliders, Bell, Database, History, Minus, Plus,
  ArchiveRestore, Download, Upload, Archive, Trash2, Eye, X,
  Terminal, GitCompare, ArrowLeftRight, Sun, Moon, Monitor
} from 'lucide-react'
import { cn } from './utils/cn'
import { clampFontLevel, FONT_LEVEL_LABELS } from './utils/fontLevel'
import { isWindows } from './utils/platform'

const HISTORY_OPTIONS = [
  { value: 3, label: '3 天' }, { value: 7, label: '1 周' }, { value: 30, label: '1 个月' },
  { value: 90, label: '3 个月' }, { value: 180, label: '6 个月' }, { value: 365, label: '1 年' },
]

const FONT_CONTROLS = [
  { key: 'displayKeySize', title: '展示页 Key 字体', description: '变量名、Key 的显示字号' },
  { key: 'displayValueSize', title: '展示页 Value 字体', description: '变量值、路径值的显示字号' },
  { key: 'modalKeySize', title: '弹窗 Key 字体', description: '编辑/新建弹窗中的 Key 输入字号' },
  { key: 'modalValueSize', title: '弹窗 Value 字体', description: '编辑/新建弹窗中的 Value 输入字号' },
]

const THEME_OPTIONS = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

const BACKUP_SCOPE_OPTIONS = [
  { value: 'user', label: '用户变量', description: '备份自定义用户变量、用户变量及相关历史记录。' },
  { value: 'system', label: '系统变量', description: '仅备份系统环境变量。' },
  { value: 'all', label: '全部备份', description: '同时备份用户变量、系统变量与设置。' },
]

const BACKUP_SCOPE_LABELS = { user: '用户', system: '系统', all: '全部' }

function toTextValue(v) { return v == null ? '' : String(v) }
function mapFromSnapshot(snapshot) {
  const map = new Map(); if (!snapshot) return map
  if (Array.isArray(snapshot)) { snapshot.forEach(item => { const key = item?.name || item?.key; if (key) map.set(String(key), toTextValue(item.value)) }); return map }
  if (typeof snapshot === 'object') Object.entries(snapshot).forEach(([k, v]) => { if (k) map.set(String(k), toTextValue(v)) })
  return map
}
function mapFromDocs(docs, target) {
  const map = new Map()
  ;(docs || []).forEach(doc => {
    if (!doc?._id || !doc?.data) return
    if (target === 'user') {
      if (doc._id.startsWith('system-user-var-') && doc.data?.name) map.set(String(doc.data.name), toTextValue(doc.data.value))
      if (doc._id.startsWith('user-group-') && Array.isArray(doc.data.variables)) doc.data.variables.forEach(v => { if (v?.name) map.set(String(v.name), toTextValue(v.value)) })
      return
    }
    if ((doc._id.startsWith('system-var-') || doc.data?.isSystem) && doc.data?.name) map.set(String(doc.data.name), toTextValue(doc.data.value))
  })
  return map
}
function sortEntries(map) { return Array.from(map.entries()).filter(([k]) => Boolean(k)).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN')).map(([key, value]) => ({ key, value })) }
function getBackupPreviewData(backup) {
  const uS = mapFromSnapshot(backup?.envSnapshots?.user), sS = mapFromSnapshot(backup?.envSnapshots?.system)
  const uF = mapFromDocs(backup?.docs, 'user'), sF = mapFromDocs(backup?.docs, 'system')
  return { userEntries: sortEntries(uS.size > 0 ? uS : uF), systemEntries: sortEntries(sS.size > 0 ? sS : sF) }
}

function ToggleSwitch({ checked, onChange, ariaLabel }) {
  return (
    <button type="button" onClick={onChange} aria-label={ariaLabel} aria-pressed={checked}
      className={cn('relative w-12 h-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 dark:focus:ring-slate-600', checked ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-300 dark:bg-slate-600')}>
      <span className={cn('absolute left-1 top-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}

export default function SettingsPage({ onBack, appSettings, onUpdateAppSettings, backups, onLoadBackups, onCreateBackup, onRestoreBackup, onDeleteBackup, onImportBackup, onDataChanged }) {
  const [selectedBackupId, setSelectedBackupId] = useState('')
  const [activeSection, setActiveSection] = useState('general')
  const [toast, setToast] = useState(null)
  const [showBackupScopeModal, setShowBackupScopeModal] = useState(false)
  const [backupScopeSelection, setBackupScopeSelection] = useState('all')
  const [pendingArchiveBackupId, setPendingArchiveBackupId] = useState(null)
  const [previewBackupId, setPreviewBackupId] = useState('')
  const [diffBackupId, setDiffBackupId] = useState('')
  const [diffData, setDiffData] = useState(null)
  const [showBackupDiffModal, setShowBackupDiffModal] = useState(false)
  const [diffBackupA, setDiffBackupA] = useState('')
  const [diffBackupB, setDiffBackupB] = useState('')
  const [shellConfigInfo, setShellConfigInfo] = useState(null)

  const contentScrollRef = useRef(null)
  const sectionRefs = useRef({ general: null, notification: null, backup: null, history: null, shell: null })
  const isScrollingByClick = useRef(false)

  useEffect(() => { onLoadBackups?.() }, [onLoadBackups])
  useEffect(() => { if (!selectedBackupId && backups?.length > 0) setSelectedBackupId(backups[0].id) }, [backups, selectedBackupId])
  useEffect(() => {
    if (!isWindows() && window.services?.getShellConfigInfo) {
      try { setShellConfigInfo(window.services.getShellConfigInfo()) } catch {}
    }
  }, [])

  useEffect(() => {
    const container = contentScrollRef.current
    if (!container) return
    const handleScroll = () => {
      if (isScrollingByClick.current) return
      const refs = sectionRefs.current
      const containerTop = container.getBoundingClientRect().top
      let closest = null, closestDist = Infinity
      for (const [id, el] of Object.entries(refs)) {
        if (!el) continue
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop)
        if (dist < closestDist) { closestDist = dist; closest = id }
      }
      if (closest) setActiveSection(closest)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const showToast = (message, type = 'success') => {
    const desktopEnabled = appSettings?.notifications?.desktopEnabled === true
    const inAppEnabled = appSettings?.notifications?.inAppEnabled !== false
    if (desktopEnabled && window.utools?.showNotification) window.utools.showNotification(message)
    if (!inAppEnabled) { setToast(null); return }
    setToast({ message, type }); setTimeout(() => setToast(null), 3000)
  }

  const updateFontLevel = (key, nextLevel) => onUpdateAppSettings?.({ font: { [key]: clampFontLevel(nextLevel) } })
  const updateThemeMode = (mode) => onUpdateAppSettings?.({ theme: { mode } })
  const updateHistorySetting = (partial) => onUpdateAppSettings?.({ history: partial })
  const updateNotificationSetting = (partial) => onUpdateAppSettings?.({ notifications: partial })

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId)
    isScrollingByClick.current = true
    const container = contentScrollRef.current, target = sectionRefs.current[sectionId]
    if (!container || !target) { isScrollingByClick.current = false; return }
    const cR = container.getBoundingClientRect(), tR = target.getBoundingClientRect()
    container.scrollTo({ top: container.scrollTop + (tR.top - cR.top) - 8, behavior: 'smooth' })
    setTimeout(() => { isScrollingByClick.current = false }, 500)
  }

  const handleCreateBackup = () => setShowBackupScopeModal(true)
  const handleConfirmCreateBackup = async () => {
    const created = await onCreateBackup?.({ scope: backupScopeSelection })
    if (created) { setSelectedBackupId(created.id); onLoadBackups?.(); showToast('已创建当前配置备份', 'success'); setShowBackupScopeModal(false) } else showToast('创建备份失败', 'error')
  }
  const handleRestoreBackup = async () => {
    if (!selectedBackupId) { showToast('请先选择一个备份', 'error'); return }
    const success = await onRestoreBackup?.(selectedBackupId)
    if (success) { onLoadBackups?.(); onDataChanged?.(); showToast('备份还原成功', 'success') } else showToast('还原备份失败', 'error')
  }
  const handleExportBackup = () => {
    if (!selectedBackupId) { showToast('请先选择一个备份', 'error'); return }
    const selected = (backups || []).find(item => item.id === selectedBackupId)
    if (!selected) { showToast('未找到所选备份', 'error'); return }
    const savePath = utools.showSaveDialog({
      title: '导出备份',
      defaultPath: `env-assistant-backup-${selected.id}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    })
    if (!savePath) return
    const payload = { type: 'env-assistant-backup', version: 1, exportedAt: new Date().toISOString(), backup: selected }
    try {
      window.services.writeFileText(savePath, JSON.stringify(payload, null, 2))
      showToast('备份已导出', 'success')
    } catch (e) { showToast('导出失败: ' + e.message, 'error') }
  }
  const handleImportBackup = () => {
    const paths = utools.showOpenDialog({
      title: '导入备份',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (!paths || paths.length === 0) return
    try {
      const content = window.services.readFileText(paths[0])
      const parsed = JSON.parse(content)
      const imported = onImportBackup?.(parsed)
      if (imported) { setSelectedBackupId(imported.id); onLoadBackups?.(); onDataChanged?.(); showToast('备份导入成功', 'success') }
      else showToast('导入失败：备份格式不正确', 'error')
    } catch (e) { showToast('导入失败: ' + e.message, 'error') }
  }
  const handleArchiveAction = async (backupId) => {
    if (pendingArchiveBackupId !== backupId) { setPendingArchiveBackupId(backupId); showToast('再次点击可删除该备份', 'info'); return }
    const success = await onDeleteBackup?.(backupId)
    if (success) { setPendingArchiveBackupId(null); const next = (backups || []).filter(item => item.id !== backupId); setSelectedBackupId(prev => prev === backupId ? (next[0]?.id || '') : prev); onLoadBackups?.(); showToast('备份已删除', 'success') } else showToast('删除备份失败', 'error')
  }

  const computeDiff = (mapA, mapB) => {
    const added = [], removed = [], modified = []
    mapA.forEach((v, k) => { if (!mapB.has(k)) added.push({ key: k, value: v }); else if (mapB.get(k) !== v) modified.push({ key: k, oldValue: mapB.get(k), newValue: v }) })
    mapB.forEach((v, k) => { if (!mapA.has(k)) removed.push({ key: k, value: v }) })
    return { added, removed, modified }
  }

  const handleDiffCompare = async () => {
    if (!selectedBackupId) { showToast('请先选择一个备份', 'error'); return }
    const backup = (backups || []).find(item => item.id === selectedBackupId)
    if (!backup) return
    const backupScope = backup.scope || 'all'
    const backupData = getBackupPreviewData(backup)
    const backupUserMap = new Map(backupData.userEntries.map(e => [e.key, e.value]))
    const backupSystemMap = new Map(backupData.systemEntries.map(e => [e.key, e.value]))
    let currentUser = new Map(), currentSystem = new Map()
    if (window.services?.getAllEnvironmentVariables) {
      try {
        if (backupScope === 'user' || backupScope === 'all') {
          const uVars = await window.services.getAllEnvironmentVariables(false)
          Object.entries(uVars || {}).forEach(([k, v]) => currentUser.set(k, toTextValue(v)))
        }
        if (backupScope === 'system' || backupScope === 'all') {
          const sVars = await window.services.getAllEnvironmentVariables(true)
          Object.entries(sVars || {}).forEach(([k, v]) => currentSystem.set(k, toTextValue(v)))
        }
      } catch {}
    }
    setDiffData({
      user: (backupScope === 'user' || backupScope === 'all') ? computeDiff(currentUser, backupUserMap) : null,
      system: (backupScope === 'system' || backupScope === 'all') ? computeDiff(currentSystem, backupSystemMap) : null,
      backupScope,
      titleA: '当前环境',
      titleB: backup.name,
    })
    setDiffBackupId(selectedBackupId)
  }

  const handleBackupDiffOpen = () => {
    if ((backups || []).length < 2) { showToast('至少需要两个备份才能进行备份间对比', 'error'); return }
    setDiffBackupA(backups[0]?.id || '')
    setDiffBackupB(backups[1]?.id || '')
    setShowBackupDiffModal(true)
  }

  const handleBackupDiffCompare = () => {
    if (!diffBackupA || !diffBackupB) { showToast('请选择两个备份', 'error'); return }
    if (diffBackupA === diffBackupB) { showToast('请选择两个不同的备份', 'error'); return }
    const backupA = (backups || []).find(item => item.id === diffBackupA)
    const backupB = (backups || []).find(item => item.id === diffBackupB)
    if (!backupA || !backupB) return
    const dataA = getBackupPreviewData(backupA)
    const dataB = getBackupPreviewData(backupB)
    const scopeA = backupA.scope || 'all', scopeB = backupB.scope || 'all'
    const hasUser = (scopeA === 'user' || scopeA === 'all') && (scopeB === 'user' || scopeB === 'all')
    const hasSystem = (scopeA === 'system' || scopeA === 'all') && (scopeB === 'system' || scopeB === 'all')
    const userMapA = new Map(dataA.userEntries.map(e => [e.key, e.value]))
    const userMapB = new Map(dataB.userEntries.map(e => [e.key, e.value]))
    const sysMapA = new Map(dataA.systemEntries.map(e => [e.key, e.value]))
    const sysMapB = new Map(dataB.systemEntries.map(e => [e.key, e.value]))
    setDiffData({
      user: hasUser ? computeDiff(userMapA, userMapB) : null,
      system: hasSystem ? computeDiff(sysMapA, sysMapB) : null,
      backupScope: hasUser && hasSystem ? 'all' : hasUser ? 'user' : 'system',
      titleA: backupA.name,
      titleB: backupB.name,
    })
    setShowBackupDiffModal(false)
  }

  const previewBackup = (backups || []).find(item => item.id === previewBackupId) || null
  const previewData = previewBackup ? getBackupPreviewData(previewBackup) : null

  const sidebarItems = [
    { id: 'general', label: '通用', icon: Sliders },
    { id: 'notification', label: '通知', icon: Bell },
    { id: 'backup', label: '备份', icon: Database },
    { id: 'history', label: '历史记录', icon: History },
    ...(!isWindows() ? [{ id: 'shell', label: 'Shell 配置', icon: Terminal }] : []),
  ]

  return (
    <div className="h-screen bg-zinc-50 dark:bg-slate-900 flex flex-col">
      <div className="z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="px-6"><div className="flex items-center gap-4 h-16">
          <button onClick={onBack} className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div><h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">设置中心</h1><p className="text-xs text-slate-500 dark:text-slate-400">通用 · 通知 · 备份 · 历史记录</p></div>
        </div></div>
      </div>

      <div className="flex-1 min-h-0 p-6">
        <div className="flex h-full gap-4">
          <aside className="w-56 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <div className="space-y-2">
              {sidebarItems.map(item => (
                <button key={item.id} onClick={() => scrollToSection(item.id)}
                  className={cn('w-full h-10 px-3 rounded-lg flex items-center gap-2 text-sm', activeSection === item.id ? 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700')}>
                  <item.icon className="w-4 h-4" /> {item.label}
                </button>
              ))}
            </div>
          </aside>

          <section ref={contentScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
            {/* General Section (Font + Theme) */}
            <div ref={el => { sectionRefs.current.general = el }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">通用</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">主题和字体设置。</p>

              {/* Theme */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 mb-4">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">主题颜色</p>
                <div className="flex gap-3">
                  {THEME_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => updateThemeMode(opt.value)}
                      className={cn('flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium border transition-colors',
                        appSettings?.theme?.mode === opt.value ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600')}>
                      <opt.icon className="w-4 h-4" /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font */}
              <div className="space-y-4">
                {FONT_CONTROLS.map(control => {
                  const level = appSettings?.font?.[control.key] ?? 2
                  return (
                    <div key={control.key} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">{control.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{control.description}</p></div>
                        <span className="px-2 py-1 text-xs rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300">{level} 档 · {FONT_LEVEL_LABELS[level]}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateFontLevel(control.key, level - 1)} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                        <input type="range" min={1} max={4} step={1} value={level} onChange={e => updateFontLevel(control.key, Number(e.target.value))} className="flex-1 accent-slate-900 dark:accent-slate-100" />
                        <button onClick={() => updateFontLevel(control.key, level + 1)} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Notification */}
            <div ref={el => { sectionRefs.current.notification = el }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">通知</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">控制系统桌面通知和窗口内通知。</p>
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">系统桌面通知</p><p className="text-xs text-slate-500 dark:text-slate-400">在系统通知中心显示提示。</p></div>
                  <ToggleSwitch checked={Boolean(appSettings?.notifications?.desktopEnabled)} onChange={() => updateNotificationSetting({ desktopEnabled: !appSettings?.notifications?.desktopEnabled })} ariaLabel="切换系统桌面通知" />
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-600" />
                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">窗口内通知</p><p className="text-xs text-slate-500 dark:text-slate-400">在插件界面内显示 Toast。</p></div>
                  <ToggleSwitch checked={appSettings?.notifications?.inAppEnabled !== false} onChange={() => updateNotificationSetting({ inAppEnabled: appSettings?.notifications?.inAppEnabled === false })} ariaLabel="切换窗口内通知" />
                </div>
              </div>
            </div>

            {/* Backup */}
            <div ref={el => { sectionRefs.current.backup = el }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">备份</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">创建、还原、导入/导出备份以及对比差异。</p>
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={handleCreateBackup} className="h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 flex items-center gap-2"><Database className="w-4 h-4" /> 备份当前</button>
                <button onClick={handleRestoreBackup} className="h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"><ArchiveRestore className="w-4 h-4" /> 还原备份</button>
                <button onClick={handleExportBackup} className="h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"><Download className="w-4 h-4" /> 导出备份</button>
                <button onClick={handleImportBackup} className="h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"><Upload className="w-4 h-4" /> 导入备份</button>
                <button onClick={handleDiffCompare} className="h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"><GitCompare className="w-4 h-4" /> 对比差异</button>
                <button onClick={handleBackupDiffOpen} className="h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /> 备份间对比</button>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {(backups || []).length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">暂无备份记录</p>}
                  {(backups || []).map(backup => (
                    <div key={backup.id} className="flex items-stretch gap-2">
                      <button onClick={() => setSelectedBackupId(backup.id)}
                        className={cn('flex-1 text-left rounded-lg border p-3 transition-colors', selectedBackupId === backup.id ? 'bg-white dark:bg-slate-700 border-slate-900 dark:border-slate-100' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500')}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{backup.name}</p>
                          <span className="shrink-0 px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300">{BACKUP_SCOPE_LABELS[backup.scope] || '全部'}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{new Date(backup.createdAt).toLocaleString('zh-CN')} · {backup.managedCount || backup.docs?.length || 0} 项</p>
                      </button>
                      <button onClick={() => { setSelectedBackupId(backup.id); setPreviewBackupId(backup.id) }} className="w-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-center"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => handleArchiveAction(backup.id)}
                        className={cn('w-10 rounded-lg border flex items-center justify-center transition-colors', pendingArchiveBackupId === backup.id ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600')}>
                        {pendingArchiveBackupId === backup.id ? <Trash2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* History */}
            <div ref={el => { sectionRefs.current.history = el }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">历史记录</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">控制操作历史的定期清理策略。</p>
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">启用定期自动清理</p><p className="text-xs text-slate-500 dark:text-slate-400">开启后将按设定周期自动删除过期历史记录。</p></div>
                  <ToggleSwitch checked={Boolean(appSettings?.history?.autoCleanupEnabled)} onChange={() => updateHistorySetting({ autoCleanupEnabled: !appSettings?.history?.autoCleanupEnabled })} ariaLabel="切换历史记录自动清理" />
                </div>
                {appSettings?.history?.autoCleanupEnabled && (
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">清理周期</label>
                    <select value={appSettings?.history?.autoCleanupDays || 30} onChange={e => updateHistorySetting({ autoCleanupDays: Number(e.target.value) })}
                      className="h-10 px-3 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500">
                      {HISTORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Shell Config (Mac/Linux only) */}
            {!isWindows() && (
              <div ref={el => { sectionRefs.current.shell = el }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Shell 配置</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">当前 Shell 配置文件和插件管理的变量。</p>
                {shellConfigInfo ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">配置文件路径</p>
                      <p className="font-mono text-sm text-slate-900 dark:text-slate-100">{shellConfigInfo.configPath}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">插件管理的变量 ({shellConfigInfo.managedVariables?.length || 0} 个)</p>
                      {(shellConfigInfo.managedVariables || []).length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">暂无插件管理的变量</p>
                      ) : (
                        <div className="space-y-1">
                          {shellConfigInfo.managedVariables.map((v, i) => (
                            <div key={i} className="flex items-center gap-2 font-mono text-xs">
                              <span className="text-slate-900 dark:text-slate-100 font-medium">{v.name}</span>
                              <span className="text-slate-400">=</span>
                              <span className="text-slate-600 dark:text-slate-300 break-all">{v.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">无法获取 Shell 配置信息</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg',
            toast.type === 'success' && 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
            toast.type === 'error' && 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200',
            toast.type === 'info' && 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
          )}><span className="text-sm font-medium">{toast.message}</span></div>
        </div>
      )}

      {/* Backup Preview Modal */}
      {previewBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[86vh] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">备份内容查看</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{previewBackup.name} · {new Date(previewBackup.createdAt).toLocaleString('zh-CN')}</p></div>
              <button onClick={() => setPreviewBackupId('')} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {[{ title: '用户变量', entries: previewData?.userEntries }, { title: '系统变量', entries: previewData?.systemEntries }].map(section => (section.entries?.length || 0) > 0 && (
                <div key={section.title} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">{section.title}</h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{section.entries.length} 项</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-600 border-b border-slate-200 dark:border-slate-600">
                        <tr><th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Key</th><th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Value</th></tr>
                      </thead>
                      <tbody>{section.entries.map(item => (
                        <tr key={item.key} className="border-b border-slate-100 dark:border-slate-600 last:border-b-0">
                          <td className="px-3 py-2 align-top font-mono text-xs text-slate-900 dark:text-slate-100 break-all">{item.key}</td>
                          <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 dark:text-slate-300 break-all">{item.value || '-'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setPreviewBackupId('')} className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Scope Modal */}
      {showBackupScopeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">选择备份范围</h3>
              <button onClick={() => setShowBackupScopeModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {BACKUP_SCOPE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setBackupScopeSelection(opt.value)}
                  className={cn('w-full text-left rounded-lg border p-3 transition-colors', backupScopeSelection === opt.value ? 'bg-slate-50 dark:bg-slate-700 border-slate-900 dark:border-slate-100' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500')}>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{opt.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{opt.description}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowBackupScopeModal(false)} className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={handleConfirmCreateBackup} className="h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">立即备份</button>
            </div>
          </div>
        </div>
      )}

      {/* Backup-to-Backup Select Modal */}
      {showBackupDiffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">选择两个备份进行对比</h3>
              <button onClick={() => setShowBackupDiffModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">备份 A</label>
                <select value={diffBackupA} onChange={e => setDiffBackupA(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500">
                  {(backups || []).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({BACKUP_SCOPE_LABELS[b.scope] || '全部'})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-center"><ArrowLeftRight className="w-5 h-5 text-slate-400 dark:text-slate-500" /></div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">备份 B</label>
                <select value={diffBackupB} onChange={e => setDiffBackupB(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500">
                  {(backups || []).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({BACKUP_SCOPE_LABELS[b.scope] || '全部'})</option>
                  ))}
                </select>
              </div>
              {diffBackupA && diffBackupB && diffBackupA === diffBackupB && (
                <p className="text-xs text-amber-600 dark:text-amber-400">请选择两个不同的备份</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowBackupDiffModal(false)} className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={handleBackupDiffCompare} disabled={!diffBackupA || !diffBackupB || diffBackupA === diffBackupB}
                className={cn('h-10 px-4 text-sm font-medium rounded-lg', (!diffBackupA || !diffBackupB || diffBackupA === diffBackupB) ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200')}>
                开始对比
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[86vh] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">差异对比</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{diffData.titleA} vs {diffData.titleB}{diffData.backupScope && diffData.backupScope !== 'all' ? ` (${BACKUP_SCOPE_LABELS[diffData.backupScope]}变量)` : ''}</p></div>
              <button onClick={() => setDiffData(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {['user', 'system'].map(scope => {
                const d = diffData[scope]; if (!d) return null
                const total = d.added.length + d.removed.length + d.modified.length
                if (total === 0) return <div key={scope} className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">{scope === 'user' ? '用户变量' : '系统变量'}无差异</div>
                return (
                  <div key={scope}>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{scope === 'user' ? '用户变量' : '系统变量'} ({total} 项差异)</h4>
                    <div className="space-y-1">
                      {d.added.map(item => (
                        <div key={`add-${item.key}`} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded">新增</span>
                          <span className="font-mono text-xs text-slate-900 dark:text-slate-100 font-medium">{item.key}</span>
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">{item.value}</span>
                        </div>
                      ))}
                      {d.removed.map(item => (
                        <div key={`rm-${item.key}`} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded">删除</span>
                          <span className="font-mono text-xs text-slate-900 dark:text-slate-100 font-medium">{item.key}</span>
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">{item.value}</span>
                        </div>
                      ))}
                      {d.modified.map(item => (
                        <div key={`mod-${item.key}`} className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded">修改</span>
                            <span className="font-mono text-xs text-slate-900 dark:text-slate-100 font-medium">{item.key}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded text-red-700 dark:text-red-300 break-all">- {item.oldValue}</div>
                            <div className="bg-green-50 dark:bg-green-900/10 px-2 py-1 rounded text-green-700 dark:text-green-300 break-all">+ {item.newValue}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setDiffData(null)} className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
