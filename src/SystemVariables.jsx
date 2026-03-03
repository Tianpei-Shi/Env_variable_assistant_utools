import { useState, useEffect } from 'react'
import {
  Plus, Copy, Trash2, Edit2, X, AlertCircle, CheckCircle,
  Loader2, RefreshCw, ShieldAlert
} from 'lucide-react'
import { cn } from './utils/cn'
import { getFontClass } from './utils/fontLevel'

export default function SystemVariables({ refreshTrigger, fontSettings, notificationSettings }) {
  const [systemVariables, setSystemVariables] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingVariable, setEditingVariable] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const [pathList, setPathList] = useState([])
  const [isCheckingPermission, setIsCheckingPermission] = useState(true)
  const [canModifySystem, setCanModifySystem] = useState(false)
  const displayKeyFontClass = getFontClass(fontSettings?.displayKeySize, 2)
  const displayValueFontClass = getFontClass(fontSettings?.displayValueSize, 2)
  const modalKeyFontClass = getFontClass(fontSettings?.modalKeySize, 2)
  const modalValueFontClass = getFontClass(fontSettings?.modalValueSize, 2)

  useEffect(() => {
    initializePage()
  }, [])

  useEffect(() => {
    if (refreshTrigger > 0) {
      initializePage()
    }
  }, [refreshTrigger])

  const initializePage = async () => {
    await checkSystemPermission()
    await loadSystemVariables()
  }

  const checkSystemPermission = async () => {
    setIsCheckingPermission(true)
    try {
      if (window.services && window.services.canModifySystemEnvironment) {
        const hasPermission = await window.services.canModifySystemEnvironment()
        setCanModifySystem(!!hasPermission)
      } else {
        // 开发环境默认允许编辑，uTools 环境且无接口时退化为只读
        setCanModifySystem(!window.utools)
      }
    } catch (error) {
      console.error('检查系统环境变量权限失败:', error)
      setCanModifySystem(false)
    } finally {
      setIsCheckingPermission(false)
    }
  }

  const loadSystemVariables = async () => {
    setIsLoading(true)
    try {
      if (window.services && window.services.getAllEnvironmentVariables) {
        const vars = await window.services.getAllEnvironmentVariables(true)
        const varArray = Object.entries(vars).map(([name, value]) => ({ name, value: value || '' }))
        setSystemVariables(varArray.sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const mockVars = [
          { name: 'PATH', value: 'C:\\Windows\\System32;C:\\Program Files' },
          { name: 'ComSpec', value: 'C:\\Windows\\System32\\cmd.exe' },
          { name: 'OS', value: 'Windows_NT' },
          { name: 'SystemRoot', value: 'C:\\Windows' }
        ]
        setSystemVariables(mockVars)
      }
    } catch (error) {
      console.error('加载系统变量失败:', error)
      showToast('加载失败: ' + error.message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const saveVariable = async (name, value, isNew = false) => {
    if (!canModifySystem) {
      showToast('当前没有系统环境变量写入权限，请用管理员权限启动 uTools', 'error')
      return
    }

    try {
      if (window.services && window.services.setEnvironmentVariable) {
        await window.services.setEnvironmentVariable(name, value, true)
        await window.services.refreshEnvironment()
      }

      await loadSystemVariables()
      showToast(isNew ? '系统变量已创建' : '系统变量已更新', 'success')
    } catch (error) {
      showToast('保存失败: ' + error.message, 'error')
    }
  }

  const deleteVariable = async (variable) => {
    if (!canModifySystem) {
      showToast('当前没有系统环境变量写入权限，请用管理员权限启动 uTools', 'error')
      return
    }

    try {
      if (window.services && window.services.removeEnvironmentVariable) {
        await window.services.removeEnvironmentVariable(variable.name, true)
        await window.services.refreshEnvironment()
      }

      await loadSystemVariables()
      showToast('系统变量已删除', 'success')
    } catch (error) {
      showToast('删除失败: ' + error.message, 'error')
    }
  }

  const showToast = (message, type = 'success') => {
    const desktopEnabled = notificationSettings?.desktopEnabled === true
    const inAppEnabled = notificationSettings?.inAppEnabled !== false

    if (desktopEnabled && window.utools && window.utools.showNotification) {
      window.utools.showNotification(message)
    }

    if (!inAppEnabled) {
      setToast({ show: false, message: '', type: 'success' })
      return
    }

    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const copyToClipboard = async (text) => {
    try {
      if (window.utools && window.utools.copyText) {
        window.utools.copyText(text)
      } else {
        await navigator.clipboard.writeText(text)
      }
      showToast('已复制', 'success')
    } catch (error) {
      showToast('复制失败', 'error')
    }
  }

  const isPathVariable = (name) => {
    return name.toUpperCase() === 'PATH'
  }

  const splitPathValue = (value) => {
    if (!value || typeof value !== 'string') return []
    const separator = value.includes(';') ? ';' : ':'
    return value.split(separator).filter((p) => p && p.trim())
  }

  const openEditModal = (variable = null) => {
    if (variable) {
      setEditingVariable({ ...variable, isNew: false })
      if (isPathVariable(variable.name)) {
        setPathList(splitPathValue(variable.value))
      } else {
        setPathList([])
      }
    } else {
      setEditingVariable({ name: '', value: '', isNew: true })
      setPathList([])
    }
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    setEditingVariable(null)
    setShowEditModal(false)
    setPathList([])
  }

  const handleSaveEdit = async () => {
    if (!editingVariable.name || (!editingVariable.value && pathList.length === 0)) {
      showToast('名称和值不能为空', 'error')
      return
    }

    const finalValue = isPathVariable(editingVariable.name)
      ? pathList.filter(p => p.trim()).join(';')
      : editingVariable.value

    await saveVariable(editingVariable.name, finalValue, editingVariable.isNew)
    closeEditModal()
  }

  const openDeleteModal = (variable) => {
    setVariableToDelete(variable)
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setVariableToDelete(null)
    setShowDeleteModal(false)
  }

  const handleConfirmDelete = async () => {
    if (variableToDelete) {
      await deleteVariable(variableToDelete)
      closeDeleteModal()
    }
  }

  const addPathItem = () => {
    setPathList([...pathList, ''])
  }

  const removePathItem = (index) => {
    setPathList(pathList.filter((_, i) => i !== index))
  }

  const updatePathItem = (index, value) => {
    const newList = [...pathList]
    newList[index] = value
    setPathList(newList)
  }

  const filteredVars = systemVariables.filter((v) => {
    if (!v || !v.name || v.value == null) return false
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return v.name.toLowerCase().includes(query) || String(v.value).toLowerCase().includes(query)
  })

  const isReadonly = !canModifySystem || isCheckingPermission

  return (
    <div className="p-6 pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">系统环境变量</h1>
        <p className="text-sm text-slate-500">
          管理 Windows 系统级环境变量 · {filteredVars.length} 个 · {isReadonly ? '只读' : '可编辑'}
        </p>
      </div>

      {!isCheckingPermission && !canModifySystem && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">当前为只读模式</p>
            <p className="text-amber-800">未检测到管理员权限。请以管理员身份启动 uTools 后，再进行系统变量的增删改。</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索变量名或值..."
          className={cn(
            'flex-1 h-10 px-4 text-sm',
            'bg-white border border-slate-200 rounded-lg',
            'text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300'
          )}
        />
        <button
          onClick={initializePage}
          disabled={isLoading || isCheckingPermission}
          className={cn(
            'flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg',
            'bg-white border border-slate-200 text-slate-700',
            'hover:bg-slate-50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900/10',
            (isLoading || isCheckingPermission) && 'opacity-60 cursor-not-allowed'
          )}
          title="刷新系统变量与权限状态"
        >
          <RefreshCw className={cn('w-4 h-4', (isLoading || isCheckingPermission) && 'animate-spin')} />
          刷新
        </button>
        <button
          onClick={() => openEditModal()}
          disabled={isReadonly}
          className={cn(
            'flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg',
            'bg-slate-900 text-white',
            'hover:bg-slate-800 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900',
            isReadonly && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Plus className="w-4 h-4" />
          新建变量
        </button>
      </div>

      {(isLoading || isCheckingPermission) && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500">{isCheckingPermission ? '检查权限中...' : '加载中...'}</p>
        </div>
      )}

      {!isLoading && !isCheckingPermission && filteredVars.length > 0 && (
        <div className="space-y-3">
          {filteredVars.map((variable) => (
            <div
              key={variable.name}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h3 className={cn('font-mono font-medium text-slate-900', displayKeyFontClass)}>{variable.name}</h3>
                  {isPathVariable(variable.name) && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs text-blue-600 bg-blue-50 rounded">
                      PATH 变量
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyToClipboard(variable.value)}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      'text-slate-600 hover:bg-slate-100 transition-colors'
                    )}
                    title="复制值"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(variable)}
                    disabled={isReadonly}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      'text-slate-600 hover:bg-slate-100 transition-colors',
                      isReadonly && 'opacity-50 cursor-not-allowed'
                    )}
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(variable)}
                    disabled={isReadonly}
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      'text-red-600 hover:bg-red-50 transition-colors',
                      isReadonly && 'opacity-50 cursor-not-allowed'
                    )}
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                {isPathVariable(variable.name) ? (
                  <div className="space-y-1">
                    {splitPathValue(variable.value).map((path, idx) => (
                      <div key={idx} className={cn('font-mono text-slate-700 bg-white px-3 py-2 rounded border border-slate-200', displayValueFontClass)}>
                        {path}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn('font-mono text-slate-700 break-all', displayValueFontClass)}>{variable.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isCheckingPermission && filteredVars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-600 mb-4">{searchQuery ? '未找到匹配的变量' : '暂无系统变量'}</p>
          {!searchQuery && !isReadonly && (
            <button
              onClick={() => openEditModal()}
              className={cn(
                'flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg',
                'bg-slate-900 text-white hover:bg-slate-800'
              )}
            >
              <Plus className="w-4 h-4" />
              创建变量
            </button>
          )}
        </div>
      )}

      {showEditModal && editingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingVariable.isNew ? '新建系统变量' : '编辑系统变量'}
              </h2>
              <button onClick={closeEditModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">变量名</label>
                <input
                  type="text"
                  value={editingVariable.name}
                  onChange={(e) => setEditingVariable({ ...editingVariable, name: e.target.value })}
                  disabled={!editingVariable.isNew}
                  placeholder="例如: MY_SYSTEM_VAR"
                  className={cn(
                    'w-full h-10 px-3 font-mono',
                    modalKeyFontClass,
                    'bg-white border border-slate-200 rounded-lg',
                    'text-slate-900 placeholder:text-slate-400',
                    'focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300',
                    !editingVariable.isNew && 'bg-slate-50 cursor-not-allowed'
                  )}
                />
              </div>

              {isPathVariable(editingVariable.name) ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700">路径列表</label>
                    <button
                      onClick={addPathItem}
                      className={cn(
                        'flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-lg',
                        'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      )}
                    >
                      <Plus className="w-4 h-4" />
                      添加路径
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pathList.map((path, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={path}
                          onChange={(e) => updatePathItem(index, e.target.value)}
                          placeholder="例如: C:\\Program Files\\MyApp"
                          className={cn(
                            'flex-1 h-10 px-3 font-mono',
                            modalValueFontClass,
                            'bg-white border border-slate-200 rounded-lg',
                            'text-slate-900 placeholder:text-slate-400',
                            'focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300'
                          )}
                        />
                        <button
                          onClick={() => removePathItem(index)}
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            'text-red-600 hover:bg-red-50'
                          )}
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {pathList.length === 0 && (
                      <div className="text-center py-8 text-sm text-slate-500">
                        暂无路径，点击"添加路径"开始添加
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">变量值</label>
                  <textarea
                    value={editingVariable.value}
                    onChange={(e) => setEditingVariable({ ...editingVariable, value: e.target.value })}
                    placeholder="例如: C:\\Program Files\\MyApp"
                    rows={4}
                    className={cn(
                      'w-full px-3 py-2 font-mono',
                      modalValueFontClass,
                      'bg-white border border-slate-200 rounded-lg',
                      'text-slate-900 placeholder:text-slate-400',
                      'focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300',
                      'resize-none'
                    )}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={closeEditModal}
                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="h-10 px-4 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                {editingVariable.isNew ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && variableToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">确认删除</h2>
              </div>
              <button onClick={closeDeleteModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                确定要删除系统变量 <span className="font-semibold font-mono">{variableToDelete.name}</span> 吗？
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">当前值:</p>
                <p className="text-sm font-mono text-slate-700 break-all line-clamp-3">{variableToDelete.value}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={closeDeleteModal}
                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg',
              toast.type === 'success' && 'bg-white border border-slate-200 text-slate-900',
              toast.type === 'error' && 'bg-red-50 border border-red-200 text-red-900'
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
