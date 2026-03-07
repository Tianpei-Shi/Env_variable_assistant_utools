import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { cn } from '../utils/cn'

function SortableItem({ id, value, onChange, onRemove, placeholder, fontClass }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-2", isDragging && "opacity-50")}>
      <button type="button" {...attributes} {...listeners}
        className="w-8 h-10 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-grab active:cursor-grabbing transition-colors shrink-0">
        <GripVertical className="w-4 h-4" />
      </button>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "flex-1 h-10 px-3 font-mono", fontClass,
          "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg",
          "text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500",
          "focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500"
        )} />
      <button type="button" onClick={onRemove}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function SortablePathList({ pathList, onReorder, onAdd, onRemove, onUpdate, placeholder, fontClass }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const items = pathList.map((_, i) => `path-${i}`)

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.indexOf(active.id)
    const newIndex = items.indexOf(over.id)
    onReorder(arrayMove(pathList, oldIndex, newIndex))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">路径列表</label>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          <Plus className="w-4 h-4" /> 添加路径
        </button>
      </div>
      {pathList.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">暂无路径，点击"添加路径"开始添加</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {pathList.map((path, index) => (
                <SortableItem
                  key={`path-${index}`}
                  id={`path-${index}`}
                  value={path}
                  onChange={(val) => onUpdate(index, val)}
                  onRemove={() => onRemove(index)}
                  placeholder={placeholder}
                  fontClass={fontClass}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
