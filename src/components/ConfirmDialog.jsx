// Generic confirmation modal with optional dual-option (e.g., "this month only"
// vs "from this month forward"). Pass either `onConfirm` for a single action,
// or `options` (array of { label, description, onClick, primary }) for multi.

export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  options,
  onConfirm,
  onCancel,
  destructive,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
        {body && <div className="text-sm text-gray-600 mt-2">{body}</div>}

        {options ? (
          <div className="flex flex-col gap-2 mt-4">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={opt.onClick}
                className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  opt.primary
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.description && <div className={`text-xs mt-0.5 ${opt.primary ? 'text-blue-100' : 'text-gray-500'}`}>{opt.description}</div>}
              </button>
            ))}
            <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 mt-1">Cancel</button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm rounded text-white font-medium ${
                destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
