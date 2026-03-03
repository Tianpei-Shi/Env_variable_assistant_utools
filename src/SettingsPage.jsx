import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Type, Bell, Database, History, Minus, Plus,
  ArchiveRestore, Download, Upload, Archive, Trash2, Eye, X
} from 'lucide-react'
import { cn } from './utils/cn'
import { clampFontLevel, FONT_LEVEL_LABELS } from './utils/fontLevel'

const HISTORY_OPTIONS = [
  { value: 3, label: '3 天' },
  { value: 7, label: '1 周' },
  { value: 30, label: '1 个月' },
  { value: 90, label: '3 个月' },
  { value: 180, label: '6 个月' },
  { value: 365, label: '1 年' },
]

const FONT_CONTROLS = [
  { key: 'displayKeySize', title: '展示页 Key 字体', description: '变量名、Key 的显示字号' },
  { key: 'displayValueSize', title: '展示页 Value 字体', description: '变量值、路径值的显示字号' },
  { key: 'modalKeySize', title: '弹窗 Key 字体', description: '编辑/新建弹窗中的 Key 输入字号' },
  { key: 'modalValueSize', title: '弹窗 Value 字体', description: '编辑/新建弹窗中的 Value 输入字号' },
]

const BACKUP_SCOPE_OPTIONS = [
  { value: 'user', label: '用户变量', description: '备份自定义用户变量、用户变量及相关历史记录。' },
  { value: 'system', label: '系统变量', description: '仅备份系统环境变量。' },
  { value: 'all', label: '全部备份', description: '同时备份用户变量、系统变量与设置。' },
]

const BACKUP_SCOPE_LABELS = {
  user: '用户',
  system: '系统',
  all: '全部',
}

function toTextValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function mapFromSnapshot(snapshot) {
  const map = new Map()
  if (!snapshot) return map

  if (Array.isArray(snapshot)) {
    snapshot.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const key = item.name || item.key
      if (!key) return
      map.set(String(key), toTextValue(item.value))
    })
    return map
  }

  if (typeof snapshot === 'object') {
    Object.entries(snapshot).forEach(([key, value]) => {
      if (!key) return
      map.set(String(key), toTextValue(value))
    })
  }
  return map
}

function mapFromDocs(docs, target) {
  const map = new Map()
  ;(docs || []).forEach((doc) => {
    if (!doc?._id || !doc?.data) return

    if (target === 'user') {
      if (doc._id.startsWith('system-user-var-') && doc.data?.name) {
        map.set(String(doc.data.name), toTextValue(doc.data.value))
      }
      if (doc._id.startsWith('user-group-') && Array.isArray(doc.data.variables)) {
        doc.data.variables.forEach((variable) => {
          if (!variable?.name) return
          map.set(String(variable.name), toTextValue(variable.value))
        })
      }
      return
    }

    if ((doc._id.startsWith('system-var-') || doc.data?.isSystem) && doc.data?.name) {
      map.set(String(doc.data.name), toTextValue(doc.data.value))
    }
  })
  return map
}

function sortEntries(map) {
  return Array.from(map.entries())
    .filter(([key]) => Boolean(key))
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([key, value]) => ({ key, value }))
}

function getBackupPreviewData(backup) {
  const userFromSnapshot = mapFromSnapshot(backup?.envSnapshots?.user)
  const systemFromSnapshot = mapFromSnapshot(backup?.envSnapshots?.system)
  const userFallback = mapFromDocs(backup?.docs, 'user')
  const systemFallback = mapFromDocs(backup?.docs, 'system')

  return {
    userEntries: sortEntries(userFromSnapshot.size > 0 ? userFromSnapshot : userFallback),
    systemEntries: sortEntries(systemFromSnapshot.size > 0 ? systemFromSnapshot : systemFallback),
  }
}

function ToggleSwitch({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={ariaLabel}
      aria-pressed={checked}
      className={cn(
        'relative w-12 h-7 rounded-full transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300',
        checked ? 'bg-slate-900' : 'bg-slate-300'
      )}
    >
      <span
        className={cn(
          'absolute left-1 top-1 w-5 h-5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

export default function SettingsPage({
  onBack,
  appSettings,
  onUpdateAppSettings,
  backups,
  onLoadBackups,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onImportBackup,
  onDataChanged,
}) {
  const [selectedBackupId, setSelectedBackupId] = useState('')
  const [activeSection, setActiveSection] = useState('font')
  const [toast, setToast] = useState(null)
  const [showBackupScopeModal, setShowBackupScopeModal] = useState(false)
  const [backupScopeSelection, setBackupScopeSelection] = useState('all')
  const [pendingArchiveBackupId, setPendingArchiveBackupId] = useState(null)
  const [previewBackupId, setPreviewBackupId] = useState('')

  const fileInputRef = useRef(null)
  const contentScrollRef = useRef(null)
  const sectionRefs = useRef({
    font: null,
    notification: null,
    backup: null,
    history: null,
  })

  useEffect(() => {
    onLoadBackups?.()
  }, [onLoadBackups])

  useEffect(() => {
    if (!selectedBackupId && backups?.length > 0) {
      setSelectedBackupId(backups[0].id)
    }
  }, [backups, selectedBackupId])

  const showToast = (message, type = 'success') => {
    const desktopEnabled = appSettings?.notifications?.desktopEnabled === true
    const inAppEnabled = appSettings?.notifications?.inAppEnabled !== false

    if (desktopEnabled && window.utools && window.utools.showNotification) {
      window.utools.showNotification(message)
    }

    if (!inAppEnabled) {
      setToast(null)
      return
    }

    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateFontLevel = (key, nextLevel) => {
    const safeLevel = clampFontLevel(nextLevel)
    onUpdateAppSettings?.({
      font: {
        [key]: safeLevel,
      },
    })
  }

  const updateHistorySetting = (partial) => {
    onUpdateAppSettings?.({
      history: partial,
    })
  }

  const updateNotificationSetting = (partial) => {
    onUpdateAppSettings?.({
      notifications: partial,
    })
  }

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId)
    const container = contentScrollRef.current
    const target = sectionRefs.current[sectionId]
    if (!container || !target) return

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 8
    container.scrollTo({
      top: nextTop,
      behavior: 'smooth',
    })
  }

  const handleCreateBackup = () => {
    setShowBackupScopeModal(true)
  }

  const handleConfirmCreateBackup = async () => {
    const created = await onCreateBackup?.({
      scope: backupScopeSelection,
    })
    if (created) {
      setSelectedBackupId(created.id)
      onLoadBackups?.()
      showToast('已创建当前配置备份', 'success')
      setShowBackupScopeModal(false)
    } else {
      showToast('创建备份失败', 'error')
    }
  }

  const handleRestoreBackup = async () => {
    if (!selectedBackupId) {
      showToast('请先选择一个备份', 'error')
      return
    }
    const success = await onRestoreBackup?.(selectedBackupId)
    if (success) {
      onLoadBackups?.()
      onDataChanged?.()
      showToast('备份还原成功', 'success')
    } else {
      showToast('还原备份失败', 'error')
    }
  }

  const handleExportBackup = () => {
    if (!selectedBackupId) {
      showToast('请先选择一个备份', 'error')
      return
    }

    const selected = (backups || []).find(item => item.id === selectedBackupId)
    if (!selected) {
      showToast('未找到所选备份', 'error')
      return
    }

    const payload = {
      type: 'env-assistant-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      backup: selected,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `env-assistant-backup-${selected.id}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast('备份已导出', 'success')
  }

  const handleImportBackupClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportBackupChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const parsed = JSON.parse(content)
      const imported = onImportBackup?.(parsed)
      if (imported) {
        setSelectedBackupId(imported.id)
        onLoadBackups?.()
        onDataChanged?.()
        showToast('备份导入成功', 'success')
      } else {
        showToast('导入失败：备份格式不正确', 'error')
      }
    } catch (error) {
      showToast('导入失败: ' + error.message, 'error')
    } finally {
      event.target.value = ''
    }
  }

  const handleArchiveAction = async (backupId) => {
    if (pendingArchiveBackupId !== backupId) {
      setPendingArchiveBackupId(backupId)
      showToast('再次点击可删除该备份', 'info')
      return
    }

    const success = await onDeleteBackup?.(backupId)
    if (success) {
      setPendingArchiveBackupId(null)
      const next = (backups || []).filter(item => item.id !== backupId)
      setSelectedBackupId(prev => (prev === backupId ? (next[0]?.id || '') : prev))
      onLoadBackups?.()
      showToast('备份已删除', 'success')
    } else {
      showToast('删除备份失败', 'error')
    }
  }

  const handleOpenBackupPreview = (backupId) => {
    setSelectedBackupId(backupId)
    setPreviewBackupId(backupId)
  }

  const previewBackup = (backups || []).find(item => item.id === previewBackupId) || null
  const previewData = previewBackup ? getBackupPreviewData(previewBackup) : null

  return (
    <div className="h-screen bg-zinc-50 flex flex-col">
      <div className="z-40 bg-white border-b border-slate-200">
        <div className="px-6">
          <div className="flex items-center gap-4 h-16">
            <button
              onClick={onBack}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                'text-slate-600 hover:bg-slate-100 transition-colors'
              )}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">设置中心</h1>
              <p className="text-xs text-slate-500">字体 · 通知 · 备份 · 历史记录</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-6">
        <div className="flex h-full gap-4">
          <aside className="w-56 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2">
              <button
                onClick={() => scrollToSection('font')}
                className={cn(
                  'w-full h-10 px-3 rounded-lg flex items-center gap-2 text-sm',
                  activeSection === 'font' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Type className="w-4 h-4" />
                字体
              </button>
              <button
                onClick={() => scrollToSection('notification')}
                className={cn(
                  'w-full h-10 px-3 rounded-lg flex items-center gap-2 text-sm',
                  activeSection === 'notification' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Bell className="w-4 h-4" />
                通知
              </button>
              <button
                onClick={() => scrollToSection('backup')}
                className={cn(
                  'w-full h-10 px-3 rounded-lg flex items-center gap-2 text-sm',
                  activeSection === 'backup' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Database className="w-4 h-4" />
                备份
              </button>
              <button
                onClick={() => scrollToSection('history')}
                className={cn(
                  'w-full h-10 px-3 rounded-lg flex items-center gap-2 text-sm',
                  activeSection === 'history' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <History className="w-4 h-4" />
                历史记录
              </button>
            </div>
          </aside>

          <section ref={contentScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
            <div
              ref={(el) => { sectionRefs.current.font = el }}
              className="bg-white border border-slate-200 rounded-xl p-5"
            >
              <h3 className="text-base font-semibold text-slate-900 mb-1">字体</h3>
              <p className="text-sm text-slate-500 mb-4">使用 1-4 档整数调节显示与编辑区域的 Key/Value 字体大小。</p>
              <div className="space-y-4">
                {FONT_CONTROLS.map(control => {
                  const level = appSettings?.font?.[control.key] ?? 2
                  return (
                    <div key={control.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{control.title}</p>
                          <p className="text-xs text-slate-500">{control.description}</p>
                        </div>
                        <span className="px-2 py-1 text-xs rounded bg-white border border-slate-200 text-slate-700">
                          {level} 档 · {FONT_LEVEL_LABELS[level]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateFontLevel(control.key, level - 1)}
                          className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                          title="减小"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={1}
                          value={level}
                          onChange={(e) => updateFontLevel(control.key, Number(e.target.value))}
                          className="flex-1 accent-slate-900"
                        />
                        <button
                          onClick={() => updateFontLevel(control.key, level + 1)}
                          className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                          title="增大"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              ref={(el) => { sectionRefs.current.notification = el }}
              className="bg-white border border-slate-200 rounded-xl p-5"
            >
              <h3 className="text-base font-semibold text-slate-900 mb-1">通知</h3>
              <p className="text-sm text-slate-500 mb-4">控制系统桌面通知和窗口内通知的展示方式。</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">系统桌面通知</p>
                    <p className="text-xs text-slate-500">在系统通知中心显示提示，可能需要系统授权。</p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(appSettings?.notifications?.desktopEnabled)}
                    onChange={() => updateNotificationSetting({ desktopEnabled: !appSettings?.notifications?.desktopEnabled })}
                    ariaLabel="切换系统桌面通知"
                  />
                </div>

                <div className="h-px bg-slate-200" />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">窗口内通知</p>
                    <p className="text-xs text-slate-500">在插件界面内显示提示消息（Toast）。</p>
                  </div>
                  <ToggleSwitch
                    checked={appSettings?.notifications?.inAppEnabled !== false}
                    onChange={() => updateNotificationSetting({ inAppEnabled: appSettings?.notifications?.inAppEnabled === false })}
                    ariaLabel="切换窗口内通知"
                  />
                </div>
              </div>
            </div>

            <div
              ref={(el) => { sectionRefs.current.backup = el }}
              className="bg-white border border-slate-200 rounded-xl p-5"
            >
              <h3 className="text-base font-semibold text-slate-900 mb-1">备份</h3>
              <p className="text-sm text-slate-500 mb-4">支持备份当前配置、还原历史备份，以及导出/导入备份文件。</p>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={handleCreateBackup}
                  className="h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  备份当前
                </button>
                <button
                  onClick={handleRestoreBackup}
                  className="h-10 px-4 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <ArchiveRestore className="w-4 h-4" />
                  还原备份
                </button>
                <button
                  onClick={handleExportBackup}
                  className="h-10 px-4 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  导出备份
                </button>
                <button
                  onClick={handleImportBackupClick}
                  className="h-10 px-4 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  导入备份
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportBackupChange}
                  className="hidden"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {(backups || []).length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-6">暂无备份记录</p>
                  )}
                  {(backups || []).map((backup) => (
                    <div key={backup.id} className="flex items-stretch gap-2">
                      <button
                        onClick={() => setSelectedBackupId(backup.id)}
                        className={cn(
                          'flex-1 text-left rounded-lg border p-3 transition-colors',
                          selectedBackupId === backup.id
                            ? 'bg-white border-slate-900'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">{backup.name}</p>
                          <span className="shrink-0 px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600">
                            {BACKUP_SCOPE_LABELS[backup.scope] || '全部'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(backup.createdAt).toLocaleString('zh-CN')} · {backup.managedCount || backup.docs?.length || 0} 项
                        </p>
                      </button>
                      <button
                        onClick={() => handleOpenBackupPreview(backup.id)}
                        className="group relative w-10 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span
                          className={cn(
                            'pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap',
                            'px-2 py-1 text-xs rounded bg-slate-900 text-white',
                            'opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-300'
                          )}
                        >
                          查看
                        </span>
                      </button>
                      <button
                        onClick={() => handleArchiveAction(backup.id)}
                        className={cn(
                          'group relative w-10 rounded-lg border flex items-center justify-center transition-colors',
                          pendingArchiveBackupId === backup.id
                            ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                        )}
                      >
                        {pendingArchiveBackupId === backup.id ? (
                          <Trash2 className="w-4 h-4" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                        <span
                          className={cn(
                            'pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap',
                            'px-2 py-1 text-xs rounded bg-slate-900 text-white',
                            'opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-300'
                          )}
                        >
                          {pendingArchiveBackupId === backup.id ? '删除' : '归档'}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={(el) => { sectionRefs.current.history = el }}
              className="bg-white border border-slate-200 rounded-xl p-5"
            >
              <h3 className="text-base font-semibold text-slate-900 mb-1">历史记录</h3>
              <p className="text-sm text-slate-500 mb-4">控制操作历史的定期清理策略。</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">启用定期自动清理</p>
                    <p className="text-xs text-slate-500">开启后将按设定周期自动删除过期历史记录。</p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(appSettings?.history?.autoCleanupEnabled)}
                    onChange={() => updateHistorySetting({ autoCleanupEnabled: !appSettings?.history?.autoCleanupEnabled })}
                    ariaLabel="切换历史记录自动清理"
                  />
                </div>

                {appSettings?.history?.autoCleanupEnabled && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-2">清理周期</label>
                    <select
                      value={appSettings?.history?.autoCleanupDays || 30}
                      onChange={(e) => updateHistorySetting({ autoCleanupDays: Number(e.target.value) })}
                      className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    >
                      {HISTORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg',
            toast.type === 'success' && 'bg-white border border-slate-200 text-slate-900',
            toast.type === 'error' && 'bg-red-50 border border-red-200 text-red-900',
            toast.type === 'info' && 'bg-white border border-slate-200 text-slate-900'
          )}>
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {previewBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[86vh] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">备份内容查看</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {previewBackup.name} · {new Date(previewBackup.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
              <button
                onClick={() => setPreviewBackupId('')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="px-2 py-1 rounded bg-white border border-slate-200">
                    范围: {BACKUP_SCOPE_LABELS[previewBackup.scope] || '全部'}
                  </span>
                  <span className="px-2 py-1 rounded bg-white border border-slate-200">
                    用户变量: {previewData?.userEntries?.length || 0} 项
                  </span>
                  <span className="px-2 py-1 rounded bg-white border border-slate-200">
                    系统变量: {previewData?.systemEntries?.length || 0} 项
                  </span>
                </div>
              </div>

              {(previewData?.userEntries?.length || 0) === 0 && (previewData?.systemEntries?.length || 0) === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                  当前备份中没有可展示的环境变量条目
                </div>
              )}

              {(previewData?.userEntries?.length || 0) > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-900">用户变量</h4>
                    <span className="text-xs text-slate-500">{previewData.userEntries.length} 项</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Key</th>
                          <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.userEntries.map((item) => (
                          <tr key={`user-${item.key}`} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-900 break-all">{item.key}</td>
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 break-all">{item.value || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(previewData?.systemEntries?.length || 0) > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-900">系统变量</h4>
                    <span className="text-xs text-slate-500">{previewData.systemEntries.length} 项</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Key</th>
                          <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.systemEntries.map((item) => (
                          <tr key={`system-${item.key}`} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-900 break-all">{item.key}</td>
                            <td className="px-3 py-2 align-top font-mono text-xs text-slate-700 break-all">{item.value || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
              <button
                onClick={() => setPreviewBackupId('')}
                className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackupScopeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">选择备份范围</h3>
              <button
                onClick={() => setShowBackupScopeModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {BACKUP_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setBackupScopeSelection(option.value)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-colors',
                    backupScopeSelection === option.value
                      ? 'bg-slate-50 border-slate-900'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  )}
                >
                  <p className="text-sm font-medium text-slate-900">{option.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
              <button
                onClick={() => setShowBackupScopeModal(false)}
                className="h-10 px-4 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCreateBackup}
                className="h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                立即备份
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
