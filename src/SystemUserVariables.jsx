import { useState, useEffect } from 'react'
import { Plus, Search, Copy, Trash2, Edit2, X, AlertCircle, CheckCircle, Loader2, RefreshCw, ArrowUpDown } from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'
import { getFontClass } from './utils/fontLevel'
import { getPlatformName, getPathSeparator, getExamplePath, getValueLengthLimit } from './utils/platform'
import SortablePathList from './components/SortablePathList'

export default function SystemUserVariables({ onOpenTrash, refreshTrigger, fontSettings, notificationSettings }) {
  const { addToTrash } = useTrashHistory('user-vars')
  const [userVariables, setUserVariables] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingVariable, setEditingVariable] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const [pathList, setPathList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState('name')

  const displayKeyFontClass = getFontClass(fontSettings?.displayKeySize, 2)
  const displayValueFontClass = getFontClass(fontSettings?.displayValueSize, 2)
  const modalKeyFontClass = getFontClass(fontSettings?.modalKeySize, 2)
  const modalValueFontClass = getFontClass(fontSettings?.modalValueSize, 2)

  useEffect(() => { loadSystemUserVariables() }, [])
  useEffect(() => { if (refreshTrigger > 0) loadSystemUserVariables() }, [refreshTrigger])

  const loadSystemUserVariables = async () => {
    setIsLoading(true)
    try {
      const prefix = 'system-user-var-'
      let dbVars = []
      if (window.utools?.db) {
        const allDocs = utools.db.allDocs(prefix)
        dbVars = allDocs.map(doc => ({ ...doc.data, _id: doc._id, _rev: doc._rev }))
      }

      if (window.services?.getAllEnvironmentVariables) {
        const systemVars = await window.services.getAllEnvironmentVariables(false)
        const managedVarMap = new Map()
        dbVars.forEach(item => { if (item?.name) managedVarMap.set(item.name, item) })

        const mergedVars = Object.entries(systemVars).map(([name, value]) => {
          const managed = managedVarMap.get(name)
          return { name, value, exists: true, isSystemOriginal: !managed, _id: managed?._id, _rev: managed?._rev, createdAt: managed?.createdAt, updatedAt: managed?.updatedAt }
        })

        const systemVarNames = new Set(Object.keys(systemVars))
        if (window.utools?.db) {
          for (const dbVar of dbVars) {
            if (!dbVar?.name || systemVarNames.has(dbVar.name)) continue
            try { utools.db.remove(`${prefix}${dbVar.name}`) } catch {}
          }
        }

        setUserVariables(mergedVars)
      } else {
        const sep = getPathSeparator()
        setUserVariables([
          { name: 'PATH', value: sep === ';' ? 'C:\\Windows\\System32;C:\\Program Files' : '/usr/local/bin:/usr/bin', exists: true, isSystemOriginal: true },
          { name: 'TEMP', value: sep === ';' ? 'C:\\Users\\User\\AppData\\Local\\Temp' : '/tmp', exists: true, isSystemOriginal: true },
        ])
      }
    } catch (error) {
      showToast('加载失败: ' + error.message, 'error')
    } finally { setIsLoading(false) }
  }

  const saveVariable = async (name, value, isNew = false, originalVariable = null) => {
    const limit = getValueLengthLimit()
    if (limit && value.length > limit) {
      showToast(`注意: 值长度 ${value.length} 超过 ${limit} 字符限制，将使用注册表直接写入`, 'info')
    }
    try {
      const prefix = 'system-user-var-'
      if (!isNew && originalVariable) {
        addToTrash({ action: 'edit', itemType: 'variable', name, data: { name, value }, originalData: { name: originalVariable.name, value: originalVariable.value } })
      } else if (isNew) {
        addToTrash({ action: 'create', itemType: 'variable', name, data: { name, value } })
      }

      if (window.services?.setEnvironmentVariable) {
        await window.services.setEnvironmentVariable(name, value, false)
        await window.services.refreshEnvironment()
      }
      if (window.utools?.db) {
        const existing = isNew ? null : utools.db.get(`${prefix}${name}`)
        utools.db.put({ _id: `${prefix}${name}`, _rev: existing?._rev, data: { name, value, isSystemOriginal: !isNew, createdAt: existing?.data?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } })
      }
      await loadSystemUserVariables()
      showToast(isNew ? '变量已创建' : '变量已更新', 'success')
    } catch (error) { showToast('保存失败: ' + error.message, 'error') }
  }

  const deleteVariable = async (variable) => {
    try {
      addToTrash({ action: 'delete', itemType: 'variable', name: variable.name, data: { name: variable.name, value: variable.value } })
      if (window.services?.removeEnvironmentVariable) {
        await window.services.removeEnvironmentVariable(variable.name, false)
        await window.services.refreshEnvironment()
      }
      if (window.utools?.db && variable._id) {
        const doc = utools.db.get(variable._id)
        if (doc) utools.db.remove(doc)
      }
      await loadSystemUserVariables()
      showToast('变量已删除', 'success')
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
    try {
      if (window.utools?.copyText) window.utools.copyText(text)
      else await navigator.clipboard.writeText(text)
      showToast('已复制', 'success')
    } catch { showToast('复制失败', 'error') }
  }

  const isPathVariable = (name) => name.toUpperCase() === 'PATH'
  const splitPathValue = (value) => {
    if (!value || typeof value !== 'string') return []
    return value.split(getPathSeparator()).filter(p => p && p.trim())
  }

  const openEditModal = (variable = null) => {
    if (variable) {
      setEditingVariable({ ...variable, isNew: false })
      setPathList(isPathVariable(variable.name) ? splitPathValue(variable.value) : [])
    } else {
      setEditingVariable({ name: '', value: '', isNew: true })
      setPathList([])
    }
    setShowEditModal(true)
  }

  const closeEditModal = () => { setEditingVariable(null); setShowEditModal(false); setPathList([]) }

  const handleSaveEdit = async () => {
    if (!editingVariable.name || (!editingVariable.value && pathList.length === 0)) { showToast('名称和值不能为空', 'error'); return }
    const finalValue = isPathVariable(editingVariable.name) ? pathList.filter(p => p.trim()).join(getPathSeparator()) : editingVariable.value
    const originalVar = editingVariable.isNew ? null : userVariables.find(v => v.name === editingVariable.name)
    await saveVariable(editingVariable.name, finalValue, editingVariable.isNew, originalVar)
    closeEditModal()
  }

  const openDeleteModal = (variable) => { setVariableToDelete(variable); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setVariableToDelete(null); setShowDeleteModal(false) }
  const handleConfirmDelete = async () => { if (variableToDelete) { await deleteVariable(variableToDelete); closeDeleteModal() } }

  const formatDate = (dateStr) => {
    if (!dateStr) return '原有'
    return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const filteredVars = userVariables.filter(v => {
    if (!v?.name || v.value == null) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    return v.name.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)
  })

  const sortedVars = [...filteredVars].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN')
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bTime - aTime
  })

  return (
    <div className="p-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">用户环境变量</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">管理 {getPlatformName()} 用户级环境变量 · {sortedVars.length} 个</p>
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

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setSortMode(sortMode === 'name' ? 'time' : 'name')}
          className="flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <ArrowUpDown className="w-4 h-4" /> {sortMode === 'name' ? '按名称' : '按时间'}
        </button>
        <button onClick={loadSystemUserVariables} disabled={isLoading}
          className={cn("flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors", isLoading && "opacity-60 cursor-not-allowed")}>
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} /> 刷新
        </button>
        <button onClick={() => openEditModal()}
          className="flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
          <Plus className="w-4 h-4" /> 新建变量
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">加载中...</p>
        </div>
      )}

      {!isLoading && sortedVars.length > 0 && (
        <div className="space-y-3">
          {sortedVars.map(variable => (
            <div key={variable.name} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={cn("font-mono font-medium text-slate-900 dark:text-slate-100", displayKeyFontClass)}>{variable.name}</h3>
                    {isPathVariable(variable.name) && <span className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded">PATH</span>}
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(variable.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyToClipboard(variable.value)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="复制"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => openEditModal(variable)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="编辑"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => openDeleteModal(variable)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="删除"><Trash2 className="w-4 h-4" /></button>
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

      {!isLoading && sortedVars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <p className="text-slate-600 dark:text-slate-400 mb-4">{searchQuery.trim() ? '未找到匹配的变量' : '暂无环境变量'}</p>
          {!searchQuery.trim() && (
            <button onClick={() => openEditModal()} className="flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">
              <Plus className="w-4 h-4" /> 创建变量
            </button>
          )}
        </div>
      )}

      {showEditModal && editingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{editingVariable.isNew ? '新建变量' : '编辑变量'}</h2>
              <button onClick={closeEditModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">变量名</label>
                <input type="text" value={editingVariable.name} onChange={(e) => setEditingVariable({ ...editingVariable, name: e.target.value })} disabled={!editingVariable.isNew} placeholder="例如: MY_VAR"
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
              <p className="text-sm text-slate-700 dark:text-slate-300">确定要删除变量 <span className="font-semibold font-mono">{variableToDelete.name}</span> 吗？</p>
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
