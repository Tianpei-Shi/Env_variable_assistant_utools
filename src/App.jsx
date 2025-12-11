import { useEffect, useState, useCallback } from 'react'
import EnvVarManager from './EnvVarManager'
import SystemUserVariables from './SystemUserVariables'
import SystemVariables from './SystemVariables'
import TrashHistoryPage from './TrashHistoryPage'
import { cn } from './utils/cn'
import { History } from 'lucide-react'

export default function App() {
  const [enterAction, setEnterAction] = useState({})
  const [route, setRoute] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState('groups') // 'groups' | 'user-vars' | 'system-vars'
  const [trashView, setTrashView] = useState(null) // 'groups' | 'user-vars' | null

  // Refresh triggers for child components
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    // 检查utools是否可用
    if (window.utools) {
      window.utools.onPluginEnter((action) => {
        setRoute(action.code)
        setEnterAction(action)
        setIsReady(true)
      })
      window.utools.onPluginOut((isKill) => {
        setRoute('')
      })
    } else {
      // 开发环境下直接显示组件
      setRoute('envvar')
      setIsReady(true)
    }
  }, [])

  const openTrashView = useCallback((tabType) => {
    setTrashView(tabType)
  }, [])

  const closeTrashView = useCallback(() => {
    setTrashView(null)
    // Trigger refresh in child components after restore
    setRefreshTrigger(prev => prev + 1)
  }, [])

  // Handle restore from trash - this will be passed to TrashHistoryPage
  const handleRestore = useCallback(async (record) => {
    try {
      const prefix = record.tabType === 'groups' ? 'user-group-' : 'system-user-var-'

      if (record.action === 'delete') {
        // Restore deleted item
        if (window.utools && window.utools.db) {
          const data = record.data
          if (record.tabType === 'groups') {
            // Restore group
            const groupId = record.data.id || `group-${Date.now()}`
            utools.db.put({
              _id: `${prefix}${groupId}`,
              data: {
                ...data,
                isActive: false, // Always restore as inactive
                updatedAt: new Date().toISOString(),
              }
            })
          } else {
            // Restore user variable
            if (window.services && window.services.setEnvironmentVariable) {
              await window.services.setEnvironmentVariable(record.name, record.data.value, false)
              await window.services.refreshEnvironment()
            }
            utools.db.put({
              _id: `${prefix}${record.name}`,
              data: {
                name: record.name,
                value: record.data.value,
                isSystemOriginal: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            })
          }
        }
      } else if (record.action === 'edit' && record.originalData) {
        // Restore to original value before edit
        if (record.tabType === 'groups') {
          const groupId = record.data.id
          if (window.utools && window.utools.db && groupId) {
            const existing = utools.db.get(`${prefix}${groupId}`)
            if (existing) {
              utools.db.put({
                _id: existing._id,
                _rev: existing._rev,
                data: {
                  ...record.originalData,
                  updatedAt: new Date().toISOString(),
                }
              })
            }
          }
        } else {
          // Restore user variable to original value
          if (window.services && window.services.setEnvironmentVariable) {
            const originalValue = record.originalData.value || record.originalData
            await window.services.setEnvironmentVariable(record.name, originalValue, false)
            await window.services.refreshEnvironment()
          }
        }
      }

      return true
    } catch (error) {
      console.error('还原失败:', error)
      return false
    }
  }, [])

  if (!isReady) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>正在加载...</div>
  }

  if (route === 'envvar') {
    // Show trash history page if active
    if (trashView) {
      return (
        <TrashHistoryPage
          tabType={trashView}
          onBack={closeTrashView}
          onRestore={handleRestore}
        />
      )
    }

    return (
      <div className="min-h-screen bg-zinc-50">
        {/* Tab Navigation */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('groups')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'groups'
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  自定义变量组
                </button>

                <button
                  onClick={() => setActiveTab('user-vars')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'user-vars'
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  用户变量
                </button>

                <button
                  onClick={() => setActiveTab('system-vars')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'system-vars'
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  系统变量
                </button>
              </div>

              {/* History Button - only for groups and user-vars tabs */}
              {(activeTab === 'groups' || activeTab === 'user-vars') && (
                <button
                  onClick={() => openTrashView(activeTab)}
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    "text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  )}
                  title="操作历史"
                >
                  <History className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'groups' && (
            <EnvVarManager
              enterAction={enterAction}
              onOpenTrash={() => openTrashView('groups')}
              refreshTrigger={refreshTrigger}
            />
          )}
          {activeTab === 'user-vars' && (
            <SystemUserVariables
              onOpenTrash={() => openTrashView('user-vars')}
              refreshTrigger={refreshTrigger}
            />
          )}
          {activeTab === 'system-vars' && <SystemVariables />}
        </div>
      </div>
    )
  }

  return <div style={{ padding: '20px', textAlign: 'center' }}>请在utools中使用此插件</div>
}
