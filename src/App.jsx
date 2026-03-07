import { useEffect, useState, useCallback } from 'react'
import EnvVarManager from './EnvVarManager'
import SystemUserVariables from './SystemUserVariables'
import SystemVariables from './SystemVariables'
import TrashHistoryPage from './TrashHistoryPage'
import SettingsPage from './SettingsPage'
import { cn } from './utils/cn'
import { History, Settings } from 'lucide-react'
import { useAppSettings } from './hooks/useAppSettings'
import { useTheme } from './hooks/useTheme'
import { clearTrashRecordsByType } from './hooks/useTrashHistory'
import { LOG_POLICY } from './utils/logPolicy'

export default function App() {
  const [enterAction, setEnterAction] = useState({})
  const [route, setRoute] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState('groups')
  const [trashView, setTrashView] = useState(null)
  const [showSettingsPage, setShowSettingsPage] = useState(false)
  const [historyCleanupTick, setHistoryCleanupTick] = useState(0)

  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const {
    appSettings,
    loadAppSettings,
    updateAppSettings,
    backups,
    loadBackups,
    createBackupSnapshot,
    restoreBackupSnapshot,
    deleteBackupSnapshot,
    importBackupSnapshot,
  } = useAppSettings()

  useTheme(appSettings?.theme?.mode)

  useEffect(() => {
    if (window.utools) {
      window.utools.onPluginEnter((action) => {
        setRoute(action.code)
        setEnterAction(action)
        setIsReady(true)
      })
      window.utools.onPluginOut(() => {
        setRoute('')
      })
    } else {
      setRoute('envvar')
      setIsReady(true)
    }
  }, [])

  useEffect(() => {
    loadAppSettings()
    loadBackups()
  }, [loadAppSettings, loadBackups])

  useEffect(() => {
    if (route !== 'envvar') return

    const cleanupOptions = {
      enabled: appSettings?.history?.autoCleanupEnabled,
      days: appSettings?.history?.autoCleanupDays,
      maxRecords: LOG_POLICY.maxTrashRecordsPerType,
    }

    const runAutoCleanup = () => {
      const deletedGroups = clearTrashRecordsByType('groups', cleanupOptions)
      const deletedUserVars = clearTrashRecordsByType('user-vars', cleanupOptions)
      const deletedSystemVars = clearTrashRecordsByType('system-vars', cleanupOptions)
      if (deletedGroups + deletedUserVars + deletedSystemVars > 0) {
        setHistoryCleanupTick(prev => prev + 1)
      }
    }

    runAutoCleanup()
    const timerId = setInterval(runAutoCleanup, LOG_POLICY.autoCleanupIntervalMs)
    return () => clearInterval(timerId)
  }, [route, appSettings?.history?.autoCleanupEnabled, appSettings?.history?.autoCleanupDays])

  const openTrashView = useCallback((tabType) => {
    setTrashView(tabType)
  }, [])

  const closeTrashView = useCallback(() => {
    setTrashView(null)
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const openSettingsPage = useCallback(() => {
    setShowSettingsPage(true)
  }, [])

  const closeSettingsPage = useCallback(() => {
    setShowSettingsPage(false)
  }, [])

  const handleSettingsDataChanged = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const handleRestore = useCallback(async (record) => {
    try {
      const isSystemScope = record.tabType === 'system-vars'
      const dbPrefix = record.tabType === 'groups' ? 'user-group-'
        : record.tabType === 'system-vars' ? 'system-var-'
        : 'system-user-var-'

      if (record.action === 'delete') {
        if (record.tabType === 'groups') {
          if (window.utools?.db) {
            const groupId = record.data.id || `group-${Date.now()}`
            const existing = utools.db.get(`${dbPrefix}${groupId}`)
            const groupDataToSave = { ...record.data }
            delete groupDataToSave.id
            delete groupDataToSave._rev
            utools.db.put({
              _id: `${dbPrefix}${groupId}`,
              _rev: existing?._rev,
              data: { ...groupDataToSave, isActive: false, updatedAt: new Date().toISOString() }
            })
          }
        } else {
          if (window.services?.setEnvironmentVariable) {
            await window.services.setEnvironmentVariable(record.name, record.data.value, isSystemScope)
            await window.services.refreshEnvironment()
          }
          if (window.utools?.db) {
            const existingVar = utools.db.get(`${dbPrefix}${record.name}`)
            utools.db.put({
              _id: `${dbPrefix}${record.name}`,
              _rev: existingVar?._rev,
              data: {
                name: record.name, value: record.data.value,
                isSystemOriginal: false,
                createdAt: existingVar?.data?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            })
          }
        }
      } else if (record.action === 'edit' && record.originalData) {
        if (record.tabType === 'groups') {
          const groupId = record.data.id
          if (window.utools?.db && groupId) {
            const existing = utools.db.get(`${dbPrefix}${groupId}`)
            if (existing) {
              utools.db.put({
                _id: existing._id, _rev: existing._rev,
                data: { ...record.originalData, updatedAt: new Date().toISOString() }
              })
            }
          }
        } else {
          if (window.services?.setEnvironmentVariable) {
            const originalValue = record.originalData.value || record.originalData
            await window.services.setEnvironmentVariable(record.name, originalValue, isSystemScope)
            await window.services.refreshEnvironment()
          }
        }
      } else if (record.action === 'create') {
        if (record.tabType === 'groups') {
          const groupId = record.data?.id
          if (window.utools?.db && groupId) {
            const existing = utools.db.get(`user-group-${groupId}`)
            if (existing) {
              if (existing.data?.isActive && window.services?.removeEnvironmentVariable) {
                for (const v of existing.data.variables || []) {
                  if (v.name) { try { await window.services.removeEnvironmentVariable(v.name) } catch {} }
                }
                try { await window.services.refreshEnvironment() } catch {}
              }
              utools.db.remove(existing)
            }
          }
        } else {
          if (window.services?.removeEnvironmentVariable) {
            try {
              await window.services.removeEnvironmentVariable(record.name, isSystemScope)
              await window.services.refreshEnvironment()
            } catch {}
          }
          if (window.utools?.db) {
            const doc = utools.db.get(`${dbPrefix}${record.name}`)
            if (doc) utools.db.remove(doc)
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
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
        正在加载...
      </div>
    )
  }

  if (route === 'envvar') {
    if (trashView) {
      return (
        <TrashHistoryPage
          tabType={trashView}
          onBack={closeTrashView}
          onRestore={handleRestore}
          appSettings={appSettings}
          notificationSettings={appSettings.notifications}
          cleanupTick={historyCleanupTick}
        />
      )
    }

    if (showSettingsPage) {
      return (
        <SettingsPage
          onBack={closeSettingsPage}
          appSettings={appSettings}
          onUpdateAppSettings={updateAppSettings}
          backups={backups}
          onLoadBackups={loadBackups}
          onCreateBackup={createBackupSnapshot}
          onRestoreBackup={restoreBackupSnapshot}
          onDeleteBackup={deleteBackupSnapshot}
          onImportBackup={importBackupSnapshot}
          onDataChanged={handleSettingsDataChanged}
        />
      )
    }

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-slate-900">
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between py-3 gap-3">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setActiveTab('groups')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'groups'
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  自定义用户变量
                </button>

                <button
                  onClick={() => setActiveTab('user-vars')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'user-vars'
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  用户变量
                </button>

                <button
                  onClick={() => setActiveTab('system-vars')}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    activeTab === 'system-vars'
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  系统变量
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {(activeTab === 'groups' || activeTab === 'user-vars' || activeTab === 'system-vars') && (
                  <button
                    onClick={() => openTrashView(activeTab)}
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    )}
                    title="操作历史"
                  >
                    <History className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={openSettingsPage}
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  )}
                  title="设置中心"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto">
          {activeTab === 'groups' && (
            <EnvVarManager
              enterAction={enterAction}
              onOpenTrash={() => openTrashView('groups')}
              refreshTrigger={refreshTrigger}
              fontSettings={appSettings.font}
              notificationSettings={appSettings.notifications}
            />
          )}
          {activeTab === 'user-vars' && (
            <SystemUserVariables
              onOpenTrash={() => openTrashView('user-vars')}
              refreshTrigger={refreshTrigger}
              fontSettings={appSettings.font}
              notificationSettings={appSettings.notifications}
            />
          )}
          {activeTab === 'system-vars' && (
            <SystemVariables
              onOpenTrash={() => openTrashView('system-vars')}
              refreshTrigger={refreshTrigger}
              fontSettings={appSettings.font}
              notificationSettings={appSettings.notifications}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-screen bg-zinc-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
      请在utools中使用此插件
    </div>
  )
}
