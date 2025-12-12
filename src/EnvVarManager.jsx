import { useState, useEffect } from 'react'
import {
  Plus, Search, Settings, Eye, EyeOff, Copy, Trash2,
  Edit2, Check, X, Power, PowerOff, Lock, RefreshCw,
  ChevronDown, ChevronUp, AlertCircle, Loader2, CheckSquare, Square
} from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'

export default function EnvVarManager({ onOpenTrash, refreshTrigger }) {
  // Trash history hook
  const { addToTrash } = useTrashHistory('groups')
  // State management
  const [envGroups, setEnvGroups] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetectingStates, setIsDetectingStates] = useState(false)

  // UI state
  const [showSystemVariables, setShowSystemVariables] = useState(false)
  const [systemVariables, setSystemVariables] = useState([])
  const [isLoadingSystemVars, setIsLoadingSystemVars] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [hiddenValues, setHiddenValues] = useState(new Set())

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [editingGroup, setEditingGroup] = useState(null)

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState(null)

  // Multi-select state
  const [selectedGroups, setSelectedGroups] = useState(new Set())
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)

  // Form state
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupVariables, setGroupVariables] = useState([{ name: '', value: '' }])

  // Toast notification state
  const [toast, setToast] = useState(null)

  // Helper: Show toast
  const showToast = (message, type = 'info') => {
    if (window.utools && window.utools.showNotification) {
      window.utools.showNotification(message)
    }
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Helper: Copy to clipboard
  const copyToClipboard = async (text, label = '内容') => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label}已复制`, 'success')
    } catch (error) {
      showToast(`复制失败`, 'error')
    }
  }

  // Helper: Toggle value visibility
  const toggleValueVisibility = (groupId, varIndex) => {
    const key = `${groupId}-${varIndex}`
    setHiddenValues(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  // Helper: Check if value is hidden
  const isValueHidden = (groupId, varIndex) => {
    return hiddenValues.has(`${groupId}-${varIndex}`)
  }

  // Helper: Toggle group expansion
  const toggleGroupExpansion = (groupId) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  // Check if service is available
  const isServiceAvailable = () => {
    return !!(window.services && typeof window.services === 'object')
  }

  // Check single environment variable
  const checkEnvironmentVariable = async (variableName) => {
    try {
      if (window.services && window.services.getEnvironmentVariable) {
        const value = window.services.getEnvironmentVariable(variableName)
        return value !== null && value !== undefined
      }
      return false
    } catch (error) {
      console.error(`检查环境变量 ${variableName} 失败:`, error)
      return false
    }
  }

  // Check group active status
  const checkGroupActiveStatus = async (group) => {
    try {
      if (!group.variables || group.variables.length === 0) {
        return false
      }

      for (const variable of group.variables) {
        if (!variable.name) continue
        const exists = await checkEnvironmentVariable(variable.name)
        if (!exists) {
          return false
        }
      }
      return true
    } catch (error) {
      console.error('检查组激活状态失败:', error)
      return false
    }
  }

  // Load environment groups
  const loadEnvironmentGroups = async () => {
    setIsLoading(true)
    try {
      let groups = []
      const prefix = 'user-group-'

      if (window.utools && window.utools.db) {
        const allDocs = utools.db.allDocs(prefix)
        groups = allDocs
          .filter(doc => doc.data && doc.data.name)
          .map(doc => ({
            ...doc.data,
            id: doc._id.replace(prefix, ''),
            _rev: doc._rev,
            isSystemVariable: false
          }))
      } else {
        // Demo data for development
        groups = [
          {
            id: 'demo-1',
            name: 'Node.js Development',
            description: 'Node.js开发环境变量',
            variables: [
              { name: 'NODE_ENV', value: 'development' },
              { name: 'NODE_PATH', value: 'C:\\Program Files\\nodejs' }
            ],
            isActive: false,
            isSystemVariable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      }

      // Auto-detect and sync active status
      if (isServiceAvailable() && groups.length > 0) {
        setIsDetectingStates(true)
        const updatedGroups = []

        for (const group of groups) {
          const actualActiveStatus = await checkGroupActiveStatus(group)
          const updatedGroup = { ...group, isActive: actualActiveStatus }

          if (group.isActive !== actualActiveStatus) {
            try {
              if (window.utools && window.utools.db) {
                // 准备保存的数据，移除不需要保存的字段
                const groupDataToSave = { ...group, isActive: actualActiveStatus, updatedAt: new Date().toISOString() }
                delete groupDataToSave.id
                delete groupDataToSave._rev

                utools.db.put({
                  _id: `${prefix}${group.id}`,
                  _rev: group._rev,
                  data: groupDataToSave
                })
              }
            } catch (error) {
              console.error(`更新组 ${group.name} 状态失败:`, error)
            }
          }

          updatedGroups.push(updatedGroup)
        }
        groups = updatedGroups
        setIsDetectingStates(false)
      }

      setEnvGroups(groups.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))

      // 清理 selectedGroups 中已经不存在的组 ID
      setSelectedGroups(prev => {
        const currentGroupIds = new Set(groups.map(g => g.id))
        const newSet = new Set()
        prev.forEach(id => {
          if (currentGroupIds.has(id)) {
            newSet.add(id)
          }
        })
        return newSet
      })
    } catch (error) {
      console.error('加载环境变量组失败:', error)
      showToast(`加载失败: ${error.message}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Load system variables
  const loadSystemEnvironmentVariables = async () => {
    setIsLoadingSystemVars(true)
    try {
      let userVars = {}
      let systemVars = {}

      if (window.services && window.services.getAllEnvironmentVariables) {
        userVars = await window.services.getAllEnvironmentVariables(false)
        systemVars = await window.services.getAllEnvironmentVariables(true)
      } else {
        // Demo data
        userVars = {
          'NODE_HOME': 'C:\\Program Files\\nodejs',
          'JAVA_HOME': 'C:\\Program Files\\Java\\jdk-11'
        }
        systemVars = {
          'PATH': 'C:\\Windows\\System32',
          'WINDIR': 'C:\\Windows'
        }
      }

      const allVars = { ...systemVars, ...userVars }
      const systemGroups = Object.entries(allVars)
        .filter(([name, value]) => name && value !== undefined)
        .map(([name, value]) => {
          const isPath = name.toUpperCase() === 'PATH'
          const pathArray = isPath ? (value || '').split(';').filter(p => p.trim()) : []
          const isSystemVar = systemVars.hasOwnProperty(name)

          return {
            id: `system-${isSystemVar ? 'sys' : 'user'}-${name.toLowerCase()}`,
            name: name,
            description: isSystemVar ? '系统级环境变量 (只读)' : '用户级环境变量 (只读)',
            variables: [{ name, value }],
            pathArray: isPath ? pathArray : null,
            isPath,
            isActive: true,
            isSystemVariable: true,
            isSystemLevel: isSystemVar,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })

      setSystemVariables(systemGroups)
    } catch (error) {
      console.error('加载系统环境变量失败:', error)
      showToast(`加载系统变量失败: ${error.message}`, 'error')
    } finally {
      setIsLoadingSystemVars(false)
    }
  }

  // Toggle system variables visibility
  const toggleSystemVariables = async () => {
    if (!showSystemVariables && systemVariables.length === 0) {
      await loadSystemEnvironmentVariables()
    }
    setShowSystemVariables(!showSystemVariables)
  }

  // Toggle group active status
  const toggleGroupActive = async (groupId, currentActive) => {
    try {
      const group = envGroups.find(g => g.id === groupId)
      if (!group) return

      const prefix = 'user-group-'
      const groupData = {
        ...group,
        isActive: !currentActive,
        updatedAt: new Date().toISOString()
      }
      // 移除不需要保存的字段
      delete groupData.id
      delete groupData._rev

      if (window.utools && window.utools.db) {
        // 获取现有文档以获取 _rev（用于更新）
        const existingDoc = utools.db.get(`${prefix}${groupId}`)
        utools.db.put({
          _id: `${prefix}${groupId}`,
          _rev: existingDoc?._rev,
          data: groupData
        })
      }

      setEnvGroups(prevGroups =>
        prevGroups.map(g =>
          g.id === groupId
            ? { ...g, isActive: !currentActive, updatedAt: new Date().toISOString() }
            : g
        )
      )

      let hasSystemChanges = false

      if (!currentActive) {
        // Activate: set all variables
        if (window.services && window.services.setEnvironmentVariable) {
          for (const variable of group.variables) {
            if (!variable.name || !variable.value) continue
            try {
              await window.services.setEnvironmentVariable(variable.name, variable.value)
              hasSystemChanges = true
            } catch (error) {
              console.error(`Failed to set ${variable.name}:`, error)
            }
          }
        }
      } else {
        // Deactivate: remove all variables
        if (window.services && window.services.removeEnvironmentVariable) {
          for (const variable of group.variables) {
            if (!variable.name) continue
            try {
              await window.services.removeEnvironmentVariable(variable.name)
              hasSystemChanges = true
            } catch (error) {
              console.error(`Failed to remove ${variable.name}:`, error)
            }
          }
        }
      }

      if (hasSystemChanges && window.services && window.services.refreshEnvironment) {
        try {
          await window.services.refreshEnvironment()
        } catch (error) {
          console.error('Failed to refresh environment:', error)
        }
      }

      showToast(
        `环境变量组 "${group.name}" 已${!currentActive ? '激活' : '停用'}`,
        'success'
      )
    } catch (error) {
      console.error('Error in toggleGroupActive:', error)
      showToast(`操作失败: ${error.message}`, 'error')
    }
  }

  // Open create modal
  const openCreateModal = () => {
    setModalMode('create')
    setEditingGroup(null)
    setGroupName('')
    setGroupDescription('')
    setGroupVariables([{ name: '', value: '' }])
    setShowModal(true)
  }

  // Open edit modal
  const openEditModal = (group) => {
    setModalMode('edit')
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupDescription(group.description || '')
    setGroupVariables([...group.variables])
    setShowModal(true)
  }

  // Close modal
  const closeModal = () => {
    setShowModal(false)
    setModalMode('create')
    setEditingGroup(null)
    setGroupName('')
    setGroupDescription('')
    setGroupVariables([{ name: '', value: '' }])
  }

  // Add variable to form
  const addVariableToGroup = () => {
    setGroupVariables([...groupVariables, { name: '', value: '' }])
  }

  // Remove variable from form
  const removeVariableFromGroup = (index) => {
    if (groupVariables.length > 1) {
      setGroupVariables(groupVariables.filter((_, i) => i !== index))
    }
  }

  // Update variable in form
  const updateGroupVariable = (index, field, value) => {
    const newVars = [...groupVariables]
    newVars[index][field] = value
    setGroupVariables(newVars)
  }

  // Save environment group
  const saveEnvironmentGroup = async () => {
    if (!groupName.trim()) {
      showToast('请输入环境变量组名称', 'error')
      return
    }

    const validVariables = groupVariables.filter(v => v.name.trim() && v.value.trim())
    if (validVariables.length === 0) {
      showToast('请至少添加一个有效的环境变量', 'error')
      return
    }

    try {
      const prefix = 'user-group-'
      const groupId = modalMode === 'edit' && editingGroup
        ? editingGroup.id
        : `group-${Date.now()}`

      // 编辑模式下保留原有的 isActive 状态
      const groupData = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        variables: validVariables,
        isActive: modalMode === 'edit' && editingGroup ? editingGroup.isActive : false,
        isSystemVariable: false,
        createdAt: modalMode === 'edit' && editingGroup ? editingGroup.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Track edit operation in trash history
      if (modalMode === 'edit' && editingGroup) {
        addToTrash({
          action: 'edit',
          itemType: 'group',
          name: editingGroup.name,
          data: { ...groupData, id: groupId },
          originalData: editingGroup,
        })
      }

      if (window.utools && window.utools.db) {
        // 获取现有文档以获取 _rev（用于更新）
        const existingDoc = utools.db.get(`${prefix}${groupId}`)
        utools.db.put({
          _id: `${prefix}${groupId}`,
          _rev: existingDoc?._rev,
          data: groupData
        })
      }

      await loadEnvironmentGroups()
      closeModal()
      showToast(
        `环境变量组 "${groupName}" ${modalMode === 'edit' ? '更新' : '创建'}成功`,
        'success'
      )
    } catch (error) {
      console.error('保存环境变量组失败:', error)
      showToast(`保存失败: ${error.message}`, 'error')
    }
  }

  // Show delete confirmation modal
  const showDeleteConfirmation = (group) => {
    setGroupToDelete(group)
    setShowDeleteModal(true)
  }

  // Close delete confirmation modal
  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setGroupToDelete(null)
  }

  // Toggle group selection
  const toggleGroupSelection = (groupId) => {
    setSelectedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  // Toggle select all
  const toggleSelectAll = () => {
    // 检查当前过滤的组是否全部被选中
    const allFilteredSelected = filteredGroups.every(g => selectedGroups.has(g.id))

    if (allFilteredSelected && filteredGroups.length > 0) {
      // 取消选择所有过滤的组
      setSelectedGroups(prev => {
        const newSet = new Set(prev)
        filteredGroups.forEach(g => newSet.delete(g.id))
        return newSet
      })
    } else {
      // 选择所有过滤的组
      setSelectedGroups(prev => {
        const newSet = new Set(prev)
        filteredGroups.forEach(g => newSet.add(g.id))
        return newSet
      })
    }
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedGroups(new Set())
  }

  // Show batch delete confirmation
  const showBatchDeleteConfirmation = () => {
    if (selectedGroups.size === 0) {
      showToast('请至少选择一个环境变量组', 'error')
      return
    }
    setShowBatchDeleteModal(true)
  }

  // Close batch delete modal
  const closeBatchDeleteModal = () => {
    setShowBatchDeleteModal(false)
  }

  // Confirm batch delete
  const confirmBatchDelete = async () => {
    if (selectedGroups.size === 0) return

    const groupsToDelete = envGroups.filter(g => selectedGroups.has(g.id))
    const prefix = 'user-group-'

    try {
      showToast(`正在删除 ${groupsToDelete.length} 个环境变量组...`, 'info')

      for (const group of groupsToDelete) {
        // Track delete operation in trash history
        addToTrash({
          action: 'delete',
          itemType: 'group',
          name: group.name,
          data: { ...group },
        })

        // 如果组是激活状态,先停用(删除系统环境变量)
        if (group.isActive && window.services && window.services.removeEnvironmentVariable) {
          for (const variable of group.variables) {
            if (!variable.name) continue
            try {
              await window.services.removeEnvironmentVariable(variable.name)
            } catch (error) {
              console.error(`Failed to remove ${variable.name}:`, error)
            }
          }
        }

        // 从数据库删除
        if (window.utools && window.utools.db) {
          try {
            utools.db.remove(`${prefix}${group.id}`)
          } catch (error) {
            console.error(`删除组 ${group.name} 失败:`, error)
          }
        }
      }

      // 刷新环境变量
      if (window.services && window.services.refreshEnvironment) {
        try {
          await window.services.refreshEnvironment()
        } catch (error) {
          console.error('Failed to refresh environment:', error)
        }
      }

      // 从UI状态中移除
      setEnvGroups(prevGroups =>
        prevGroups.filter(g => !selectedGroups.has(g.id))
      )

      // 清空选择
      clearSelection()

      // 关闭对话框并显示成功消息
      closeBatchDeleteModal()
      showToast(`成功删除 ${groupsToDelete.length} 个环境变量组`, 'success')
    } catch (error) {
      console.error('批量删除失败:', error)
      showToast(`批量删除失败: ${error.message}`, 'error')
    }
  }

  // Delete group (confirmed)
  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return

    const group = groupToDelete
    const groupId = group.id

    try {
      // Track delete operation in trash history
      addToTrash({
        action: 'delete',
        itemType: 'group',
        name: group.name,
        data: { ...group },
      })

      // Step 1: 如果组是激活状态,先停用(删除系统环境变量)
      if (group.isActive && window.services && window.services.removeEnvironmentVariable) {
        showToast(`正在停用环境变量组 "${group.name}"...`, 'info')

        for (const variable of group.variables) {
          if (!variable.name) continue
          try {
            await window.services.removeEnvironmentVariable(variable.name)
          } catch (error) {
            console.error(`Failed to remove ${variable.name}:`, error)
            showToast(`移除变量 ${variable.name} 失败: ${error.message}`, 'error')
          }
        }

        // 刷新环境变量
        if (window.services && window.services.refreshEnvironment) {
          try {
            await window.services.refreshEnvironment()
          } catch (error) {
            console.error('Failed to refresh environment:', error)
          }
        }
      }

      // Step 2: 从数据库删除
      const prefix = 'user-group-'
      if (window.utools && window.utools.db) {
        utools.db.remove(`${prefix}${groupId}`)
      }

      // Step 3: 从UI状态中移除
      setEnvGroups(prevGroups => prevGroups.filter(g => g.id !== groupId))

      // Step 4: 如果该组在选中列表中，也要移除
      setSelectedGroups(prev => {
        const newSet = new Set(prev)
        if (newSet.has(groupId)) {
          newSet.delete(groupId)
        }
        return newSet
      })

      // Close modal and show success
      closeDeleteModal()
      showToast(`环境变量组 "${group.name}" 已删除`, 'success')
    } catch (error) {
      console.error('删除环境变量组失败:', error)
      showToast(`删除失败: ${error.message}`, 'error')
    }
  }

  // Filter groups
  const filteredGroups = envGroups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.variables.some(v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.value.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const allGroups = showSystemVariables
    ? [...filteredGroups, ...systemVariables.filter(group =>
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.variables.some(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )]
    : filteredGroups

  useEffect(() => {
    loadEnvironmentGroups()
  }, [])

  // Reload when refreshTrigger changes (after restore from trash)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadEnvironmentGroups()
    }
  }, [refreshTrigger])

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-top",
          "transition-all duration-300",
          toast.type === 'success' && "bg-white border-slate-200 text-slate-900",
          toast.type === 'error' && "bg-red-50 border-red-200 text-red-900",
          toast.type === 'info' && "bg-white border-slate-200 text-slate-900"
        )}>
          <div className="flex items-center gap-2 text-sm">
            {toast.type === 'success' && <Check className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">环境变量管理</h1>
            <p className="text-sm text-slate-500 mt-1">
              管理您的环境变量组 · {allGroups.length} 个组 · {allGroups.filter(g => g.isActive).length} 个已激活
              {selectedGroups.size > 0 && (
                <span className="text-blue-600 font-medium"> · 已选择 {selectedGroups.size} 个</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isDetectingStates && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                同步中...
              </div>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索环境变量组..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn(
                "w-full h-10 pl-10 pr-4 text-sm",
                "bg-white border border-slate-200 rounded-lg",
                "placeholder:text-slate-400 text-slate-900",
                "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                "transition-all"
              )}
            />
          </div>

          {/* Batch Actions - Show when groups are selected */}
          {selectedGroups.size > 0 ? (
            <>
              <button
                onClick={clearSelection}
                className={cn(
                  "flex items-center gap-2 h-10 px-4",
                  "bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg",
                  "hover:bg-slate-50 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10"
                )}
              >
                <X className="w-4 h-4" />
                取消选择
              </button>
              <button
                onClick={showBatchDeleteConfirmation}
                className={cn(
                  "flex items-center gap-2 h-10 px-4",
                  "bg-red-600 text-white text-sm font-medium rounded-lg",
                  "hover:bg-red-700 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                )}
              >
                <Trash2 className="w-4 h-4" />
                批量删除 ({selectedGroups.size})
              </button>
            </>
          ) : (
            <>
              {/* Create Button */}
              <button
                onClick={openCreateModal}
                className={cn(
                  "flex items-center gap-2 h-10 px-4",
                  "bg-slate-900 text-white text-sm font-medium rounded-lg",
                  "hover:bg-slate-800 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                )}
              >
                <Plus className="w-4 h-4" />
                创建环境变量组
              </button>

              {/* System Variables Toggle */}
              <button
                onClick={toggleSystemVariables}
                className={cn(
                  "flex items-center gap-2 h-10 px-4",
                  "bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg",
                  "hover:bg-slate-50 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10",
                  showSystemVariables && "bg-slate-50 border-slate-300"
                )}
              >
                <Lock className="w-4 h-4" />
                {showSystemVariables ? '隐藏系统变量' : '查看系统变量'}
              </button>
            </>
          )}
        </div>

        {/* Multi-select toggle - Show when there are user groups */}
        {filteredGroups.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={toggleSelectAll}
              className={cn(
                "flex items-center gap-2 h-9 px-3",
                "bg-white border border-slate-200 text-slate-700 text-sm rounded-lg",
                "hover:bg-slate-50 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10"
              )}
            >
              {filteredGroups.every(g => selectedGroups.has(g.id)) && filteredGroups.length > 0 ? (
                <>
                  <CheckSquare className="w-4 h-4" />
                  取消全选
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  全选
                </>
              )}
            </button>
            {selectedGroups.size > 0 && (
              <span className="text-sm text-slate-600">
                已选择 {Array.from(selectedGroups).filter(id => filteredGroups.some(g => g.id === id)).length} / {filteredGroups.length} 个
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
            <p className="text-sm text-slate-500">加载环境变量组...</p>
          </div>
        ) : allGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Settings className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchTerm ? `没有找到包含 "${searchTerm}" 的环境变量组` : '暂无环境变量组'}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {searchTerm ? '请尝试其他搜索关键词' : '点击"创建环境变量组"开始管理您的环境变量'}
            </p>
            {!searchTerm && (
              <button
                onClick={openCreateModal}
                className={cn(
                  "flex items-center gap-2 h-10 px-4",
                  "bg-slate-900 text-white text-sm font-medium rounded-lg",
                  "hover:bg-slate-800 transition-colors"
                )}
              >
                <Plus className="w-4 h-4" />
                创建环境变量组
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {allGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.id)
              const isSelected = selectedGroups.has(group.id)
              const isUserGroup = !group.isSystemVariable

              return (
                <div
                  key={group.id}
                  className={cn(
                    "bg-white border rounded-xl overflow-hidden",
                    "transition-all duration-200",
                    "hover:border-slate-300",
                    group.isSystemVariable && "border-amber-200 bg-amber-50/30",
                    isSelected && "border-blue-400 bg-blue-50/30 ring-2 ring-blue-400/20"
                  )}
                >
                  {/* Group Header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Checkbox for user groups */}
                        {isUserGroup && (
                          <button
                            onClick={() => toggleGroupSelection(group.id)}
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                              "focus:outline-none focus:ring-2 focus:ring-offset-2",
                              isSelected
                                ? "bg-blue-100 text-blue-600 hover:bg-blue-200 focus:ring-blue-500/20"
                                : "bg-slate-100 text-slate-400 hover:bg-slate-200 focus:ring-slate-500/20"
                            )}
                            title={isSelected ? '取消选择' : '选择'}
                          >
                            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </button>
                        )}

                        {/* Active Toggle */}
                        {!group.isSystemVariable && (
                          <button
                            onClick={() => toggleGroupActive(group.id, group.isActive)}
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                              "focus:outline-none focus:ring-2 focus:ring-offset-2",
                              group.isActive
                                ? "bg-green-100 text-green-600 hover:bg-green-200 focus:ring-green-500/20"
                                : "bg-slate-100 text-slate-400 hover:bg-slate-200 focus:ring-slate-500/20"
                            )}
                            title={group.isActive ? '停用' : '激活'}
                          >
                            {group.isActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                          </button>
                        )}

                        {/* System Variable Badge */}
                        {group.isSystemVariable && (
                          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                            <Lock className="w-5 h-5" />
                          </div>
                        )}

                        {/* Group Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-medium text-slate-900 truncate">
                              {group.name}
                            </h3>
                            {group.isSystemVariable && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                系统变量
                              </span>
                            )}
                            {!group.isSystemVariable && (
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                group.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-slate-100 text-slate-600"
                              )}>
                                {group.isActive ? '已激活' : '未激活'}
                              </span>
                            )}
                          </div>
                          {group.description && (
                            <p className="text-sm text-slate-500 mt-0.5 truncate">
                              {group.description}
                            </p>
                          )}
                        </div>

                        {/* Variable Count */}
                        <div className="text-sm text-slate-500 px-3 py-1 bg-slate-50 rounded-lg">
                          {group.variables.length} 个变量
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 ml-4">
                        {!group.isSystemVariable && (
                          <>
                            <button
                              onClick={() => openEditModal(group)}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                "text-slate-600 hover:bg-slate-100 transition-colors",
                                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10"
                              )}
                              title="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => showDeleteConfirmation(group)}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                "text-red-600 hover:bg-red-50 transition-colors",
                                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500/20"
                              )}
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => toggleGroupExpansion(group.id)}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            "text-slate-600 hover:bg-slate-100 transition-colors",
                            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10"
                          )}
                          title={isExpanded ? '收起' : '展开'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Variables Table (Expandable) */}
                  {isExpanded && (
                    <div className="border-t border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                变量名
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                变量值
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-24">
                                操作
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.variables.map((variable, index) => (
                              <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <code className="text-sm font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                    {variable.name}
                                  </code>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <code className="text-sm font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded flex-1 truncate max-w-md">
                                      {isValueHidden(group.id, index)
                                        ? '••••••••••••••••'
                                        : variable.value}
                                    </code>
                                    <button
                                      onClick={() => toggleValueVisibility(group.id, index)}
                                      className={cn(
                                        "w-7 h-7 rounded flex items-center justify-center",
                                        "text-slate-500 hover:bg-slate-100 transition-colors"
                                      )}
                                      title={isValueHidden(group.id, index) ? '显示' : '隐藏'}
                                    >
                                      {isValueHidden(group.id, index)
                                        ? <Eye className="w-3.5 h-3.5" />
                                        : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => copyToClipboard(variable.name, '变量名')}
                                      className={cn(
                                        "w-7 h-7 rounded flex items-center justify-center",
                                        "text-slate-500 hover:bg-slate-100 transition-colors"
                                      )}
                                      title="复制变量名"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(variable.value, '变量值')}
                                      className={cn(
                                        "w-7 h-7 rounded flex items-center justify-center",
                                        "text-slate-500 hover:bg-slate-100 transition-colors"
                                      )}
                                      title="复制变量值"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
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

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {modalMode === 'create' ? '创建环境变量组' : '编辑环境变量组'}
              </h2>
              <button
                onClick={closeModal}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-slate-500 hover:bg-slate-100 transition-colors"
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Group Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  组名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="例如: Node.js Development"
                  className={cn(
                    "w-full h-10 px-4 text-sm",
                    "bg-white border border-slate-200 rounded-lg",
                    "placeholder:text-slate-400 text-slate-900",
                    "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                    "transition-all"
                  )}
                />
              </div>

              {/* Group Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  描述 (可选)
                </label>
                <input
                  type="text"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="简短描述这个环境变量组的用途"
                  className={cn(
                    "w-full h-10 px-4 text-sm",
                    "bg-white border border-slate-200 rounded-lg",
                    "placeholder:text-slate-400 text-slate-900",
                    "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                    "transition-all"
                  )}
                />
              </div>

              {/* Variables */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    环境变量 <span className="text-red-500">*</span>
                  </label>
                  <button
                    onClick={addVariableToGroup}
                    className={cn(
                      "flex items-center gap-1 h-8 px-3",
                      "bg-slate-100 text-slate-700 text-sm font-medium rounded-lg",
                      "hover:bg-slate-200 transition-colors"
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    添加变量
                  </button>
                </div>

                <div className="space-y-3">
                  {groupVariables.map((variable, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={variable.name}
                          onChange={(e) => updateGroupVariable(index, 'name', e.target.value)}
                          placeholder="变量名 (如: NODE_ENV)"
                          className={cn(
                            "h-10 px-4 text-sm font-mono",
                            "bg-white border border-slate-200 rounded-lg",
                            "placeholder:text-slate-400 text-slate-900",
                            "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                            "transition-all"
                          )}
                        />
                        <input
                          type="text"
                          value={variable.value}
                          onChange={(e) => updateGroupVariable(index, 'value', e.target.value)}
                          placeholder="变量值 (如: development)"
                          className={cn(
                            "h-10 px-4 text-sm font-mono",
                            "bg-white border border-slate-200 rounded-lg",
                            "placeholder:text-slate-400 text-slate-900",
                            "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                            "transition-all"
                          )}
                        />
                      </div>
                      {groupVariables.length > 1 && (
                        <button
                          onClick={() => removeVariableFromGroup(index)}
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            "text-red-600 hover:bg-red-50 transition-colors"
                          )}
                          title="删除此变量"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={closeModal}
                className={cn(
                  "h-10 px-4",
                  "bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg",
                  "hover:bg-slate-50 transition-colors"
                )}
              >
                取消
              </button>
              <button
                onClick={saveEnvironmentGroup}
                className={cn(
                  "h-10 px-4",
                  "bg-slate-900 text-white text-sm font-medium rounded-lg",
                  "hover:bg-slate-800 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                )}
              >
                {modalMode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">删除确认</h2>
              </div>
              <button
                onClick={closeDeleteModal}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-slate-500 hover:bg-slate-100 transition-colors"
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                确定要删除环境变量组 <span className="font-semibold text-slate-900">"{groupToDelete.name}"</span> 吗?
              </p>

              {groupToDelete.isActive && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-900">
                      <p className="font-medium mb-1">此组当前处于激活状态</p>
                      <p className="text-amber-700">
                        删除前将自动停用并移除所有系统环境变量 ({groupToDelete.variables.length} 个变量)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-600 mb-2">包含的环境变量:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {groupToDelete.variables.map((variable, index) => (
                    <div key={index} className="text-xs font-mono text-slate-700">
                      • {variable.name}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                此操作无法撤销
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={closeDeleteModal}
                className={cn(
                  "h-10 px-4",
                  "bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg",
                  "hover:bg-slate-50 transition-colors"
                )}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteGroup}
                className={cn(
                  "h-10 px-4",
                  "bg-red-600 text-white text-sm font-medium rounded-lg",
                  "hover:bg-red-700 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                )}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && selectedGroups.size > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">批量删除确认</h2>
              </div>
              <button
                onClick={closeBatchDeleteModal}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-slate-500 hover:bg-slate-100 transition-colors"
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                确定要删除选中的 <span className="font-semibold text-slate-900">{selectedGroups.size}</span> 个环境变量组吗？
              </p>

              {/* List of groups to delete */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                <p className="text-xs font-medium text-slate-600 mb-3">将要删除的环境变量组:</p>
                <div className="space-y-3">
                  {envGroups
                    .filter(g => selectedGroups.has(g.id))
                    .map((group) => (
                      <div key={group.id} className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-slate-900">{group.name}</span>
                          {group.isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                              已激活
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-xs text-slate-500 mb-2">{group.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <span>{group.variables.length} 个变量</span>
                          {group.isActive && (
                            <span className="text-amber-600">· 将自动停用</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Warning if any active groups */}
              {envGroups.filter(g => selectedGroups.has(g.id) && g.isActive).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-900">
                      <p className="font-medium mb-1">注意</p>
                      <p className="text-amber-700">
                        有 {envGroups.filter(g => selectedGroups.has(g.id) && g.isActive).length} 个组处于激活状态，
                        删除前将自动停用并移除相关的系统环境变量
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500">
                此操作无法撤销
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={closeBatchDeleteModal}
                className={cn(
                  "h-10 px-4",
                  "bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg",
                  "hover:bg-slate-50 transition-colors"
                )}
              >
                取消
              </button>
              <button
                onClick={confirmBatchDelete}
                className={cn(
                  "h-10 px-4",
                  "bg-red-600 text-white text-sm font-medium rounded-lg",
                  "hover:bg-red-700 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                )}
              >
                确认删除 ({selectedGroups.size} 个)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
