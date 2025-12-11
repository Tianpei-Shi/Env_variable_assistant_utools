import { useState, useEffect } from "react";
import { Plus, Copy, Trash2, Edit2, X, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "./utils/cn";
import { useTrashHistory } from "./hooks/useTrashHistory";

export default function SystemUserVariables({ onOpenTrash, refreshTrigger }) {
  // Trash history hook
  const { addToTrash } = useTrashHistory('user-vars')
  const [userVariables, setUserVariables] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingVariable, setEditingVariable] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [variableToDelete, setVariableToDelete] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // 编辑 PATH 变量时的路径列表
  const [pathList, setPathList] = useState([]);

  useEffect(() => {
    loadSystemUserVariables();
  }, []);

  // Reload when refreshTrigger changes (after restore from trash)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadSystemUserVariables();
    }
  }, [refreshTrigger]);

  const loadSystemUserVariables = async () => {
    setIsLoading(true);
    try {
      const prefix = "system-user-var-";
      let dbVars = [];

      if (window.utools && window.utools.db) {
        const allDocs = utools.db.allDocs(prefix);
        dbVars = allDocs.map((doc) => ({
          ...doc.data,
          _id: doc._id,
          _rev: doc._rev,
        }));
      }

      if (window.services && window.services.getAllEnvironmentVariables) {
        const systemVars = await window.services.getAllEnvironmentVariables(false);
        const mergedVars = [];
        const systemVarNames = new Set(Object.keys(systemVars));

        for (const dbVar of dbVars) {
          if (systemVarNames.has(dbVar.name)) {
            mergedVars.push({
              ...dbVar,
              value: systemVars[dbVar.name],
              exists: true,
            });
          } else {
            if (window.utools && window.utools.db) {
              try {
                utools.db.remove(`${prefix}${dbVar.name}`);
              } catch (error) {
                console.error(`清理变量 ${dbVar.name} 失败:`, error);
              }
            }
          }
        }

        for (const [name, value] of Object.entries(systemVars)) {
          const existsInDb = dbVars.some(v => v.name === name);
          if (!existsInDb) {
            const newVar = {
              name,
              value,
              isSystemOriginal: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              exists: true,
            };

            if (window.utools && window.utools.db) {
              try {
                utools.db.put({
                  _id: `${prefix}${name}`,
                  data: newVar,
                });
              } catch (error) {
                console.error(`保存变量 ${name} 失败:`, error);
              }
            }

            mergedVars.push(newVar);
          }
        }

        setUserVariables(mergedVars.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const mockVars = [
          { name: "PATH", value: "C:\\Windows\\System32;C:\\Program Files", exists: true, isSystemOriginal: true },
          { name: "TEMP", value: "C:\\Users\\User\\AppData\\Local\\Temp", exists: true, isSystemOriginal: true },
        ];
        setUserVariables(mockVars);
      }
    } catch (error) {
      console.error("加载用户变量失败:", error);
      showToast("加载失败: " + error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const saveVariable = async (name, value, isNew = false, originalVariable = null) => {
    try {
      const prefix = "system-user-var-";

      // Track edit operation in trash history (only for edits, not new variables)
      if (!isNew && originalVariable) {
        addToTrash({
          action: 'edit',
          itemType: 'variable',
          name: name,
          data: { name, value },
          originalData: { name: originalVariable.name, value: originalVariable.value },
        })
      }

      if (window.services && window.services.setEnvironmentVariable) {
        await window.services.setEnvironmentVariable(name, value, false);
        await window.services.refreshEnvironment();
      }

      if (window.utools && window.utools.db) {
        const existing = isNew ? null : utools.db.get(`${prefix}${name}`);
        utools.db.put({
          _id: `${prefix}${name}`,
          _rev: existing?._rev,
          data: {
            name,
            value,
            isSystemOriginal: !isNew,
            createdAt: existing?.data?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }

      await loadSystemUserVariables();
      showToast(isNew ? "变量已创建" : "变量已更新", "success");
    } catch (error) {
      showToast("保存失败: " + error.message, "error");
    }
  };

  const deleteVariable = async (variable) => {
    try {
      // Track delete operation in trash history
      addToTrash({
        action: 'delete',
        itemType: 'variable',
        name: variable.name,
        data: { name: variable.name, value: variable.value },
      })

      if (window.services && window.services.removeEnvironmentVariable) {
        await window.services.removeEnvironmentVariable(variable.name, false);
        await window.services.refreshEnvironment();
      }

      if (window.utools && window.utools.db && variable._id) {
        const doc = utools.db.get(variable._id);
        if (doc) {
          utools.db.remove(doc);
        }
      }

      await loadSystemUserVariables();
      showToast("变量已删除", "success");
    } catch (error) {
      showToast("删除失败: " + error.message, "error");
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      if (window.utools && window.utools.copyText) {
        window.utools.copyText(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      showToast("已复制", "success");
    } catch (error) {
      showToast("复制失败", "error");
    }
  };

  const isPathVariable = (name) => {
    return name.toUpperCase() === 'PATH';
  };

  const splitPathValue = (value) => {
    if (!value || typeof value !== "string") return [];
    const separator = value.includes(";") ? ";" : ":";
    return value.split(separator).filter((p) => p && p.trim());
  };

  const openEditModal = (variable = null) => {
    if (variable) {
      setEditingVariable({ ...variable, isNew: false });
      // 如果是 PATH 变量，解析为路径列表
      if (isPathVariable(variable.name)) {
        setPathList(splitPathValue(variable.value));
      } else {
        setPathList([]);
      }
    } else {
      setEditingVariable({ name: "", value: "", isNew: true });
      setPathList([]);
    }
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setEditingVariable(null);
    setShowEditModal(false);
    setPathList([]);
  };

  const handleSaveEdit = async () => {
    if (!editingVariable.name || (!editingVariable.value && pathList.length === 0)) {
      showToast("名称和值不能为空", "error");
      return;
    }

    // 如果是 PATH 变量，从路径列表构建值
    const finalValue = isPathVariable(editingVariable.name)
      ? pathList.filter(p => p.trim()).join(";")
      : editingVariable.value;

    // Get the original variable for tracking edits
    const originalVar = editingVariable.isNew ? null : userVariables.find(v => v.name === editingVariable.name);
    await saveVariable(editingVariable.name, finalValue, editingVariable.isNew, originalVar);
    closeEditModal();
  };

  const openDeleteModal = (variable) => {
    setVariableToDelete(variable);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setVariableToDelete(null);
    setShowDeleteModal(false);
  };

  const handleConfirmDelete = async () => {
    if (variableToDelete) {
      await deleteVariable(variableToDelete);
      closeDeleteModal();
    }
  };

  // PATH 编辑相关函数
  const addPathItem = () => {
    setPathList([...pathList, ""]);
  };

  const removePathItem = (index) => {
    setPathList(pathList.filter((_, i) => i !== index));
  };

  const updatePathItem = (index, value) => {
    const newList = [...pathList];
    newList[index] = value;
    setPathList(newList);
  };

  const filteredVars = userVariables.filter((v) => {
    if (!v || !v.name || v.value == null) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return v.name.toLowerCase().includes(query) || String(v.value).toLowerCase().includes(query);
  });

  return (
    <div className="p-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">原用户环境变量</h1>
        <p className="text-sm text-slate-500">管理 Windows 用户级环境变量 · {filteredVars.length} 个</p>
      </div>

      {/* Search & Actions */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索变量名或值..."
          className={cn(
            "flex-1 h-10 px-4 text-sm",
            "bg-white border border-slate-200 rounded-lg",
            "text-slate-900 placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          )}
        />
        <button
          onClick={() => openEditModal()}
          className={cn(
            "flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg",
            "bg-slate-900 text-white",
            "hover:bg-slate-800 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
          )}
        >
          <Plus className="w-4 h-4" />
          新建变量
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      )}

      {/* Variables List */}
      {!isLoading && filteredVars.length > 0 && (
        <div className="space-y-3">
          {filteredVars.map((variable) => (
            <div
              key={variable.name}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h3 className="font-mono text-sm font-medium text-slate-900">{variable.name}</h3>
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
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      "text-slate-600 hover:bg-slate-100 transition-colors"
                    )}
                    title="复制"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(variable)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      "text-slate-600 hover:bg-slate-100 transition-colors"
                    )}
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(variable)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      "text-red-600 hover:bg-red-50 transition-colors"
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
                      <div key={idx} className="font-mono text-xs text-slate-700 bg-white px-3 py-2 rounded border border-slate-200">
                        {path}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="font-mono text-xs text-slate-700 break-all">{variable.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredVars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-600 mb-4">{searchQuery ? "未找到匹配的变量" : "暂无环境变量"}</p>
          {!searchQuery && (
            <button
              onClick={() => openEditModal()}
              className={cn(
                "flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg",
                "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              <Plus className="w-4 h-4" />
              创建变量
            </button>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingVariable.isNew ? "新建变量" : "编辑变量"}
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
                  placeholder="例如: MY_VAR"
                  className={cn(
                    "w-full h-10 px-3 text-sm font-mono",
                    "bg-white border border-slate-200 rounded-lg",
                    "text-slate-900 placeholder:text-slate-400",
                    "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                    !editingVariable.isNew && "bg-slate-50 cursor-not-allowed"
                  )}
                />
              </div>

              {isPathVariable(editingVariable.name) ? (
                // PATH 变量：使用路径列表编辑
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700">路径列表</label>
                    <button
                      onClick={addPathItem}
                      className={cn(
                        "flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-lg",
                        "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
                          placeholder="例如: C:\Program Files\MyApp"
                          className={cn(
                            "flex-1 h-10 px-3 text-sm font-mono",
                            "bg-white border border-slate-200 rounded-lg",
                            "text-slate-900 placeholder:text-slate-400",
                            "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                          )}
                        />
                        <button
                          onClick={() => removePathItem(index)}
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            "text-red-600 hover:bg-red-50"
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
                // 普通变量：使用文本框编辑
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">变量值</label>
                  <textarea
                    value={editingVariable.value}
                    onChange={(e) => setEditingVariable({ ...editingVariable, value: e.target.value })}
                    placeholder="例如: C:\Program Files\MyApp"
                    rows={4}
                    className={cn(
                      "w-full px-3 py-2 text-sm font-mono",
                      "bg-white border border-slate-200 rounded-lg",
                      "text-slate-900 placeholder:text-slate-400",
                      "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300",
                      "resize-none"
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
                {editingVariable.isNew ? "创建" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
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
                确定要删除变量 <span className="font-semibold font-mono">{variableToDelete.name}</span> 吗？
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

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg",
              toast.type === "success" && "bg-white border border-slate-200 text-slate-900",
              toast.type === "error" && "bg-red-50 border border-red-200 text-red-900"
            )}
          >
            {toast.type === "success" && <CheckCircle className="w-4 h-4 text-green-600" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4 text-red-600" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
