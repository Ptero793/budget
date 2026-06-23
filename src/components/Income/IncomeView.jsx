import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApp } from '../../context/AppContext'
import { formatCurrency, getMonthsInYear, formatMonth } from '../../lib/utils'

function InlineName({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const next = draft.trim()
    if (next && next !== value) onSave(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="text-sm border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Click to rename"
      className="font-medium text-gray-800 hover:text-blue-700 hover:underline decoration-dashed underline-offset-2 text-left"
    >
      {value}
    </button>
  )
}

function InlineEdit({ value, onSave, prefix = '$', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = () => { setDraft(String(value || '')); setEditing(true) }
  const commit = () => {
    const v = parseFloat(draft)
    onSave(isNaN(v) ? 0 : v)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="0"
        step="1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-20 text-right text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none font-mono"
      />
    )
  }

  return (
    <button
      onClick={start}
      title="Click to edit"
      className={`text-right w-full font-mono text-xs hover:text-blue-600 ${value ? 'text-gray-800' : 'text-gray-300'} ${className}`}
    >
      {value ? formatCurrency(value) : '—'}
    </button>
  )
}

function SortableIncomeRow({ src, visibleMonths, getActual, setActual, ytd, onRename, onRemove, dispatch }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 group">
      <td className="py-2.5 px-4 font-medium text-gray-800 relative">
        <span
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 px-1 text-gray-300 hover:text-gray-500 cursor-grab opacity-0 group-hover:opacity-100 select-none"
          title="Drag to reorder"
        >⋮⋮</span>
        <InlineName value={src.name} onSave={onRename} />
      </td>
      <td className="py-2.5 px-4 text-right">
        <InlineEdit
          value={src.target}
          onSave={v => dispatch({ type: 'SET_INCOME_TARGET', id: src.id, target: v })}
        />
      </td>
      {visibleMonths.map(m => (
        <td key={m} className="py-2.5 px-4 text-right">
          <InlineEdit
            value={getActual(src.id, m)}
            onSave={v => setActual(src.id, m, v)}
          />
        </td>
      ))}
      <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
        {ytd(src.id) > 0 ? formatCurrency(ytd(src.id)) : '—'}
      </td>
      <td className="py-2.5 px-4">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs"
          title="Remove source"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

export default function IncomeView() {
  const { state, dispatch } = useApp()
  const { incomeSources, incomeActuals, selectedMonth } = state
  const [newSourceName, setNewSourceName] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const year = selectedMonth === 'all'
    ? new Date().getFullYear()
    : parseInt(selectedMonth.split('-')[0])

  const months = getMonthsInYear(year)
  const visibleMonths = selectedMonth === 'all'
    ? months
    : [selectedMonth]

  const getActual = (sourceId, month) => incomeActuals?.[month]?.[sourceId] || 0
  const setActual = (sourceId, month, amount) =>
    dispatch({ type: 'SET_INCOME_ACTUAL', sourceId, month, amount })

  const ytd = (sourceId) => months.reduce((s, m) => s + getActual(sourceId, m), 0)
  const monthTotal = (month) => incomeSources.reduce((s, src) => s + getActual(src.id, month), 0)
  const grandYtd = () => incomeSources.reduce((s, src) => s + ytd(src.id), 0)

  const handleAddSource = (e) => {
    e.preventDefault()
    if (!newSourceName.trim()) return
    dispatch({ type: 'ADD_INCOME_SOURCE', id: `src_${Date.now()}`, name: newSourceName.trim() })
    setNewSourceName('')
    setShowAdd(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Income Tracking — {year}</h2>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          + Add source
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddSource} className="flex gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <input
            autoFocus
            type="text"
            placeholder="Income source name"
            value={newSourceName}
            onChange={e => setNewSourceName(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button type="submit" className="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 font-medium">
            Add
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-48">Source</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Monthly Target</th>
              {visibleMonths.map(m => (
                <th key={m} className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                  {selectedMonth === 'all'
                    ? new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]) - 1).toLocaleString('en-US', { month: 'short' })
                    : 'Actual'}
                </th>
              ))}
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">YTD Total</th>
              <th className="py-3 px-4 w-8"></th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return
              const oldIndex = incomeSources.findIndex(s => s.id === active.id)
              const newIndex = incomeSources.findIndex(s => s.id === over.id)
              if (oldIndex < 0 || newIndex < 0) return
              const reordered = arrayMove(incomeSources, oldIndex, newIndex)
              dispatch({ type: 'REORDER_INCOME_SOURCES', ids: reordered.map(s => s.id) })
            }}
          >
            <SortableContext items={incomeSources.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <tbody className="divide-y divide-gray-100">
                {incomeSources.map(src => (
                  <SortableIncomeRow
                    key={src.id}
                    src={src}
                    visibleMonths={visibleMonths}
                    getActual={getActual}
                    setActual={setActual}
                    ytd={ytd}
                    dispatch={dispatch}
                    onRename={(name) => dispatch({ type: 'RENAME_INCOME_SOURCE', id: src.id, name })}
                    onRemove={() => dispatch({ type: 'REMOVE_INCOME_SOURCE', id: src.id })}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
              <td className="py-2.5 px-4 text-gray-700">Total Income</td>
              <td className="py-2.5 px-4 text-right font-mono text-gray-700">
                {formatCurrency(incomeSources.reduce((s, src) => s + src.target, 0))}
              </td>
              {visibleMonths.map(m => (
                <td key={m} className="py-2.5 px-4 text-right font-mono text-gray-900">
                  {monthTotal(m) > 0 ? formatCurrency(monthTotal(m)) : '—'}
                </td>
              ))}
              <td className="py-2.5 px-4 text-right font-mono text-gray-900">
                {grandYtd() > 0 ? formatCurrency(grandYtd()) : '—'}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
        Click any amount to edit · Monthly target is informational only
      </p>
    </div>
  )
}
