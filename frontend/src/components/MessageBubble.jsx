import { format, parseISO } from 'date-fns'
import CategoryBadge from './CategoryBadge'

const intentLabels = {
  log_done: { text: 'Logged', color: 'text-success-400', icon: '✓' },
  log_pending: { text: 'Scheduled', color: 'text-primary-400', icon: '◷' },
  log_event: { text: 'Event added', color: 'text-purple-400', icon: '★' },
  add_details: { text: 'Updated', color: 'text-success-400', icon: '✓' },
  query: { text: 'Query', color: 'text-slate-400', icon: '?' }
}

export default function MessageBubble({ message, onQuickReply, isLatest }) {
  const isUser = message.role === 'user'
  const metadata = message.metadata || {}
  const action = metadata.action
  const actionResult = metadata.actionResult

  const showActionPill = action && action.intent && action.intent !== 'none'
  const intentInfo = showActionPill ? intentLabels[action.intent] : null

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

        {/* Error indicator */}
        {!isUser && metadata.error && (
          <div className="mt-2">
            <span className="text-xs text-error-400">⚠ Error occurred</span>
          </div>
        )}

        {/* Quick Reply Buttons - dynamic suggestions from AI */}
        {!isUser && isLatest && action?.ask_followup && onQuickReply && (
          <div className="mt-3 flex flex-wrap gap-2">
            {action.followup_suggestions?.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onQuickReply(suggestion)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  suggestion.toLowerCase().includes('done')
                    ? 'bg-success-500/20 text-success-400 hover:bg-success-500/30'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
              >
                {suggestion}
              </button>
            ))}
            {/* Always show Done button if not in suggestions */}
            {!action.followup_suggestions?.some(s => s.toLowerCase().includes('done')) && (
              <button
                onClick={() => onQuickReply('Done')}
                className="px-3 py-1.5 bg-success-500/20 text-success-400 hover:bg-success-500/30 rounded-full text-xs transition-colors"
              >
                Done ✓
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-xs text-slate-500 mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.created_at ? format(parseISO(message.created_at), 'h:mm a') : ''}
        </p>
      </div>
    </div>
  )
}
