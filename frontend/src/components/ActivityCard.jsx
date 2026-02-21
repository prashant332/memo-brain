import CategoryBadge from './CategoryBadge'

const statusConfig = {
  done: { label: 'Done', dot: 'bg-success-500', text: 'text-success-400' },
  pending: { label: 'Pending', dot: 'bg-warning-500', text: 'text-slate-400' },
  skipped: { label: 'Skipped', dot: 'bg-slate-500', text: 'text-slate-500' }
}

export default function ActivityCard({ activity, onClick, selected }) {
  const status = statusConfig[activity.current_status] || statusConfig.pending

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        selected
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
      } ${!activity.is_active ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{activity.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <CategoryBadge category={activity.category} />
            {activity.recurrence && (
              <span className="text-xs text-slate-500 capitalize">{activity.recurrence}</span>
            )}
            {!activity.is_active && (
              <span className="text-xs text-slate-600">Inactive</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={`text-xs ${status.text}`}>{status.label}</span>
        </div>
      </div>
    </div>
  )
}
