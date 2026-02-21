import { useState } from 'react'

const categoryFields = {
  bill: [
    { key: 'amount', label: 'Amount', type: 'number', placeholder: '0.00' },
    { key: 'payment_method', label: 'Payment Method', type: 'select', options: ['UPI', 'Card', 'Cash', 'Bank Transfer', 'Other'] },
    { key: 'reference', label: 'Reference/Transaction ID', type: 'text', placeholder: 'Optional' }
  ],
  task: [
    { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'Optional' },
    { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g., 2 hours' }
  ],
  event: [
    { key: 'date', label: 'Date', type: 'date', placeholder: '', required: true },
    { key: 'time', label: 'Time', type: 'time', placeholder: '' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'Optional' },
    { key: 'participants', label: 'Participants', type: 'text', placeholder: 'e.g., John, Jane' }
  ],
  note: [
    { key: 'tags', label: 'Tags', type: 'text', placeholder: 'e.g., work, personal' }
  ]
}

export default function MetadataForm({ category, logId, onSave, onSkip, initialValues }) {
  const fields = categoryFields[category] || categoryFields.task
  // Pre-populate with any metadata already extracted by the AI
  const [values, setValues] = useState(() => {
    const init = {}
    if (initialValues) {
      fields.forEach(f => {
        const v = initialValues[f.key]
        if (v !== undefined && v !== null) {
          // Arrays (participants, tags) → join back to string for the text input
          init[f.key] = Array.isArray(v) ? v.join(', ') : String(v)
        }
      })
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const isEvent = category === 'event'

  const handleChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    // Filter out empty values
    const metadata = {}
    Object.entries(values).forEach(([key, value]) => {
      if (value && value.toString().trim()) {
        // Convert amount to number
        if (key === 'amount') {
          metadata[key] = parseFloat(value)
        } else if (key === 'participants' || key === 'tags') {
          // Convert comma-separated to array
          metadata[key] = value.split(',').map(s => s.trim()).filter(Boolean)
        } else {
          metadata[key] = value.toString().trim()
        }
      }
    })

    if (Object.keys(metadata).length === 0) {
      onSkip?.()
      return
    }

    setSaving(true)
    try {
      await onSave(logId, metadata)
    } finally {
      setSaving(false)
    }
  }

  const hasAnyValue = Object.values(values).some(v => v && v.toString().trim())

  return (
    <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <p className="text-xs text-slate-400 mb-3">
        {isEvent ? 'When is this event?' : 'Add details (optional)'}
      </p>

      <div className="space-y-2">
        {fields.map(field => (
          <div key={field.key} className="flex items-center gap-2">
            <label className={`text-xs w-24 flex-shrink-0 ${field.required ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
              {field.label}{field.required && <span className="text-error-400 ml-0.5">*</span>}
            </label>
            {field.type === 'select' ? (
              <select
                value={values[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
                className="flex-1 bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600 focus:border-primary-500 focus:outline-none"
              >
                <option value="">Select...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={values[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className={`flex-1 bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border focus:outline-none placeholder:text-slate-500 ${
                  field.required && !values[field.key]
                    ? 'border-warning-500/50 focus:border-warning-500'
                    : 'border-slate-600 focus:border-primary-500'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white text-xs rounded transition-colors"
        >
          {saving ? 'Saving...' : hasAnyValue ? 'Save Details' : 'Done'}
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
