import { useState, useEffect } from 'react'
import {
  Plus, Search, Settings, Eye, EyeOff, Copy, Trash2,
  Edit2, Check, X, Power, PowerOff, RefreshCw,
  ChevronDown, ChevronUp, AlertCircle, Loader2, CheckSquare, Square,
  Download, Upload, ArrowUpDown
} from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'
import { getFontClass } from './utils/fontLevel'
import { isWindows, getExamplePath } from './utils/platform'

export default function EnvVarManager({ onOpenTrash, refreshTrigger, fontSettings, notificationSettings }) {
  const { addToTrash } = useTrashHistory('groups')
  const [envGroups, setEnvGroups] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDetectingStates, setIsDetectingStates] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [hiddenValues, setHiddenValues] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [editingGroup, setEditingGroup] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState(null)
  const [selectedGroups, setSelectedGroups] = useState(new Set())
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupVariables, setGroupVariables] = useState([{ name: '', value: '' }])
  const [toast, setToast] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState('name')
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [conflictData, setConflictData] = useState(null)

  const displayKeyFontClass = getFontClass(fontSettings?.displayKeySize, 2)
  const displayValueFontClass = getFontClass(fontSettings?.displayValueSize, 2)
  const modalKeyFontClass = getFontClass(fontSettings?.modalKeySize, 2)
  const modalValueFontClass = getFontClass(fontSettings?.modalValueSize, 2)

  const showToast = (message, type = 'info') => {
    const desktopEnabled = notificationSettings?.desktopEnabled === true
    const inAppEnabled = notificationSettings?.inAppEnabled !== false
    if (desktopEnabled && window.utools?.showNotification) window.utools.showNotification(message)
    if (!inAppEnabled) { setToast(null); return }
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const copyToClipboard = async (text, label = '内容') => {
    try {
      if (window.utools?.copyText) window.utools.copyText(text)
      else await navigator.clipboard.writeText(text)
      showToast(`${label}已复制`, 'success')
    } catch { showToast('复制失败', 'error') }
  }

  const toggleValueVisibility = (groupId, varIndex) => {
    const key = `${groupId}-${varIndex}`
    setHiddenValues(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const isValueHidden = (groupId, varIndex) => hiddenValues.has(`${groupId}-${varIndex}`)

  const toggleGroupExpansion = (groupId) => {
    setExpandedGroups(prev => {
      const s = new Set(prev)
      s.has(groupId) ? s.delete(groupId) : s.add(groupId)
      return s
    })
  }

  const isServiceAvailable = () => !!(window.services && typeof window.services === 'object')
  const normalizeEnvName = (name = '') => isWindows() ? name.toUpperCase() : name

  const getCurrentUserEnvironmentMap = async () => {
    try {
      if (window.services?.getAllEnvironmentVariables) {
        const envMap = await window.services.getAllEnvironmentVariables(false)
        const normalizedMap = {}
        Object.entries(envMap || {}).forEach(([key, value]) => {
          normalizedMap[normalizeEnvName(key)] = value == null ? '' : String(value)
        })
        return normalizedMap
      }
      return null
    } catch { return null }
  }

  const checkGroupActiveStatus = async (group, currentUserEnvMap = null) => {
    try {
      if (!group.variables || group.variables.length === 0) return false
      for (const variable of group.variables) {
        if (!variable.name) continue
        const expectedValue = variable.value == null ? '' : String(variable.value)
        if (currentUserEnvMap) {
          const actualValue = currentUserEnvMap[normalizeEnvName(variable.name)]
          if (actualValue === undefined || String(actualValue) !== expectedValue) return false
          continue
        }
        if (!window.services?.getEnvironmentVariable) return false
        const runtimeValue = window.services.getEnvironmentVariable(variable.name)
        if (runtimeValue === null || runtimeValue === undefined || String(runtimeValue) !== expectedValue) return false
      }
      return true
    } catch { return false }
  }

  const loadEnvironmentGroups = async () => {
    setIsLoading(true)
    try {
      let groups = []
      const prefix = 'user-group-'
      if (window.utools?.db) {
        const allDocs = utools.db.allDocs(prefix)
        groups = allDocs
          .filter(doc => doc.data && doc.data.name)
          .map(doc => ({ ...doc.data, id: doc._id.replace(prefix, ''), _rev: doc._rev, isSystemVariable: false }))
      } else {
        groups = [{
          id: 'demo-1', name: 'Node.js Development', description: 'Node.js开发环境变量',
          variables: [{ name: 'NODE_ENV', value: 'development' }, { name: 'NODE_PATH', value: getExamplePath() }],
          isActive: false, isSystemVariable: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }]
      }

      if (isServiceAvailable() && groups.length > 0) {
        setIsDetectingStates(true)
        const updatedGroups = []
        const currentUserEnvMap = await getCurrentUserEnvironmentMap()
        for (const group of groups) {
          const actualActiveStatus = await checkGroupActiveStatus(group, currentUserEnvMap)
          const updatedGroup = { ...group, isActive: actualActiveStatus }
          if (group.isActive !== actualActiveStatus) {
            try {
              if (window.utools?.db) {
                const groupDataToSave = { ...group, isActive: actualActiveStatus, updatedAt: new Date().toISOString() }
                delete groupDataToSave.id; delete groupDataToSave._rev
                utools.db.put({ _id: `${prefix}${group.id}`, _rev: group._rev, data: groupDataToSave })
              }
            } catch {}
          }
          updatedGroups.push(updatedGroup)
        }
        groups = updatedGroups
        setIsDetectingStates(false)
      }

      setEnvGroups(groups)
      setSelectedGroups(prev => {
        const currentGroupIds = new Set(groups.map(g => g.id))
        const newSet = new Set()
        prev.forEach(id => { if (currentGroupIds.has(id)) newSet.add(id) })
        return newSet
      })
    } catch (error) {
      showToast(`加载失败: ${error.message}`, 'error')
    } finally { setIsLoading(false) }
  }

  const toggleGroupActive = async (groupId, currentActive) => {
    try {
      const group = envGroups.find(g => g.id === groupId)
      if (!group) return

      if (!currentActive && isServiceAvailable()) {
        const currentEnvMap = await getCurrentUserEnvironmentMap()
        if (currentEnvMap) {
          const conflicts = []
          for (const variable of group.variables) {
            if (!variable.name) continue
            const existing = currentEnvMap[normalizeEnvName(variable.name)]
            if (existing !== undefined && String(existing) !== String(variable.value || '')) {
              conflicts.push({ name: variable.name, oldValue: existing, newValue: variable.value || '' })
            }
          }
          if (conflicts.length > 0) {
            setConflictData({ group, conflicts, groupId })
            setShowConflictModal(true)
            return
          }
        }
      }

      await executeToggleGroupActive(groupId, currentActive)
    } catch (error) {
      showToast(`操作失败: ${error.message}`, 'error')
    }
  }

  const executeToggleGroupActive = async (groupId, currentActive, skipVarNames = new Set()) => {
    const group = envGroups.find(g => g.id === groupId)
    if (!group) return
    const prefix = 'user-group-'
    const groupData = { ...group, isActive: !currentActive, updatedAt: new Date().toISOString() }
    delete groupData.id; delete groupData._rev

    if (window.utools?.db) {
      const existingDoc = utools.db.get(`${prefix}${groupId}`)
      utools.db.put({ _id: `${prefix}${groupId}`, _rev: existingDoc?._rev, data: groupData })
    }

    setEnvGroups(prevGroups => prevGroups.map(g => g.id === groupId ? { ...g, isActive: !currentActive, updatedAt: new Date().toISOString() } : g))

    let hasSystemChanges = false
    if (!currentActive) {
      if (window.services?.setEnvironmentVariable) {
        for (const variable of group.variables) {
          if (!variable.name || !variable.value) continue
          if (skipVarNames.has(variable.name)) continue
          try { await window.services.setEnvironmentVariable(variable.name, variable.value); hasSystemChanges = true } catch {}
        }
      }
    } else {
      if (window.services?.removeEnvironmentVariable) {
        for (const variable of group.variables) {
          if (!variable.name) continue
          try { await window.services.removeEnvironmentVariable(variable.name); hasSystemChanges = true } catch {}
        }
      }
    }

    if (hasSystemChanges && window.services?.refreshEnvironment) {
      try { await window.services.refreshEnvironment() } catch {}
    }

    showToast(`环境变量组 "${group.name}" 已${!currentActive ? '激活' : '停用'}`, 'success')
  }

  const handleConflictOverrideAll = async () => {
    if (!conflictData) return
    setShowConflictModal(false)
    await executeToggleGroupActive(conflictData.groupId, false)
    setConflictData(null)
  }

  const handleConflictSkip = async () => {
    if (!conflictData) return
    setShowConflictModal(false)
    const skipNames = new Set(conflictData.conflicts.map(c => c.name))
    await executeToggleGroupActive(conflictData.groupId, false, skipNames)
    setConflictData(null)
  }

  const handleConflictCancel = () => {
    setShowConflictModal(false)
    setConflictData(null)
  }

  const openCreateModal = () => {
    setModalMode('create'); setEditingGroup(null); setGroupName(''); setGroupDescription(''); setGroupVariables([{ name: '', value: '' }]); setShowModal(true)
  }
  const openEditModal = (group) => {
    setModalMode('edit'); setEditingGroup(group); setGroupName(group.name); setGroupDescription(group.description || ''); setGroupVariables([...group.variables]); setShowModal(true)
  }
  const closeModal = () => {
    setShowModal(false); setModalMode('create'); setEditingGroup(null); setGroupName(''); setGroupDescription(''); setGroupVariables([{ name: '', value: '' }])
  }
  const addVariableToGroup = () => setGroupVariables([...groupVariables, { name: '', value: '' }])
  const removeVariableFromGroup = (index) => { if (groupVariables.length > 1) setGroupVariables(groupVariables.filter((_, i) => i !== index)) }
  const updateGroupVariable = (index, field, value) => { const nv = [...groupVariables]; nv[index][field] = value; setGroupVariables(nv) }

  const saveEnvironmentGroup = async () => {
    if (!groupName.trim()) { showToast('请输入环境变量组名称', 'error'); return }
    const validVariables = groupVariables.filter(v => v.name.trim() && v.value.trim())
    if (validVariables.length === 0) { showToast('请至少添加一个有效的环境变量', 'error'); return }

    try {
      const prefix = 'user-group-'
      const groupId = modalMode === 'edit' && editingGroup ? editingGroup.id : `group-${Date.now()}`
      const groupData = {
        name: groupName.trim(), description: groupDescription.trim(), variables: validVariables,
        isActive: modalMode === 'edit' && editingGroup ? editingGroup.isActive : false,
        isSystemVariable: false,
        createdAt: modalMode === 'edit' && editingGroup ? editingGroup.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (modalMode === 'edit' && editingGroup) {
        addToTrash({ action: 'edit', itemType: 'group', name: editingGroup.name, data: { ...groupData, id: groupId }, originalData: editingGroup })
      } else {
        addToTrash({ action: 'create', itemType: 'group', name: groupData.name, data: { ...groupData, id: groupId } })
      }

      if (window.utools?.db) {
        const existingDoc = utools.db.get(`${prefix}${groupId}`)
        utools.db.put({ _id: `${prefix}${groupId}`, _rev: existingDoc?._rev, data: groupData })
      }

      await loadEnvironmentGroups()
      closeModal()
      showToast(`环境变量组 "${groupName}" ${modalMode === 'edit' ? '更新' : '创建'}成功`, 'success')
    } catch (error) { showToast(`保存失败: ${error.message}`, 'error') }
  }

  const showDeleteConfirmation = (group) => { setGroupToDelete(group); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setShowDeleteModal(false); setGroupToDelete(null) }
  const toggleGroupSelection = (groupId) => { setSelectedGroups(prev => { const s = new Set(prev); s.has(groupId) ? s.delete(groupId) : s.add(groupId); return s }) }

  const toggleSelectAll = () => {
    const allFilteredSelected = filteredGroups.every(g => selectedGroups.has(g.id))
    if (allFilteredSelected && filteredGroups.length > 0) {
      setSelectedGroups(prev => { const s = new Set(prev); filteredGroups.forEach(g => s.delete(g.id)); return s })
    } else {
      setSelectedGroups(prev => { const s = new Set(prev); filteredGroups.forEach(g => s.add(g.id)); return s })
    }
  }

  const clearSelection = () => setSelectedGroups(new Set())
  const showBatchDeleteConfirmation = () => { if (selectedGroups.size === 0) { showToast('请至少选择一个环境变量组', 'error'); return }; setShowBatchDeleteModal(true) }
  const closeBatchDeleteModal = () => setShowBatchDeleteModal(false)

  const confirmBatchDelete = async () => {
    if (selectedGroups.size === 0) return
    const groupsToDelete = envGroups.filter(g => selectedGroups.has(g.id))
    const prefix = 'user-group-'
    try {
      for (const group of groupsToDelete) {
        addToTrash({ action: 'delete', itemType: 'group', name: group.name, data: { ...group } })
        if (group.isActive && window.services?.removeEnvironmentVariable) {
          for (const variable of group.variables) {
            if (!variable.name) continue
            try { await window.services.removeEnvironmentVariable(variable.name) } catch {}
          }
        }
        if (window.utools?.db) { try { utools.db.remove(`${prefix}${group.id}`) } catch {} }
      }
      if (window.services?.refreshEnvironment) { try { await window.services.refreshEnvironment() } catch {} }
      setEnvGroups(prev => prev.filter(g => !selectedGroups.has(g.id)))
      clearSelection(); closeBatchDeleteModal()
      showToast(`成功删除 ${groupsToDelete.length} 个环境变量组`, 'success')
    } catch (error) { showToast(`批量删除失败: ${error.message}`, 'error') }
  }

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return
    const group = groupToDelete; const groupId = group.id
    try {
      addToTrash({ action: 'delete', itemType: 'group', name: group.name, data: { ...group } })
      if (group.isActive && window.services?.removeEnvironmentVariable) {
        for (const variable of group.variables) {
          if (!variable.name) continue
          try { await window.services.removeEnvironmentVariable(variable.name) } catch {}
        }
        if (window.services?.refreshEnvironment) { try { await window.services.refreshEnvironment() } catch {} }
      }
      if (window.utools?.db) utools.db.remove(`user-group-${groupId}`)
      setEnvGroups(prev => prev.filter(g => g.id !== groupId))
      setSelectedGroups(prev => { const s = new Set(prev); s.delete(groupId); return s })
      closeDeleteModal()
      showToast(`环境变量组 "${group.name}" 已删除`, 'success')
    } catch (error) { showToast(`删除失败: ${error.message}`, 'error') }
  }

  const handleExportGroups = () => {
    const toExport = selectedGroups.size > 0
      ? envGroups.filter(g => selectedGroups.has(g.id))
      : envGroups
    if (toExport.length === 0) { showToast('没有可导出的环境变量组', 'error'); return }
    const savePath = utools.showSaveDialog({
      title: '导出环境变量组',
      defaultPath: `env-groups-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    })
    if (!savePath) return
    const payload = { type: 'env-groups-export', version: 1, exportedAt: new Date().toISOString(), groups: toExport.map(g => ({ name: g.name, description: g.description, variables: g.variables, createdAt: g.createdAt })) }
    try {
      window.services.writeFileText(savePath, JSON.stringify(payload, null, 2))
      showToast(`已导出 ${toExport.length} 个环境变量组`, 'success')
    } catch (e) { showToast('导出失败: ' + e.message, 'error') }
  }

  const handleImportGroups = () => {
    const paths = utools.showOpenDialog({
      title: '导入环境变量组',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (!paths || paths.length === 0) return
    try {
      const content = window.services.readFileText(paths[0])
      const parsed = JSON.parse(content)
      if (parsed.type !== 'env-groups-export' || !Array.isArray(parsed.groups)) {
        showToast('文件格式不正确', 'error'); return
      }
      const prefix = 'user-group-'
      let imported = 0
      for (const group of parsed.groups) {
        if (!group.name || !Array.isArray(group.variables)) continue
        const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const groupData = {
          name: group.name, description: group.description || '', variables: group.variables,
          isActive: false, isSystemVariable: false,
          createdAt: group.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        }
        if (window.utools?.db) { utools.db.put({ _id: `${prefix}${groupId}`, data: groupData }) }
        imported++
      }
      loadEnvironmentGroups()
      showToast(`成功导入 ${imported} 个环境变量组`, 'success')
    } catch (e) { showToast('导入失败: ' + e.message, 'error') }
  }

  const searchTerm = searchQuery.trim()
  const filteredGroups = envGroups.filter(group => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return group.name.toLowerCase().includes(q) ||
      group.description?.toLowerCase().includes(q) ||
      group.variables.some(v => v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
  })

  const sortedGroups = [...filteredGroups].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN')
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })

  useEffect(() => { loadEnvironmentGroups() }, [])
  useEffect(() => { if (refreshTrigger > 0) loadEnvironmentGroups() }, [refreshTrigger])

  const formatDate = (dateStr) => {
    if (!dateStr) return '原有'
    return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen p-6">
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300",
          toast.type === 'success' && "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100",
          toast.type === 'error' && "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200",
          toast.type === 'info' && "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        )}>
          <div className="flex items-center gap-2 text-sm">
            {toast.type === 'success' && <Check className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            {toast.message}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">环境变量管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              管理您的环境变量组 · {sortedGroups.length} 个组 · {sortedGroups.filter(g => g.isActive).length} 个已激活
              {selectedGroups.size > 0 && <span className="text-blue-600 dark:text-blue-400 font-medium"> · 已选择 {selectedGroups.size} 个</span>}
            </p>
          </div>
          {isDetectingStates && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 同步中...
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="搜索变量组..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "h-10 pl-9 pr-3 text-sm rounded-lg w-48",
                "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
                "text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
                "focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500"
              )}
            />
          </div>
          <button onClick={() => setSortMode(sortMode === 'name' ? 'time' : 'name')}
            className={cn("flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors")}>
            <ArrowUpDown className="w-4 h-4" /> {sortMode === 'name' ? '按名称' : '按时间'}
          </button>

          <button onClick={loadEnvironmentGroups} disabled={isLoading || isDetectingStates}
            className={cn("flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20", (isLoading || isDetectingStates) && "opacity-60 cursor-not-allowed")}>
            <RefreshCw className={cn("w-4 h-4", (isLoading || isDetectingStates) && "animate-spin")} /> 刷新
          </button>

          {selectedGroups.size > 0 ? (
            <>
              <button onClick={clearSelection} className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <X className="w-4 h-4" /> 取消选择
              </button>
              <button onClick={handleExportGroups} className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <Download className="w-4 h-4" /> 导出选中
              </button>
              <button onClick={showBatchDeleteConfirmation} className="flex items-center gap-2 h-10 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                <Trash2 className="w-4 h-4" /> 批量删除 ({selectedGroups.size})
              </button>
            </>
          ) : (
            <>
              <button onClick={handleExportGroups} className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <Download className="w-4 h-4" /> 导出
              </button>
              <button onClick={handleImportGroups} className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <Upload className="w-4 h-4" /> 导入
              </button>
              <button onClick={openCreateModal} className="flex items-center gap-2 h-10 px-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
                <Plus className="w-4 h-4" /> 创建环境变量组
              </button>
            </>
          )}
        </div>

        {sortedGroups.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <button onClick={toggleSelectAll}
              className="flex items-center gap-2 h-9 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              {sortedGroups.every(g => selectedGroups.has(g.id)) && sortedGroups.length > 0
                ? <><CheckSquare className="w-4 h-4" /> 取消全选</>
                : <><Square className="w-4 h-4" /> 全选</>}
            </button>
            {selectedGroups.size > 0 && (
              <span className="text-sm text-slate-600 dark:text-slate-400">已选择 {Array.from(selectedGroups).filter(id => sortedGroups.some(g => g.id === id)).length} / {sortedGroups.length} 个</span>
            )}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400">加载环境变量组...</p>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
              <Settings className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              {searchTerm ? `没有找到包含 "${searchTerm}" 的环境变量组` : '暂无环境变量组'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{searchTerm ? '请尝试其他搜索关键词' : '点击"创建环境变量组"开始管理'}</p>
            {!searchTerm && (
              <button onClick={openCreateModal} className="flex items-center gap-2 h-10 px-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
                <Plus className="w-4 h-4" /> 创建环境变量组
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.id)
              const isSelected = selectedGroups.has(group.id)
              return (
                <div key={group.id} className={cn("bg-white dark:bg-slate-800 border rounded-xl overflow-hidden transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600", isSelected ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/20" : "border-slate-200 dark:border-slate-700")}>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button onClick={() => toggleGroupSelection(group.id)} className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", isSelected ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60" : "bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600")} title={isSelected ? '取消选择' : '选择'}>
                          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        </button>
                        <button onClick={() => toggleGroupActive(group.id, group.isActive)} className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", group.isActive ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60" : "bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600")} title={group.isActive ? '停用' : '激活'}>
                          {group.isActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-medium text-slate-900 dark:text-slate-100 truncate">{group.name}</h3>
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", group.isActive ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400")}>{group.isActive ? '已激活' : '未激活'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {group.description && <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{group.description}</p>}
                            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{formatDate(group.createdAt)}</span>
                          </div>
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 px-3 py-1 bg-slate-50 dark:bg-slate-700 rounded-lg">{group.variables.length} 个变量</div>
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <button onClick={() => openEditModal(group)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="编辑"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => showDeleteConfirmation(group)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="删除"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => toggleGroupExpansion(group.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={isExpanded ? '收起' : '展开'}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead><tr className="bg-slate-50 dark:bg-slate-700/50">
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">变量名</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">变量值</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">操作</th>
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {group.variables.map((variable, index) => (
                              <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-3"><code className={cn(displayKeyFontClass, "font-mono text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded")}>{variable.name}</code></td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <code className={cn(displayValueFontClass, "font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded flex-1 truncate max-w-md")}>{isValueHidden(group.id, index) ? '••••••••••••••••' : variable.value}</code>
                                    <button onClick={() => toggleValueVisibility(group.id, index)} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={isValueHidden(group.id, index) ? '显示' : '隐藏'}>
                                      {isValueHidden(group.id, index) ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => copyToClipboard(variable.name, '变量名')} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="复制变量名"><Copy className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => copyToClipboard(variable.value, '变量值')} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="复制变量值"><Copy className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{modalMode === 'create' ? '创建环境变量组' : '编辑环境变量组'}</h2>
              <button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">组名称 <span className="text-red-500">*</span></label>
                <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="例如: Node.js Development"
                  className="w-full h-10 px-4 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">描述 (可选)</label>
                <input type="text" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="简短描述这个环境变量组的用途"
                  className="w-full h-10 px-4 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">环境变量 <span className="text-red-500">*</span></label>
                  <button onClick={addVariableToGroup} className="flex items-center gap-1 h-8 px-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"><Plus className="w-4 h-4" /> 添加变量</button>
                </div>
                <div className="space-y-3">
                  {groupVariables.map((variable, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <input type="text" value={variable.name} onChange={(e) => updateGroupVariable(index, 'name', e.target.value)} placeholder="变量名 (如: NODE_ENV)"
                          className={cn("h-10 px-4 font-mono", modalKeyFontClass, "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500")} />
                        <input type="text" value={variable.value} onChange={(e) => updateGroupVariable(index, 'value', e.target.value)} placeholder="变量值 (如: development)"
                          className={cn("h-10 px-4 font-mono", modalValueFontClass, "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500")} />
                      </div>
                      {groupVariables.length > 1 && (
                        <button onClick={() => removeVariableFromGroup(index)} className="w-10 h-10 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="删除此变量"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeModal} className="h-10 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">取消</button>
              <button onClick={saveEnvironmentGroup} className="h-10 px-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">{modalMode === 'create' ? '创建' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">删除确认</h2>
              </div>
              <button onClick={closeDeleteModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">确定要删除环境变量组 <span className="font-semibold text-slate-900 dark:text-slate-100">"{groupToDelete.name}"</span> 吗?</p>
              {groupToDelete.isActive && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-900 dark:text-amber-200">
                      <p className="font-medium mb-1">此组当前处于激活状态</p>
                      <p className="text-amber-700 dark:text-amber-300">删除前将自动停用并移除所有系统环境变量 ({groupToDelete.variables.length} 个变量)</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">包含的环境变量:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {groupToDelete.variables.map((v, i) => <div key={i} className="text-xs font-mono text-slate-700 dark:text-slate-300">• {v.name}</div>)}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeDeleteModal} className="h-10 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={confirmDeleteGroup} className="h-10 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      {showBatchDeleteModal && selectedGroups.size > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">批量删除确认</h2>
              </div>
              <button onClick={closeBatchDeleteModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">确定要删除选中的 <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedGroups.size}</span> 个环境变量组吗？</p>
              <div className="p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg max-h-64 overflow-y-auto">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">将要删除的环境变量组:</p>
                <div className="space-y-3">
                  {envGroups.filter(g => selectedGroups.has(g.id)).map((group) => (
                    <div key={group.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex items-center justify-between mb-1"><span className="font-medium text-sm text-slate-900 dark:text-slate-100">{group.name}</span>
                        {group.isActive && <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">已激活</span>}
                      </div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{group.variables.length} 个变量</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={closeBatchDeleteModal} className="h-10 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={confirmBatchDelete} className="h-10 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">确认删除 ({selectedGroups.size} 个)</button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Modal */}
      {showConflictModal && conflictData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">变量冲突检测</h2>
              </div>
              <button onClick={handleConflictCancel} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">激活 <span className="font-semibold">"{conflictData.group.name}"</span> 时检测到 {conflictData.conflicts.length} 个同名变量冲突：</p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {conflictData.conflicts.map((c, i) => (
                  <div key={i} className="p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg">
                    <p className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{c.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500 dark:text-slate-400">当前值:</span><p className="font-mono text-red-600 dark:text-red-400 mt-0.5 break-all bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">{c.oldValue || '(空)'}</p></div>
                      <div><span className="text-slate-500 dark:text-slate-400">新值:</span><p className="font-mono text-green-600 dark:text-green-400 mt-0.5 break-all bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">{c.newValue || '(空)'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={handleConflictCancel} className="h-10 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
              <button onClick={handleConflictSkip} className="h-10 px-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">跳过冲突</button>
              <button onClick={handleConflictOverrideAll} className="h-10 px-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200">全部覆盖</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
