import { useState, useCallback } from 'react'
import { LOG_POLICY } from '../utils/logPolicy'

function getTrashPrefix(tabType) {
  return `trash-history-${tabType}-`
}

export function clearTrashRecordsByType(tabType, options = {}) {
  try {
    if (!(window.utools && window.utools.db)) {
      return 0
    }

    const trashPrefix = getTrashPrefix(tabType)
    const allDocs = utools.db
      .allDocs(trashPrefix)
      .filter(doc => doc?.data)
      .sort((a, b) => new Date(b.data?.timestamp || 0) - new Date(a.data?.timestamp || 0))
    let deletedCount = 0

    if (options.enabled) {
      const cleanupDays = Number(options.days) || 30
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - cleanupDays)
      const cutoffTimestamp = cutoffDate.toISOString()

      for (const doc of allDocs) {
        if (doc.data?.timestamp && doc.data.timestamp < cutoffTimestamp) {
          utools.db.remove(doc)
          deletedCount++
        }
      }
    }

    const maxRecords = Number(options.maxRecords) || LOG_POLICY.maxTrashRecordsPerType
    if (maxRecords > 0) {
      const latestDocs = utools.db
        .allDocs(trashPrefix)
        .filter(doc => doc?.data)
        .sort((a, b) => new Date(b.data?.timestamp || 0) - new Date(a.data?.timestamp || 0))

      if (latestDocs.length > maxRecords) {
        latestDocs.slice(maxRecords).forEach((doc) => {
          utools.db.remove(doc)
          deletedCount++
        })
      }
    }

    return deletedCount
  } catch (error) {
    console.error(`清理 ${tabType} 历史记录失败:`, error)
    return 0
  }
}

/**
 * Hook for managing trash history records
 * Stores deleted/edited environment variables for potential restoration
 */
export function useTrashHistory(tabType) {
  const [records, setRecords] = useState([])

  const TRASH_PREFIX = getTrashPrefix(tabType)

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

        const latest = loaded.slice(0, LOG_POLICY.maxTrashRecordsPerType)
        setRecords(latest)

        return latest
      }
      return []
    } catch (error) {
      console.error('加载历史记录失败:', error)
      return []
    }
  }, [TRASH_PREFIX])

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
        clearTrashRecordsByType(tabType, {
          enabled: false,
          maxRecords: LOG_POLICY.maxTrashRecordsPerType,
        })
      }

      setRecords(prev => [fullRecord, ...prev].slice(0, LOG_POLICY.maxTrashRecordsPerType))
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

  // Clear all records for current tab type
  const clearAllTrash = useCallback(() => {
    try {
      if (window.utools && window.utools.db) {
        const allDocs = utools.db.allDocs(TRASH_PREFIX)
        allDocs.forEach((doc) => {
          try {
            utools.db.remove(doc)
          } catch (error) {
            console.error('清空历史记录文档失败:', error)
          }
        })
      }

      setRecords([])
      return true
    } catch (error) {
      console.error('清空历史记录失败:', error)
      return false
    }
  }, [TRASH_PREFIX])

  // Clear old records based on external settings
  const clearOldRecords = useCallback((options = {}) => {
    try {
      const deletedCount = clearTrashRecordsByType(tabType, {
        enabled: options.enabled,
        days: options.days,
        maxRecords: options.maxRecords ?? LOG_POLICY.maxTrashRecordsPerType,
      })

      if (deletedCount > 0) {
        loadRecords()
      }

      return deletedCount
    } catch (error) {
      console.error('清理旧记录失败:', error)
      return 0
    }
  }, [tabType, loadRecords])

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
    loadRecords,
    addToTrash,
    deleteFromTrash,
    clearAllTrash,
    clearOldRecords,
    getRecordCount,
  }
}

export default useTrashHistory
