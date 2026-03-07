import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Trash2, RotateCcw, X, Clock, AlertCircle, CheckCircle, Undo2 } from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'
import { getFontClass } from './utils/fontLevel'

const ACTION_CONFIG = {
  create: { label: '创建', cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800', restoreLabel: '撤销' },
  delete: { label: '删除', cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800', restoreLabel: '还原' },
  edit: { label: '编辑', cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800', restoreLabel: '还原' },
  activate: { label: '激活', cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800', restoreLabel: '撤销' },
  deactivate: { label: '停用', cls: 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600', restoreLabel: '撤销' },
}

export default function TrashHistoryPage({ tabType, onBack, onRestore, appSettings, notificationSettings, cleanupTick }) {
  const { records, loadRecords, deleteFromTrash, clearAllTrash, clearOldRecords } = useTrashHistory(tabType)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState(null)
  const [showClearAllModal, setShowClearAllModal] = useState(false)
  const [toast, setToast] = useState(null)
  const displayKeyFontClass = getFontClass(appSettings?.font?.displayKeySize, 2)
  const displayValueFontClass = getFontClass(appSettings?.font?.displayValueSize, 2)
  const tabLabels = { groups: '自定义用户变量', 'user-vars': '用户变量', 'system-vars': '系统变量' }

  const createTargetExists = useMemo(() => {
    const existsMap = {}
    for (const record of records) {
      if (record.action !== 'create') continue
      try {
        if (!window.utools?.db) { existsMap[record.id] = false; continue }
        if (record.tabType === 'groups') {
          const groupId = record.data?.id
          existsMap[record.id] = groupId ? !!utools.db.get(`user-group-${groupId}`) : false
        } else if (record.tabType === 'user-vars') {
          existsMap[record.id] = !!utools.db.get(`system-user-var-${record.name}`)
        } else if (record.tabType === 'system-vars') {
          existsMap[record.id] = !!utools.db.get(`system-var-${record.name}`)
        } else {
          existsMap[record.id] = false
        }
      } catch { existsMap[record.id] = false }
    }
    return existsMap
  }, [records])

  useEffect(() => {
    loadRecords()
    const deleted = clearOldRecords({ enabled: appSettings?.history?.autoCleanupEnabled, days: appSettings?.history?.autoCleanupDays })
    if (deleted > 0) showToast(`已自动清理 ${deleted} 条过期记录`, 'info')
  }, [loadRecords, clearOldRecords, appSettings?.history?.autoCleanupEnabled, appSettings?.history?.autoCleanupDays])

  useEffect(() => { if (cleanupTick > 0) loadRecords() }, [cleanupTick, loadRecords])

  const showToast = (message, type = 'success') => {
    const desktopEnabled = notificationSettings?.desktopEnabled === true
    const inAppEnabled = notificationSettings?.inAppEnabled !== false
    if (desktopEnabled && window.utools?.showNotification) window.utools.showNotification(message)
    if (!inAppEnabled) { setToast(null); return }
    setToast({ message, type }); setTimeout(() => setToast(null), 3000)
  }

  const handleRestore = async (record) => {
    try {
      if (onRestore) { const success = await onRestore(record); if (success) { deleteFromTrash(record.id); showToast('操作成功', 'success') } }
    } catch (error) { showToast('操作失败: ' + error.message, 'error') }
  }

  const openDeleteModal = (record) => { setRecordToDelete(record); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setRecordToDelete(null); setShowDeleteModal(false) }
  const confirmDelete = () => { if (recordToDelete) { deleteFromTrash(recordToDelete.id); showToast('记录已永久删除', 'success'); closeDeleteModal() } }
  const openClearAllModal = () => { if (records.length === 0) return; setShowClearAllModal(true) }
  const closeClearAllModal = () => setShowClearAllModal(false)
  const confirmClearAll = () => { clearAllTrash() ? showToast('已清空全部历史记录', 'success') : showToast('清空历史记录失败', 'error'); closeClearAllModal() }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp); const now = new Date()
    const diffMs = now - date; const diffMins = Math.floor(diffMs / 60000); const diffHours = Math.floor(diffMs / 3600000); const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const isPathVariable = (name = '') => String(name).toUpperCase() === 'PATH'
  const splitPathValue = (value) => { if (!value || typeof value !== 'string') return []; const sep = value.includes(';') ? ';' : ':'; return value.split(sep).filter(item => item && item.trim()) }

  const normalizeToVariableEntries = (data) => {
    if (!data) return []
    if (Array.isArray(data?.variables)) return data.variables.map(item => ({ name: item?.name || '', value: item?.value ?? '' }))
    if (typeof data === 'object' && data !== null) {
      if ('name' in data && 'value' in data) return [{ name: data.name || '', value: data.value ?? '' }]
      if ('value' in data) return [{ name: 'VALUE', value: data.value ?? '' }]
    }
    return []
  }

  const renderDataPreview = (data, keyPrefix) => {
    const entries = normalizeToVariableEntries(data)
    if (entries.length > 0) {
      return (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <div key={`${keyPrefix}-${idx}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-2.5">
              <div className="grid grid-cols-[200px_1fr] gap-3 items-start">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Key</p>
                  <div className={cn('font-mono font-medium text-slate-900 dark:text-slate-100 break-all', displayKeyFontClass)}>{entry.name || '(empty)'}</div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Value</p>
                  {isPathVariable(entry.name) ? (
                    <div className="space-y-1">
                      {splitPathValue(String(entry.value ?? '')).map((pathItem, pathIdx) => (
                        <div key={`${keyPrefix}-${idx}-path-${pathIdx}`} className={cn('font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 break-all', displayValueFontClass)}>{pathItem}</div>
                      ))}
                    </div>
                  ) : (
                    <div className={cn('font-mono text-slate-700 dark:text-slate-300 break-all', displayValueFontClass)}>{String(entry.value ?? '') || '(empty)'}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }
    return <div className={cn('font-mono text-slate-700 dark:text-slate-300 break-all', displayValueFontClass)}>{typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</div>
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-900">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="px-6"><div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">操作历史</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tabLabels[tabType]} · {records.length} 条记录</p>
            </div>
          </div>
          <button onClick={openClearAllModal} disabled={records.length === 0}
            className={cn("h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors border",
              records.length === 0 ? "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 cursor-not-allowed" : "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30")}>
            <Trash2 className="w-4 h-4" /> 全部清除
          </button>
        </div></div>
      </div>

      <div className="p-6">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4"><Clock className="w-6 h-6 text-slate-400" /></div>
            <p className="text-slate-600 dark:text-slate-400 mb-2">暂无操作记录</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">创建、编辑或删除的内容会显示在这里</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(record => {
              const cfg = ACTION_CONFIG[record.action] || ACTION_CONFIG.edit
              const showRestoreBtn = record.action !== 'create' || createTargetExists[record.id]
              return (
                <div key={record.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('px-2 py-0.5 text-xs font-medium rounded border', cfg.cls)}>{cfg.label}</span>
                      <span className={cn('font-mono font-medium text-slate-900 dark:text-slate-100', displayKeyFontClass)}>{record.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(record.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {showRestoreBtn && (
                        <button onClick={() => handleRestore(record)}
                          className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                          {record.action === 'create' ? <Undo2 className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          {cfg.restoreLabel}
                        </button>
                      )}
                      <button onClick={() => openDeleteModal(record)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="永久删除"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                    {record.action === 'edit' && record.originalData ? (
                      <div className="space-y-2">
                        <div><span className="text-xs text-slate-500 dark:text-slate-400">原值:</span><div className="mt-1">{renderDataPreview(record.originalData, `${record.id}-old`)}</div></div>
                        <div><span className="text-xs text-slate-500 dark:text-slate-400">新值:</span><div className="mt-1">{renderDataPreview(record.data, `${record.id}-new`)}</div></div>
                      </div>
                    ) : record.action === 'activate' || record.action === 'deactivate' ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">环境变量组已{record.action === 'activate' ? '激活' : '停用'}</p>
                    ) : (
                      renderDataPreview(record.data, `${record.id}-data`)
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showDeleteModal && recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">永久删除</h2>
              </div>
              <button onClick={closeDeleteModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6"><p className="text-sm text-slate-700 dark:text-slate-300">确定要永久删除这条记录吗？此操作无法撤销。</p></div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeDeleteModal} className="h-10 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={confirmDelete} className="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">永久删除</button>
            </div>
          </div>
        </div>
      )}

      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">清空全部记录</h2>
              </div>
              <button onClick={closeClearAllModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6"><p className="text-sm text-slate-700 dark:text-slate-300">确定要清空当前分类的全部历史记录吗？此操作无法撤销。</p></div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeClearAllModal} className="h-10 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={confirmClearAll} className="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">全部清除</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={cn("flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg",
            toast.type === 'success' && "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100",
            toast.type === 'error' && "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200",
            toast.type === 'info' && "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
          )}>
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            {toast.type === 'info' && <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
