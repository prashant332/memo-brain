import { format, parseISO } from 'date-fns'
import CategoryBadge from './CategoryBadge'
import MetadataForm from './MetadataForm'

const intentLabels = {
  log_done: { text: 'Logged', color: 'text-success-400', icon: '✓' },
  log_pending: { text: 'Scheduled', color: 'text-primary-400', icon: '◷' },
  log_event: { text: 'Event added', color: 'text-purple-400', icon: '★' },
  add_details: { text: 'Updated', color: 'text-success-400', icon: '✓' },
  query: { text: 'Query', color: 'text-slate-400', icon: '?' }
}

export default function MessageBubble({ message, onQuickReply, onSaveMetadata, onSkipMetadata, isLatest }) {
  const isUser = message.role === 'user'
  const msgMetadata = message.metadata || {}
  const action = msgMetadata.action
  const actionResult = msgMetadata.actionResult

  const showActionPill = action && action.intent && action.intent !== 'none'
  const intentInfo = showActionPill ? intentLabels[action.intent] : null

  // Show inline form when we have a successful log action with ask_followup
  const showMetadataForm = !isUser && isLatest && action?.ask_followup &&
    actionResult?.success && actionResult?.log_id && action.category

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Message Bubble */}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-primary-500 text-white rounded-br-md'
              : 'bg-slate-800 text-slate-100 rounded-bl-md'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Action Pill (for assistant messages with actions) */}
        {!isUser && showActionPill && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${intentInfo?.color}`}>
              {intentInfo?.icon} {intentInfo?.text}
            </span>
            {action.activity_title && (
              <span className="text-xs text-slate-500">
                {action.activity_title}
              </span>
            )}
            {action.category && (
              <CategoryBadge category={action.category} />
            )}
            {actionResult && !actionResult.success && (
              <span className="text-xs text-error-400">
                (Failed: {actionResult.error})
              </span>
            )}
          </div>
        )}

        {/* Query indicator — lets user know real DB was searched */}
        {!isUser && action?.intent === 'query' && action?.query_results_used && (
          <div className="mt-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Searched your data
            </span>
          </div>
        )}

        {/* Error indicator */}
        {!isUser && msgMetadata.error && (
          <div className="mt-2">
            <span className="text-xs text-error-400">⚠ Error occurred</span>
          </div>
        )}

        {/* Inline Metadata Form - for collecting additional details */}
        {showMetadataForm && onSaveMetadata && (
          <MetadataForm
            category={action.category}
            logId={actionResult.log_id}
            initialValues={action.metadata || {}}
            onSave={onSaveMetadata}
            onSkip={onSkipMetadata}
          />
        )}

        {/* Timestamp */}
        <p className={`text-xs text-slate-500 mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.created_at ? format(parseISO(message.created_at), 'h:mm a') : ''}
        </p>
      </div>
    </div>
  )
}
