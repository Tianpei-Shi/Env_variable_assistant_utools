import { useState, useEffect } from 'react'
import { Plus, Search, Copy, Trash2, Edit2, X, AlertCircle, CheckCircle, Loader2, RefreshCw, ShieldAlert, ArrowUpDown } from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'
import { getFontClass } from './utils/fontLevel'
import { getPlatformName, getPathSeparator, getExamplePath, getAdminHint, getValueLengthLimit } from './utils/platform'
import SortablePathList from './components/SortablePathList'

export default function SystemVariables({ onOpenTrash, refreshTrigger, fontSettings, notificationSettings }) {
  const { addToTrash } = useTrashHistory('system-vars')
  const [systemVariables, setSystemVariables] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingVariable, setEditingVariable] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const [pathList, setPathList] = useState([])
  const [isCheckingPermission, setIsCheckingPermission] = useState(true)
  const [canModifySystem, setCanModifySystem] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState('name')

  const displayKeyFontClass = getFontClass(fontSettings?.displayKeySize, 2)
  const displayValueFontClass = getFontClass(fontSettings?.displayValueSize, 2)
  const modalKeyFontClass = getFontClass(fontSettings?.modalKeySize, 2)
  const modalValueFontClass = getFontClass(fontSettings?.modalValueSize, 2)

  useEffect(() => { initializePage() }, [])
  useEffect(() => { if (refreshTrigger > 0) initializePage() }, [refreshTrigger])

  const initializePage = async () => { await checkSystemPermission(); await loadSystemVariables() }

  const checkSystemPermission = async () => {
    setIsCheckingPermission(true)
    try {
      if (window.services?.canModifySystemEnvironment) {
        setCanModifySystem(!!(await window.services.canModifySystemEnvironment()))
      } else { setCanModifySystem(!window.utools) }
    } catch { setCanModifySystem(false) } finally { setIsCheckingPermission(false) }
  }

  const loadSystemVariables = async () => {
    setIsLoading(true)
    try {
      if (window.services?.getAllEnvironmentVariables) {
        const vars = await window.services.getAllEnvironmentVariables(true)
        setSystemVariables(Object.entries(vars).map(([name, value]) => ({ name, value: value || '' })))
      } else {
        const sep = getPathSeparator()
        setSystemVariables(sep === ';'
          ? [{ name: 'PATH', value: 'C:\\Windows\\System32;C:\\Program Files' }, { name: 'ComSpec', value: 'C:\\Windows\\System32\\cmd.exe' }, { name: 'OS', value: 'Windows_NT' }]
          : [{ name: 'PATH', value: '/usr/local/bin:/usr/bin:/bin' }, { name: 'SHELL', value: '/bin/bash' }, { name: 'HOME', value: '/home/user' }])
      }
    } catch (error) { showToast('加载失败: ' + error.message, 'error') } finally { setIsLoading(false) }
  }

  const saveVariable = async (name, value, isNew = false, originalVariable = null) => {
    if (!canModifySystem) { showToast(`当前没有系统环境变量写入权限，${getAdminHint()}`, 'error'); return }
    const limit = getValueLengthLimit()
    if (limit && value.length > limit) { showToast(`注意: 值长度 ${value.length} 超过 ${limit} 字符限制，将使用注册表直接写入`, 'info') }
    try {
      if (!isNew && originalVariable) {
        addToTrash({ action: 'edit', itemType: 'variable', name, data: { name, value }, originalData: { name: originalVariable.name, value: originalVariable.value } })
      } else if (isNew) {
        addToTrash({ action: 'create', itemType: 'variable', name, data: { name, value } })
      }
      if (window.services?.setEnvironmentVariable) { await window.services.setEnvironmentVariable(name, value, true); await window.services.refreshEnvironment() }
      if (window.utools?.db) {
        const prefix = 'system-var-'
        const existing = isNew ? null : utools.db.get(`${prefix}${name}`)
        utools.db.put({ _id: `${prefix}${name}`, _rev: existing?._rev, data: { name, value, createdAt: existing?.data?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } })
      }
      await loadSystemVariables()
      showToast(isNew ? '系统变量已创建' : '系统变量已更新', 'success')
    } catch (error) { showToast('保存失败: ' + error.message, 'error') }
  }

  const deleteVariable = async (variable) => {
    if (!canModifySystem) { showToast(`当前没有系统环境变量写入权限，${getAdminHint()}`, 'error'); return }
    try {
      addToTrash({ action: 'delete', itemType: 'variable', name: variable.name, data: { name: variable.name, value: variable.value } })
      if (window.services?.removeEnvironmentVariable) { await window.services.removeEnvironmentVariable(variable.name, true); await window.services.refreshEnvironment() }
      if (window.utools?.db) {
        const doc = utools.db.get(`system-var-${variable.name}`)
        if (doc) utools.db.remove(doc)
      }
      await loadSystemVariables()
      showToast('系统变量已删除', 'success')
    } catch (error) { showToast('删除失败: ' + error.message, 'error') }
  }

  const showToast = (message, type = 'success') => {
    const desktopEnabled = notificationSettings?.desktopEnabled === true
    const inAppEnabled = notificationSettings?.inAppEnabled !== false
    if (desktopEnabled && window.utools?.showNotification) window.utools.showNotification(message)
    if (!inAppEnabled) { setToast({ show: false, message: '', type: 'success' }); return }
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const copyToClipboard = async (text) => {
    try { if (window.utools?.copyText) window.utools.copyText(text); else await navigator.clipboard.writeText(text); showToast('已复制', 'success') } catch { showToast('复制失败', 'error') }
  }

  const isPathVariable = (name) => name.toUpperCase() === 'PATH'
  const splitPathValue = (value) => { if (!value || typeof value !== 'string') return []; return value.split(getPathSeparator()).filter(p => p && p.trim()) }

  const openEditModal = (variable = null) => {
    if (variable) { setEditingVariable({ ...variable, isNew: false }); setPathList(isPathVariable(variable.name) ? splitPathValue(variable.value) : []) }
    else { setEditingVariable({ name: '', value: '', isNew: true }); setPathList([]) }
    setShowEditModal(true)
  }
  const closeEditModal = () => { setEditingVariable(null); setShowEditModal(false); setPathList([]) }

  const handleSaveEdit = async () => {
    if (!editingVariable.name || (!editingVariable.value && pathList.length === 0)) { showToast('名称和值不能为空', 'error'); return }
    const finalValue = isPathVariable(editingVariable.name) ? pathList.filter(p => p.trim()).join(getPathSeparator()) : editingVariable.value
    const originalVar = editingVariable.isNew ? null : systemVariables.find(v => v.name === editingVariable.name)
    await saveVariable(editingVariable.name, finalValue, editingVariable.isNew, originalVar)
    closeEditModal()
  }

  const openDeleteModal = (variable) => { setVariableToDelete(variable); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setVariableToDelete(null); setShowDeleteModal(false) }
  const handleConfirmDelete = async () => { if (variableToDelete) { await deleteVariable(variableToDelete); closeDeleteModal() } }

  const filteredVars = systemVariables.filter(v => {
    if (!v?.name || v.value == null) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    return v.name.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)
  })

  const sortedVars = [...filteredVars].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const isReadonly = !canModifySystem || isCheckingPermission

  return (
    <div className="p-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">系统环境变量</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">管理 {getPlatformName()} 系统级环境变量 · {sortedVars.length} 个 · {isReadonly ? '只读' : '可编辑'}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="搜索变量..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "h-10 pl-9 pr-3 text-sm rounded-lg w-72",
              "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
              "text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
              "focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500"
            )}
          />
        </div>
      </div>

      {!isCheckingPermission && !canModifySystem && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium mb-1">当前为只读模式</p>
            <p className="text-amber-800 dark:text-amber-300">未检测到管理员权限。{getAdminHint()}后，再进行系统变量的增删改。</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setSortMode(sortMode === 'name' ? 'time' : 'name')}
          className="flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <ArrowUpDown className="w-4 h-4" /> {sortMode === 'name' ? '按名称' : '按时间'}
        </button>
        <button onClick={initializePage} disabled={isLoading || isCheckingPermission}
          className={cn("flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors", (isLoading || isCheckingPermission) && "opacity-60 cursor-not-allowed")}>
          <RefreshCw className={cn("w-4 h-4", (isLoading || isCheckingPermission) && "animate-spin")} /> 刷新
        </button>
        <button onClick={() => openEditModal()} disabled={isReadonly}
          className={cn("flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors", isReadonly && "opacity-50 cursor-not-allowed")}>
          <Plus className="w-4 h-4" /> 新建变量
        </button>
      </div>

      {(isLoading || isCheckingPermission) && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{isCheckingPermission ? '检查权限中...' : '加载中...'}</p>
        </div>
      )}

      {!isLoading && !isCheckingPermission && sortedVars.length > 0 && (
        <div className="space-y-3">
          {sortedVars.map(variable => (
            <div key={variable.name} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={cn("font-mono font-medium text-slate-900 dark:text-slate-100", displayKeyFontClass)}>{variable.name}</h3>
                    {isPathVariable(variable.name) && <span className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded">PATH</span>}
                    <span className="text-xs text-slate-400 dark:text-slate-500">原有</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyToClipboard(variable.value)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="复制值"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => openEditModal(variable)} disabled={isReadonly} className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors", isReadonly && "opacity-50 cursor-not-allowed")} title="编辑"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => openDeleteModal(variable)} disabled={isReadonly} className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors", isReadonly && "opacity-50 cursor-not-allowed")} title="删除"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                {isPathVariable(variable.name) ? (
                  <div className="space-y-1">
                    {splitPathValue(variable.value).map((path, idx) => (
                      <div key={idx} className={cn("font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-200 dark:border-slate-600", displayValueFontClass)}>{path}</div>
                    ))}
                  </div>
                ) : (
                  <div className={cn("font-mono text-slate-700 dark:text-slate-300 break-all", displayValueFontClass)}>{variable.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isCheckingPermission && sortedVars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <p className="text-slate-600 dark:text-slate-400 mb-4">{searchQuery.trim() ? '未找到匹配的变量' : '暂无系统变量'}</p>
        </div>
      )}

      {showEditModal && editingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{editingVariable.isNew ? '新建系统变量' : '编辑系统变量'}</h2>
              <button onClick={closeEditModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">变量名</label>
                <input type="text" value={editingVariable.name} onChange={(e) => setEditingVariable({ ...editingVariable, name: e.target.value })} disabled={!editingVariable.isNew} placeholder="例如: MY_SYSTEM_VAR"
                  className={cn("w-full h-10 px-3 font-mono", modalKeyFontClass, "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500", !editingVariable.isNew && "bg-slate-50 dark:bg-slate-600 cursor-not-allowed")} />
              </div>
              {isPathVariable(editingVariable.name) ? (
                <SortablePathList pathList={pathList} onReorder={setPathList} onAdd={() => setPathList([...pathList, ''])} onRemove={(i) => setPathList(pathList.filter((_, idx) => idx !== i))} onUpdate={(i, v) => { const n = [...pathList]; n[i] = v; setPathList(n) }} placeholder={`例如: ${getExamplePath()}`} fontClass={modalValueFontClass} />
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">变量值</label>
                  <textarea value={editingVariable.value} onChange={(e) => setEditingVariable({ ...editingVariable, value: e.target.value })} placeholder={`例如: ${getExamplePath()}`} rows={4}
                    className={cn("w-full px-3 py-2 font-mono", modalValueFontClass, "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500 resize-none")} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeEditModal} className="h-10 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={handleSaveEdit} className="h-10 px-4 text-sm font-medium text-white dark:text-slate-900 bg-slate-900 dark:bg-slate-100 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200">{editingVariable.isNew ? '创建' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && variableToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">确认删除</h2>
              </div>
              <button onClick={closeDeleteModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">确定要删除系统变量 <span className="font-semibold font-mono">{variableToDelete.name}</span> 吗？</p>
              <div className="p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">当前值:</p>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all line-clamp-3">{variableToDelete.value}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeDeleteModal} className="h-10 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={handleConfirmDelete} className="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={cn("flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg",
            toast.type === 'success' && "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100",
            toast.type === 'error' && "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200",
            toast.type === 'info' && "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
          )}>
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
