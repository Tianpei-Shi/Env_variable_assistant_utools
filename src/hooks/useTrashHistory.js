import { useState, useCallback } from 'react'

/**
 * Hook for managing trash history records
 * Stores deleted/edited environment variables for potential restoration
 */
export function useTrashHistory(tabType) {
  const [records, setRecords] = useState([])
  const [settings, setSettings] = useState({ autoCleanupDays: 30 })

  const TRASH_PREFIX = `trash-history-${tabType}-`
  const SETTINGS_KEY = `trash-settings-${tabType}`

  // Load records from database
  const loadRecords = useCallback(() => {
    try {
      if (window.utools && window.utools.db) {
        const allDocs = utools.db.allDocs(TRASH_PREFIX)
        const loaded = allDocs
          .filter(doc => doc.data)
          .map(doc => ({
            ...doc.data,
            _id: doc._id,
            _rev: doc._rev,
          }))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        
        setRecords(loaded)
        
        // Load settings
        const settingsDoc = utools.db.get(SETTINGS_KEY)
        if (settingsDoc && settingsDoc.data) {
          setSettings(settingsDoc.data)
        }
        
        return loaded
      }
      return []
    } catch (error) {
      console.error('加载历史记录失败:', error)
      return []
    }
  }, [TRASH_PREFIX, SETTINGS_KEY])

  // Add a record to trash history
  const addToTrash = useCallback((record) => {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const fullRecord = {
        id,
        tabType,
        timestamp: new Date().toISOString(),
        ...record,
      }

      if (window.utools && window.utools.db) {
        utools.db.put({
          _id: `${TRASH_PREFIX}${id}`,
          data: fullRecord,
        })
      }

      setRecords(prev => [fullRecord, ...prev])
      return true
    } catch (error) {
      console.error('添加历史记录失败:', error)
      return false
    }
  }, [tabType, TRASH_PREFIX])

  // Delete a record permanently
  const deleteFromTrash = useCallback((recordId) => {
    try {
      if (window.utools && window.utools.db) {
        const doc = utools.db.get(`${TRASH_PREFIX}${recordId}`)
        if (doc) {
          utools.db.remove(doc)
        }
      }

      setRecords(prev => prev.filter(r => r.id !== recordId))
      return true
    } catch (error) {
      console.error('删除历史记录失败:', error)
      return false
    }
  }, [TRASH_PREFIX])

  // Clear old records based on settings
  const clearOldRecords = useCallback(() => {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - settings.autoCleanupDays)
      const cutoffTimestamp = cutoffDate.toISOString()

      if (window.utools && window.utools.db) {
        const allDocs = utools.db.allDocs(TRASH_PREFIX)
        let deletedCount = 0
        
        for (const doc of allDocs) {
          if (doc.data && doc.data.timestamp < cutoffTimestamp) {
            utools.db.remove(doc)
            deletedCount++
          }
        }

        if (deletedCount > 0) {
          setRecords(prev => prev.filter(r => r.timestamp >= cutoffTimestamp))
        }
        
        return deletedCount
      }
      return 0
    } catch (error) {
      console.error('清理旧记录失败:', error)
      return 0
    }
  }, [TRASH_PREFIX, settings.autoCleanupDays])

  // Update auto-cleanup settings
  const updateSettings = useCallback((newSettings) => {
    try {
      const merged = { ...settings, ...newSettings }
      
      if (window.utools && window.utools.db) {
        const existing = utools.db.get(SETTINGS_KEY)
        utools.db.put({
          _id: SETTINGS_KEY,
          _rev: existing?._rev,
          data: merged,
        })
      }

      setSettings(merged)
      return true
    } catch (error) {
      console.error('更新设置失败:', error)
      return false
    }
  }, [SETTINGS_KEY, settings])

  // Get record count
  const getRecordCount = useCallback(() => {
    if (window.utools && window.utools.db) {
      const allDocs = utools.db.allDocs(TRASH_PREFIX)
      return allDocs.length
    }
    return records.length
  }, [TRASH_PREFIX, records.length])

  return {
    records,
    settings,
    loadRecords,
    addToTrash,
    deleteFromTrash,
    clearOldRecords,
    updateSettings,
    getRecordCount,
  }
}

export default useTrashHistory
