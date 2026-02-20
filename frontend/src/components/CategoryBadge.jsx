const categoryStyles = {
  bill: 'bg-warning-500/20 text-warning-400',
  task: 'bg-primary-500/20 text-primary-400',
  event: 'bg-purple-500/20 text-purple-400',
  note: 'bg-slate-600/50 text-slate-300'
}

const categoryLabels = {
  bill: 'Bill',
  task: 'Task',
  event: 'Event',
  note: 'Note'
}

export default function CategoryBadge({ category }) {
  const style = categoryStyles[category] || categoryStyles.note
  const label = categoryLabels[category] || category

  return (
    <span className={`badge ${style}`}>
      {label}
    </span>
  )
}
