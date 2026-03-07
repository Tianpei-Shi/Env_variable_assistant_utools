import { useState, useCallback } from 'react'
import { clampFontLevel } from '../utils/fontLevel'
import { LOG_POLICY } from '../utils/logPolicy'

const APP_SETTINGS_KEY = 'app-settings'
const BACKUP_PREFIX = 'app-backup-'
const LOCAL_BACKUPS_KEY = 'app-backups'
const USER_DOC_PREFIXES = ['user-group-', 'system-user-var-', 'trash-history-groups-', 'trash-history-user-vars-']
const SYSTEM_SNAPSHOT_KEY = '__SYSTEM_ENV_SNAPSHOT__'
const USER_SNAPSHOT_KEY = '__USER_ENV_SNAPSHOT__'
const ALLOWED_BACKUP_SCOPES = new Set(['user', 'system', 'all'])

const MANAGED_PREFIXES = [...USER_DOC_PREFIXES]

const DEFAULT_SETTINGS = {
  font: {
    displayKeySize: 2,
    displayValueSize: 2,
    modalKeySize: 2,
    modalValueSize: 2,
  },
  theme: {
    mode: 'system',
  },
  notifications: {
    desktopEnabled: false,
    inAppEnabled: true,
  },
  history: {
    autoCleanupEnabled: false,
    autoCleanupDays: 30,
  },
}

const HISTORY_DAYS_ALLOWED = new Set([3, 7, 30, 90, 180, 365])

function sortByCreatedAtDesc(list = []) {
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

const ALLOWED_THEME_MODES = new Set(['system', 'light', 'dark'])

function normalizeSettings(input = {}) {
  const font = input.font || {}
  const theme = input.theme || {}
  const notifications = input.notifications || {}
  const history = input.history || {}
  const autoCleanupDays = Number(history.autoCleanupDays)

  return {
    font: {
      displayKeySize: clampFontLevel(font.displayKeySize),
      displayValueSize: clampFontLevel(font.displayValueSize),
      modalKeySize: clampFontLevel(font.modalKeySize),
      modalValueSize: clampFontLevel(font.modalValueSize),
    },
    theme: {
      mode: ALLOWED_THEME_MODES.has(theme.mode) ? theme.mode : 'system',
    },
    notifications: {
      desktopEnabled: Boolean(notifications.desktopEnabled),
      inAppEnabled: notifications.inAppEnabled !== false,
    },
    history: {
      autoCleanupEnabled: Boolean(history.autoCleanupEnabled),
      autoCleanupDays: HISTORY_DAYS_ALLOWED.has(autoCleanupDays) ? autoCleanupDays : 30,
    },
  }
}

function deepMergeSettings(prev, next) {
  return normalizeSettings({
    ...prev,
    ...next,
    font: {
      ...(prev?.font || {}),
      ...(next?.font || {}),
    },
    theme: {
      ...(prev?.theme || {}),
      ...(next?.theme || {}),
    },
    notifications: {
      ...(prev?.notifications || {}),
      ...(next?.notifications || {}),
    },
    history: {
      ...(prev?.history || {}),
      ...(next?.history || {}),
    },
  })
}

function isManagedDocId(id) {
  if (id === SYSTEM_SNAPSHOT_KEY || id === USER_SNAPSHOT_KEY) return true
  if (id === APP_SETTINGS_KEY) return true
  return MANAGED_PREFIXES.some(prefix => id.startsWith(prefix))
}

function normalizeBackupScope(scope) {
  return ALLOWED_BACKUP_SCOPES.has(scope) ? scope : 'all'
}

export function useAppSettings() {
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS)
  const [backups, setBackups] = useState([])

  const loadAppSettings = useCallback(() => {
    try {
      let loaded = DEFAULT_SETTINGS

      if (window.utools && window.utools.db) {
        const doc = utools.db.get(APP_SETTINGS_KEY)
        if (doc?.data) {
          loaded = deepMergeSettings(DEFAULT_SETTINGS, doc.data)
        }
      } else {
        const raw = localStorage.getItem(APP_SETTINGS_KEY)
        if (raw) {
          loaded = deepMergeSettings(DEFAULT_SETTINGS, JSON.parse(raw))
        }
      }

      setAppSettings(loaded)
      return loaded
    } catch (error) {
      console.error('加载应用设置失败:', error)
      setAppSettings(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    }
  }, [])

  const updateAppSettings = useCallback((partial) => {
    try {
      let latest = appSettings
      setAppSettings(prev => {
        const merged = deepMergeSettings(prev, partial)
        latest = merged

        if (window.utools && window.utools.db) {
          const existing = utools.db.get(APP_SETTINGS_KEY)
          utools.db.put({
            _id: APP_SETTINGS_KEY,
            _rev: existing?._rev,
            data: merged,
          })
        } else {
          localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(merged))
        }

        return merged
      })

      return latest
    } catch (error) {
      console.error('更新应用设置失败:', error)
      return appSettings
    }
  }, [appSettings])

  const loadBackups = useCallback(() => {
    try {
      let loaded = []
      if (window.utools && window.utools.db) {
        loaded = utools.db
          .allDocs(BACKUP_PREFIX)
          .filter(doc => doc.data)
          .map(doc => ({
            ...doc.data,
            _id: doc._id,
            _rev: doc._rev,
          }))
        loaded = sortByCreatedAtDesc(loaded)
      } else {
        const raw = localStorage.getItem(LOCAL_BACKUPS_KEY)
        loaded = raw ? JSON.parse(raw) : []
        loaded = sortByCreatedAtDesc(loaded)
      }

      const maxBackups = Number(LOG_POLICY.maxBackups) || 30
      if (maxBackups > 0 && loaded.length > maxBackups) {
        const overflow = loaded.slice(maxBackups)
        const kept = loaded.slice(0, maxBackups)

        if (window.utools && window.utools.db) {
          overflow.forEach((item) => {
            try {
              const doc = item?._id ? utools.db.get(item._id) : null
              if (doc) {
                utools.db.remove(doc)
              }
            } catch (error) {
              console.error('清理超限备份失败:', error)
            }
          })
        } else {
          localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(kept))
        }

        loaded = kept
      }

      setBackups(loaded)
      return loaded
    } catch (error) {
      console.error('加载备份列表失败:', error)
      setBackups([])
      return []
    }
  }, [])

  const collectManagedDocs = useCallback((scope = 'all') => {
    const backupScope = normalizeBackupScope(scope)
    if (backupScope === 'system') {
      return []
    }

    if (!(window.utools && window.utools.db)) {
      const settingsRaw = localStorage.getItem(APP_SETTINGS_KEY)
      const baseDocs = [{
        _id: APP_SETTINGS_KEY,
        data: settingsRaw ? JSON.parse(settingsRaw) : DEFAULT_SETTINGS,
      }]
      return backupScope === 'all' ? baseDocs : []
    }

    const docs = []
    for (const prefix of USER_DOC_PREFIXES) {
      const prefixDocs = utools.db.allDocs(prefix)
      prefixDocs.forEach(doc => {
        docs.push({
          _id: doc._id,
          data: doc.data,
        })
      })
    }

    if (backupScope === 'all') {
      const settingsDoc = utools.db.get(APP_SETTINGS_KEY)
      if (settingsDoc?.data) {
        docs.push({
          _id: APP_SETTINGS_KEY,
          data: settingsDoc.data,
        })
      }
    }

    return docs
  }, [])

  const createBackupSnapshot = useCallback(async (options = {}) => {
    try {
      const backupScope = normalizeBackupScope(options.scope)
      const backupName = options.name?.trim()
      const backupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const docs = collectManagedDocs(backupScope)
      const envSnapshots = {}

      if (window.services && window.services.getAllEnvironmentVariables) {
        if (backupScope === 'user' || backupScope === 'all') {
          envSnapshots.user = await window.services.getAllEnvironmentVariables(false)
        }
        if (backupScope === 'system' || backupScope === 'all') {
          envSnapshots.system = await window.services.getAllEnvironmentVariables(true)
        }
      }

      const backup = {
        id: backupId,
        scope: backupScope,
        name: backupName || `手动备份(${backupScope === 'user' ? '用户' : backupScope === 'system' ? '系统' : '全部'}) ${new Date().toLocaleString('zh-CN')}`,
        createdAt: new Date().toISOString(),
        docs,
        envSnapshots,
        managedCount: docs.length,
      }

      if (window.utools && window.utools.db) {
        utools.db.put({
          _id: `${BACKUP_PREFIX}${backupId}`,
          data: backup,
        })
      } else {
        const current = loadBackups()
        const merged = sortByCreatedAtDesc([backup, ...current]).slice(0, LOG_POLICY.maxBackups)
        localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(merged))
      }

      loadBackups()
      return backup
    } catch (error) {
      console.error('创建备份失败:', error)
      return null
    }
  }, [collectManagedDocs, loadBackups])

  const restoreBackupSnapshot = useCallback(async (backupId) => {
    try {
      const selected = backups.find(item => item.id === backupId)
      if (!selected) return false
      const backupScope = normalizeBackupScope(selected.scope)

      if (backupScope === 'user' || backupScope === 'all') {
        if (window.utools && window.utools.db) {
          for (const prefix of USER_DOC_PREFIXES) {
            const docs = utools.db.allDocs(prefix)
            docs.forEach(doc => utools.db.remove(doc))
          }
        }
      }

      if (window.utools && window.utools.db) {
        if (backupScope === 'all') {
          const settingsDoc = utools.db.get(APP_SETTINGS_KEY)
          if (settingsDoc) {
            utools.db.remove(settingsDoc)
          }
        }

        for (const doc of selected.docs || []) {
          if (backupScope === 'user' && doc._id === APP_SETTINGS_KEY) {
            continue
          }
          const existing = utools.db.get(doc._id)
          utools.db.put({
            _id: doc._id,
            _rev: existing?._rev,
            data: doc.data,
          })
        }
      } else {
        if (backupScope === 'all') {
          const settingsDoc = (selected.docs || []).find(doc => doc._id === APP_SETTINGS_KEY)
          if (settingsDoc?.data) {
            localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsDoc.data))
          }
        }
      }

      if (window.services && window.services.setEnvironmentVariable) {
        let hasEnvUpdates = false

        const userSnapshot = selected.envSnapshots?.user || null
        if ((backupScope === 'user' || backupScope === 'all') && userSnapshot) {
          for (const [key, value] of Object.entries(userSnapshot)) {
            if (!key) continue
            try {
              await window.services.setEnvironmentVariable(key, value ?? '', false)
              hasEnvUpdates = true
            } catch (error) {
              console.error(`还原用户变量 ${key} 到系统失败:`, error)
            }
          }
        } else if (backupScope === 'user' || backupScope === 'all') {
          for (const doc of selected.docs || []) {
            if (doc._id.startsWith('system-user-var-') && doc.data?.name) {
              try {
                await window.services.setEnvironmentVariable(doc.data.name, doc.data.value || '', false)
                hasEnvUpdates = true
              } catch (error) {
                console.error(`还原用户变量 ${doc.data.name} 到系统失败:`, error)
              }
            }

            if (doc._id.startsWith('user-group-') && doc.data?.isActive && Array.isArray(doc.data.variables)) {
              for (const variable of doc.data.variables) {
                if (!variable?.name) continue
                try {
                  await window.services.setEnvironmentVariable(variable.name, variable.value || '', false)
                  hasEnvUpdates = true
                } catch (error) {
                  console.error(`还原激活组变量 ${variable.name} 到系统失败:`, error)
                }
              }
            }
          }
        }

        const systemSnapshot = selected.envSnapshots?.system || null
        if ((backupScope === 'system' || backupScope === 'all') && systemSnapshot) {
          for (const [key, value] of Object.entries(systemSnapshot)) {
            if (!key) continue
            try {
              await window.services.setEnvironmentVariable(key, value ?? '', true)
              hasEnvUpdates = true
            } catch (error) {
              console.error(`还原系统变量 ${key} 失败:`, error)
            }
          }
        }

        if (hasEnvUpdates && window.services.refreshEnvironment) {
          try {
            await window.services.refreshEnvironment()
          } catch (error) {
            console.error('刷新系统环境变量失败:', error)
          }
        }
      }

      loadAppSettings()
      return true
    } catch (error) {
      console.error('还原备份失败:', error)
      return false
    }
  }, [backups, loadAppSettings])

  const deleteBackupSnapshot = useCallback((backupId) => {
    try {
      if (window.utools && window.utools.db) {
        const doc = utools.db.get(`${BACKUP_PREFIX}${backupId}`)
        if (doc) {
          utools.db.remove(doc)
        }
      } else {
        const current = loadBackups()
        const next = current.filter(item => item.id !== backupId)
        localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(next))
      }
      setBackups(prev => prev.filter(item => item.id !== backupId))
      return true
    } catch (error) {
      console.error('删除备份失败:', error)
      return false
    }
  }, [loadBackups])

  const importBackupSnapshot = useCallback((input) => {
    try {
      const backupData = input?.type === 'env-assistant-backup' ? input.backup : input
      if (!backupData || (!Array.isArray(backupData.docs) && !backupData.envSnapshots)) {
        throw new Error('备份内容格式不正确')
      }

      const sanitizedDocs = Array.isArray(backupData.docs)
        ? backupData.docs.filter(doc => doc?._id && doc.data && isManagedDocId(doc._id))
        : []
      const backupScope = normalizeBackupScope(backupData.scope)
      const backupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const imported = {
        id: backupId,
        scope: backupScope,
        name: backupData.name ? `导入: ${backupData.name}` : `导入备份 ${new Date().toLocaleString('zh-CN')}`,
        createdAt: new Date().toISOString(),
        docs: sanitizedDocs,
        envSnapshots: {
          user: backupData?.envSnapshots?.user || null,
          system: backupData?.envSnapshots?.system || null,
        },
        managedCount: sanitizedDocs.length,
      }

      if (window.utools && window.utools.db) {
        utools.db.put({
          _id: `${BACKUP_PREFIX}${backupId}`,
          data: imported,
        })
      } else {
        const current = loadBackups()
        const merged = sortByCreatedAtDesc([imported, ...current]).slice(0, LOG_POLICY.maxBackups)
        localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(merged))
      }

      loadBackups()
      return imported
    } catch (error) {
      console.error('导入备份失败:', error)
      return null
    }
  }, [loadBackups])

  return {
    appSettings,
    loadAppSettings,
    updateAppSettings,
    backups,
    loadBackups,
    createBackupSnapshot,
    restoreBackupSnapshot,
    deleteBackupSnapshot,
    importBackupSnapshot,
  }
}

export default useAppSettings
