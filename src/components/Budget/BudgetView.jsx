import { useState } from 'react'
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core'
import { useApp, filterByMonth, computeActuals } from '../../context/AppContext'
import { formatCurrency, formatMonth, getCurrentMonth } from '../../lib/utils'
import { getEffectiveBudget, getEffectiveType, isCategoryHidden, hasAmountOverride } from '../../lib/budget'
import ConfirmDialog from '../ConfirmDialog'

// Months strictly before `fromMonth` that have any prior activity and no existing
// AMOUNT override for this category. We freeze these so changing the default
// forward doesn't retroactively change historical reports.
function frozenMonthsBefore(state, category, fromMonth) {
  const known = new Set([
    ...Object.keys(state.budgetOverrides),
    ...Object.keys(state.incomeActuals),
    ...state.transactions.map(t => t.date.slice(0, 7)),
  ])
  return [...known].filter(m => m < fromMonth && !hasAmountOverride(state.budgetOverrides, category, m))
}

function BudgetCell({ category, budgetTargets, budgetOverrides, selectedMonth, dispatch }) {
  const { state } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const isSpecificMonth = selectedMonth && selectedMonth !== 'all'
  const hasOverride = isSpecificMonth && hasAmountOverride(budgetOverrides, category, selectedMonth)
  const defaultAmount = budgetTargets[category]?.amount ?? 0
  const effectiveAmount = isSpecificMonth
    ? getEffectiveBudget(budgetTargets, budgetOverrides, category, selectedMonth)
    : defaultAmount

  const start = () => { setDraft(String(effectiveAmount)); setEditing(true) }
  const cancel = () => setEditing(false)

  const parsed = () => {
    const v = parseFloat(draft)
    return !isNaN(v) && v >= 0 ? v : null
  }

  const commitForMonth = () => {
    const v = parsed()
    if (v !== null) {
      dispatch({ type: 'SET_BUDGET_OVERRIDE', category, month: selectedMonth, amount: v })
    }
    setEditing(false)
  }

  const commitAsDefault = () => {
    const v = parsed()
    if (v !== null) {
      if (isSpecificMonth) {
        const frozenMonths = frozenMonthsBefore(state, category, selectedMonth)
        dispatch({
          type: 'UPDATE_BUDGET_DEFAULT_FROM_MONTH',
          category,
          amount: v,
          fromMonth: selectedMonth,
          frozenMonths,
          oldDefault: defaultAmount,
        })
      } else {
        dispatch({ type: 'SET_BUDGET_TARGET', category, amount: v })
      }
    }
    setEditing(false)
  }

  const clearOverride = (e) => {
    e.stopPropagation()
    dispatch({ type: 'REMOVE_BUDGET_OVERRIDE', category, month: selectedMonth })
  }

  if (editing) {
    const primary = isSpecificMonth ? commitForMonth : commitAsDefault
    return (
      <div className="flex flex-col items-end gap-1" onKeyDown={e => { if (e.key === 'Escape') cancel() }}>
        <input
          autoFocus
          type="number"
          min="0"
          step="1"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') primary() }}
          className="w-24 text-right text-sm border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
        {isSpecificMonth ? (
          <div className="flex flex-col gap-0.5 text-[11px]">
            <button
              onClick={commitForMonth}
              className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save for {formatMonth(selectedMonth)}
            </button>
            <button
              onClick={commitAsDefault}
              title="Sets the new default from this month forward. Past months are pinned to the current default so historical reports don't change."
              className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Save as default
            </button>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={commitAsDefault}
              className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button onClick={cancel} className="px-1.5 py-0.5 text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {hasOverride && (
        <button
          onClick={clearOverride}
          title={`Override: ${formatCurrency(effectiveAmount)} (default: ${formatCurrency(defaultAmount)}) — click × to reset`}
          className="text-xs text-amber-500 hover:text-red-500 leading-none"
        >
          ×
        </button>
      )}
      <button
        onClick={start}
        title={hasOverride
          ? `Month override. Default is ${formatCurrency(defaultAmount)}. Click to change.`
          : 'Click to edit'}
        className={`font-mono text-sm underline decoration-dashed underline-offset-2 ${
          hasOverride ? 'text-amber-600 hover:text-amber-800' : 'text-blue-600 hover:text-blue-800'
        }`}
      >
        {formatCurrency(effectiveAmount)}
      </button>
    </div>
  )
}

function DndContextWrapper({ sensors, onDropTo, children }) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const { active, over } = event
        if (!over) return
        const targetType = over.id
        if (targetType !== 'fixed' && targetType !== 'variable') return
        onDropTo(active.id, targetType)
      }}
    >
      {children}
    </DndContext>
  )
}

function DroppableSection({ sectionType, label, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: sectionType })
  return (
    <tbody ref={setNodeRef} className={isOver ? 'bg-blue-50' : ''}>
      <tr className="bg-gray-50">
        <td colSpan={5} className="py-1.5 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200">
          {label}
        </td>
      </tr>
      {children}
    </tbody>
  )
}

function AddCategoryRow({ categoriesAvailable, onAdd, onCancel }) {
  const [picked, setPicked] = useState('')
  const [newName, setNewName] = useState('')

  const submitExisting = () => {
    if (!picked) return
    onAdd(picked, false)
  }
  const submitNew = (e) => {
    e.preventDefault()
    const name = newName.trim().toUpperCase()
    if (!name) return
    onAdd(name, true)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={picked}
        onChange={e => setPicked(e.target.value)}
        className="text-xs border border-gray-300 rounded px-2 py-1"
      >
        <option value="">Pick existing category…</option>
        {categoriesAvailable.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button
        onClick={submitExisting}
        disabled={!picked}
        className="text-xs bg-blue-600 text-white rounded px-2 py-1 disabled:opacity-40 hover:bg-blue-700"
      >Add</button>
      <span className="text-xs text-gray-400">or</span>
      <form onSubmit={submitNew} className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New category"
          className="text-xs border border-gray-300 rounded px-2 py-1 uppercase"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="text-xs bg-blue-600 text-white rounded px-2 py-1 disabled:opacity-40 hover:bg-blue-700"
        >Create</button>
      </form>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Cancel</button>
    </div>
  )
}

function DraggableBudgetRow({ row, actual, budgetTargets, budgetOverrides, selectedMonth, dispatch, onShowCategory, onRequestRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.category })
  const variance = row.effectiveAmount - actual
  const pct = row.effectiveAmount > 0 ? Math.round((actual / row.effectiveAmount) * 100) : null
  const isOver = variance < 0
  const isEmpty = row.effectiveAmount === 0 && actual === 0

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1, position: 'relative', zIndex: isDragging ? 10 : 0 }
    : undefined

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 group transition-colors">
      <td className="py-2.5 px-4 text-gray-800 font-medium relative">
        <span
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 px-1.5 py-2 text-gray-300 hover:text-gray-500 cursor-grab opacity-100 sm:opacity-0 sm:group-hover:opacity-100 select-none touch-none"
          title="Drag to move between sections"
        >⋮⋮</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onShowCategory(row.category)}
            className="text-left hover:text-blue-700 hover:underline decoration-dashed underline-offset-2"
            title={`See ${row.category} transactions for this month`}
          >
            {row.category}
          </button>
          <button
            onClick={() => onRequestRemove(row.category)}
            className="text-gray-400 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-sm p-1 -m-1 leading-none"
            title="Remove from budget"
            aria-label={`Remove ${row.category} from budget`}
          >✕</button>
        </div>
      </td>
      <td className="py-2.5 px-4 text-right">
        <BudgetCell
          category={row.category}
          budgetTargets={budgetTargets}
          budgetOverrides={budgetOverrides}
          selectedMonth={selectedMonth}
          dispatch={dispatch}
        />
      </td>
      <td className={`py-2.5 px-4 text-right font-mono text-sm ${actual !== 0 ? 'text-gray-900' : 'text-gray-300'}`}>
        {formatCurrency(actual)}
      </td>
      <td className={`py-2.5 px-4 text-right font-mono text-sm font-medium ${
        isEmpty ? 'text-gray-300' : isOver ? 'text-red-600' : 'text-green-600'
      }`}>
        {isEmpty ? '—' : `${variance >= 0 ? '+' : ''}${formatCurrency(variance)}`}
      </td>
      <td className="py-2.5 px-4 text-right">
        {pct !== null && actual > 0 && (
          <div className="flex items-center gap-1.5 justify-end">
            <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
          </div>
        )}
      </td>
    </tr>
  )
}

function SectionRows({ rows, actuals, budgetTargets, budgetOverrides, selectedMonth, dispatch, onShowCategory, onRequestRemove }) {
  const totalBudget = rows.reduce((s, r) => s + r.effectiveAmount, 0)
  const totalActual = rows.reduce((s, r) => s + (actuals[r.category] || 0), 0)
  const totalVariance = totalBudget - totalActual

  return (
    <>
      {rows.map(row => (
        <DraggableBudgetRow
          key={row.category}
          row={row}
          actual={actuals[row.category] || 0}
          budgetTargets={budgetTargets}
          budgetOverrides={budgetOverrides}
          selectedMonth={selectedMonth}
          dispatch={dispatch}
          onShowCategory={onShowCategory}
          onRequestRemove={onRequestRemove}
        />
      ))}
      <tr className="bg-gray-50 font-semibold border-t border-gray-300">
        <td className="py-2 px-4 text-xs text-gray-500 uppercase tracking-wide">Subtotal</td>
        <td className="py-2 px-4 text-right font-mono text-sm text-gray-700">{formatCurrency(totalBudget)}</td>
        <td className="py-2 px-4 text-right font-mono text-sm text-gray-700">{formatCurrency(totalActual)}</td>
        <td className={`py-2 px-4 text-right font-mono text-sm ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
        </td>
        <td className="py-2 px-4 text-right text-xs text-gray-400">
          {totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}%` : ''}
        </td>
      </tr>
    </>
  )
}

// "What does this change affect?" calculator, used to populate the confirm
// dialog with the precise impact based on which month is selected.
function computeChangeScope(selectedMonth) {
  if (!selectedMonth || selectedMonth === 'all') return 'allMonths'
  if (selectedMonth === getCurrentMonth()) return 'currentMonth'
  return 'specificMonth'
}

export default function BudgetView() {
  const { state, dispatch } = useApp()
  const { transactions, budgetTargets, budgetOverrides, selectedMonth, categories } = state
  const [previewCategory, setPreviewCategory] = useState(null)
  const [pending, setPending] = useState(null) // confirmation dialog state
  const [addingTo, setAddingTo] = useState(null) // 'fixed' | 'variable' | null
  // Mouse drags start after a small move; touch drags start after a short
  // press-and-hold so vertical scrolling on a phone isn't hijacked.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const monthTxs = filterByMonth(transactions, selectedMonth)
  const actuals = computeActuals(monthTxs)

  const isSpecificMonth = selectedMonth && selectedMonth !== 'all'

  // A category is "in the budget" for a given month if it has a default
  // budget_target, OR (in a specific month) it has a non-hidden override row
  // with amount or type set (i.e., a frozen-past row from a removed-at-current
  // change). Hidden-flagged overrides remove it from that month.
  const candidateCats = new Set(
    Object.keys(budgetTargets).filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED')
  )
  if (isSpecificMonth) {
    const monthOverrides = budgetOverrides[selectedMonth] ?? {}
    for (const c of Object.keys(monthOverrides)) {
      if (c === 'IGNORE' || c === 'UNCATEGORIZED') continue
      const ov = monthOverrides[c]
      if (!ov.hidden && (ov.amount != null || ov.type != null)) candidateCats.add(c)
    }
  }
  const allCats = [...candidateCats]
    .filter(c => !(isSpecificMonth && isCategoryHidden(budgetOverrides, c, selectedMonth)))

  const toRow = (c) => ({
    category: c,
    effectiveAmount: isSpecificMonth
      ? getEffectiveBudget(budgetTargets, budgetOverrides, c, selectedMonth)
      : (budgetTargets[c]?.amount ?? 0),
  })

  // Type is layered: per-month override → default → 'variable'. Treat unknown
  // categories (in `categories` table but no budget target row) as variable.
  const typeOf = (c) => isSpecificMonth
    ? getEffectiveType(budgetTargets, budgetOverrides, c, selectedMonth)
    : (budgetTargets[c]?.type ?? 'variable')

  const fixedRows = allCats.filter(c => typeOf(c) === 'fixed').map(toRow)
  const variableRows = allCats.filter(c => typeOf(c) !== 'fixed').map(toRow)

  const totalBudget = [...fixedRows, ...variableRows].reduce((s, r) => s + r.effectiveAmount, 0)
  const totalActual = Object.values(actuals).reduce((s, v) => s + v, 0)
  const totalVariance = totalBudget - totalActual

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <h2 className="font-semibold text-gray-800">Budget vs. Actual</h2>
        <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${totalVariance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {totalVariance >= 0
            ? `Under by ${formatCurrency(Math.abs(totalVariance))}`
            : `Over by ${formatCurrency(Math.abs(totalVariance))}`}
        </span>
        {isSpecificMonth && (
          <span className="ml-auto text-xs text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
            Amber = month-specific override (× to reset to default)
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Budget</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Actual</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Variance</th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">% Used</th>
            </tr>
          </thead>

          <DndContextWrapper
            sensors={sensors}
            onDropTo={(category, targetType) => {
              const currentType = isSpecificMonth
                ? getEffectiveType(budgetTargets, budgetOverrides, category, selectedMonth)
                : (budgetTargets[category]?.type ?? 'variable')
              if (currentType === targetType) return
              setPending({
                kind: 'move',
                category,
                fromType: currentType,
                toType: targetType,
              })
            }}
          >
            <DroppableSection sectionType="fixed" label="Fixed Expenses">
              <SectionRows
                rows={fixedRows}
                actuals={actuals}
                budgetTargets={budgetTargets}
                budgetOverrides={budgetOverrides}
                selectedMonth={selectedMonth}
                dispatch={dispatch}
                onShowCategory={setPreviewCategory}
                onRequestRemove={(category) => setPending({ kind: 'remove', category })}
              />
              <tr>
                <td colSpan={5} className="py-2 px-4 text-left">
                  {addingTo === 'fixed' ? (
                    <AddCategoryRow
                      categoriesAvailable={categories.filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED' && !budgetTargets[c])}
                      onAdd={(category, isNew) => {
                        setAddingTo(null)
                        setPending({ kind: 'add', category, targetType: 'fixed', isNew })
                      }}
                      onCancel={() => setAddingTo(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingTo('fixed')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add to fixed
                    </button>
                  )}
                </td>
              </tr>
            </DroppableSection>

            <DroppableSection sectionType="variable" label="Variable Expenses">
              <SectionRows
                rows={variableRows}
                actuals={actuals}
                budgetTargets={budgetTargets}
                budgetOverrides={budgetOverrides}
                selectedMonth={selectedMonth}
                dispatch={dispatch}
                onShowCategory={setPreviewCategory}
                onRequestRemove={(category) => setPending({ kind: 'remove', category })}
              />
              <tr>
                <td colSpan={5} className="py-2 px-4 text-left">
                  {addingTo === 'variable' ? (
                    <AddCategoryRow
                      categoriesAvailable={categories.filter(c => c !== 'IGNORE' && c !== 'UNCATEGORIZED' && !budgetTargets[c])}
                      onAdd={(category, isNew) => {
                        setAddingTo(null)
                        setPending({ kind: 'add', category, targetType: 'variable', isNew })
                      }}
                      onCancel={() => setAddingTo(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingTo('variable')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add to variable
                    </button>
                  )}
                </td>
              </tr>
            </DroppableSection>
          </DndContextWrapper>

          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr className="font-bold text-sm">
              <td className="py-3 px-4 text-gray-800">TOTAL</td>
              <td className="py-3 px-4 text-right font-mono text-gray-800">{formatCurrency(totalBudget)}</td>
              <td className="py-3 px-4 text-right font-mono text-gray-800">{formatCurrency(totalActual)}</td>
              <td className={`py-3 px-4 text-right font-mono ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
              </td>
              <td className="py-3 px-4 text-right text-sm font-normal text-gray-500">
                {totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}%` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
        Click any budget amount to edit · Click a category name to preview its transactions
        {isSpecificMonth ? ' · Changes this month only · Edit in "All" view to change the default' : ' · Sets the default for all months'}
      </p>

      {previewCategory && (
        <CategoryPreview
          category={previewCategory}
          transactions={monthTxs.filter(t => t.category === previewCategory)}
          selectedMonth={selectedMonth}
          onClose={() => setPreviewCategory(null)}
        />
      )}

      {pending && (() => {
        const scope = computeChangeScope(selectedMonth)
        const monthLabel = isSpecificMonth ? formatMonth(selectedMonth) : 'all months'
        const close = () => setPending(null)

        if (pending.kind === 'remove') {
          if (scope === 'allMonths') {
            return (
              <ConfirmDialog
                title={`Remove ${pending.category} from the budget?`}
                body="Removes it from the default budget. Existing transactions are unaffected; the category still exists for categorization."
                confirmLabel="Remove"
                destructive
                onConfirm={() => {
                  dispatch({ type: 'REMOVE_CATEGORY_FROM_BUDGET_DEFAULT', category: pending.category })
                  close()
                }}
                onCancel={close}
              />
            )
          }
          if (scope === 'currentMonth') {
            const frozenMonths = frozenMonthsBefore(state, pending.category, selectedMonth)
            const oldDefault = budgetTargets[pending.category]?.amount ?? 0
            const oldType = budgetTargets[pending.category]?.type ?? 'variable'
            return (
              <ConfirmDialog
                title={`Remove ${pending.category} from the budget?`}
                body={`You're viewing ${monthLabel} (the current month).`}
                options={[
                  {
                    label: `Just ${monthLabel}`,
                    description: 'Hide from this month only; defaults and other months are unchanged.',
                    onClick: () => {
                      dispatch({ type: 'HIDE_CATEGORY_FOR_MONTH', category: pending.category, month: selectedMonth })
                      close()
                    },
                  },
                  {
                    label: `From ${monthLabel} forward`,
                    primary: true,
                    description: `Removes from defaults so this month and future months exclude it. ${frozenMonths.length} past month(s) frozen at the current setup.`,
                    onClick: () => {
                      dispatch({
                        type: 'REMOVE_CATEGORY_FROM_BUDGET_DEFAULT',
                        category: pending.category,
                        freezeFromOldDefault: true,
                        oldDefault,
                        oldType,
                        frozenMonths,
                      })
                      close()
                    },
                  },
                ]}
                onCancel={close}
              />
            )
          }
          return (
            <ConfirmDialog
              title={`Hide ${pending.category} from ${monthLabel}?`}
              body="This affects only this month. Defaults and other months are unchanged."
              confirmLabel="Hide"
              destructive
              onConfirm={() => {
                dispatch({ type: 'HIDE_CATEGORY_FOR_MONTH', category: pending.category, month: selectedMonth })
                close()
              }}
              onCancel={close}
            />
          )
        }

        if (pending.kind === 'add') {
          return (
            <ConfirmDialog
              title={`Add ${pending.category} to the ${pending.targetType} budget?`}
              body={`This updates the default — the category will appear in every month going forward (and any past months without overrides) until you remove it. ${pending.isNew ? 'A new category will be created.' : ''}`}
              confirmLabel="Add"
              onConfirm={() => {
                dispatch({
                  type: 'ADD_CATEGORY_TO_BUDGET_DEFAULT',
                  category: pending.category,
                  categoryType: pending.targetType,
                })
                close()
              }}
              onCancel={close}
            />
          )
        }

        if (pending.kind === 'move') {
          if (scope === 'allMonths') {
            return (
              <ConfirmDialog
                title={`Move ${pending.category} to ${pending.toType}?`}
                body="Updates the default for all months without per-month overrides."
                confirmLabel="Move"
                onConfirm={() => {
                  dispatch({
                    type: 'CHANGE_CATEGORY_TYPE_DEFAULT',
                    category: pending.category,
                    newType: pending.toType,
                    oldType: pending.fromType,
                  })
                  close()
                }}
                onCancel={close}
              />
            )
          }
          if (scope === 'currentMonth') {
            const frozenMonths = frozenMonthsBefore(state, pending.category, selectedMonth)
            return (
              <ConfirmDialog
                title={`Move ${pending.category} to ${pending.toType}?`}
                body={`You're viewing ${monthLabel} (the current month).`}
                options={[
                  {
                    label: `Just ${monthLabel}`,
                    description: 'Change applies to this month only.',
                    onClick: () => {
                      dispatch({
                        type: 'SET_CATEGORY_TYPE_FOR_MONTH',
                        category: pending.category,
                        month: selectedMonth,
                        type: pending.toType,
                      })
                      close()
                    },
                  },
                  {
                    label: `From ${monthLabel} forward`,
                    primary: true,
                    description: `Updates the default. ${frozenMonths.length} past month(s) frozen at ${pending.fromType}.`,
                    onClick: () => {
                      dispatch({
                        type: 'CHANGE_CATEGORY_TYPE_DEFAULT',
                        category: pending.category,
                        newType: pending.toType,
                        oldType: pending.fromType,
                        frozenMonths,
                      })
                      close()
                    },
                  },
                ]}
                onCancel={close}
              />
            )
          }
          return (
            <ConfirmDialog
              title={`Move ${pending.category} to ${pending.toType} for ${monthLabel}?`}
              body="Affects only this month. Defaults are unchanged."
              confirmLabel="Move"
              onConfirm={() => {
                dispatch({
                  type: 'SET_CATEGORY_TYPE_FOR_MONTH',
                  category: pending.category,
                  month: selectedMonth,
                  type: pending.toType,
                })
                close()
              }}
              onCancel={close}
            />
          )
        }

        return null
      })()}
    </div>
  )
}

function CategoryPreview({ category, transactions, selectedMonth, onClose }) {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1))
  const total = sorted.reduce((s, t) => s + t.amount, 0)
  const label = selectedMonth === 'all' ? 'All months' : formatMonth(selectedMonth)

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{category}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{label} · {sorted.length} transactions · {formatCurrency(total)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">No transactions in {category} this month.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {sorted.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="py-2 px-5 text-xs text-gray-500 whitespace-nowrap w-24">{t.date}</td>
                    <td className="py-2 px-3 text-gray-800">
                      <span className="block truncate" title={t.description}>{t.description}</span>
                    </td>
                    <td className={`py-2 px-5 text-right font-mono whitespace-nowrap w-24 ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
