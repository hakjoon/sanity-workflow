import { useEffect, useState } from 'react'

interface Props {
  value: string
  /** Called on blur or Enter, never per keystroke. */
  onCommit: (next: string) => void
  ariaLabel: string
  className?: string
}

/**
 * A label you can type over in place.
 *
 * Commits on blur or Enter rather than on every keystroke, so a rename is one
 * undo step and one localStorage write instead of one per character. Escape
 * abandons the edit. Blanking the field restores the previous value — an
 * unnamed group or article type would be unreadable in every other panel, and
 * silently keeping "" is worse than refusing it.
 */
export function EditableLabel({ value, onCommit, ariaLabel, className }: Props) {
  const [draft, setDraft] = useState(value)

  // Follow external changes — import, reset to seed, undo elsewhere.
  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const next = draft.trim()
    if (!next) {
      setDraft(value)
      return
    }
    if (next !== value) onCommit(next)
  }

  return (
    <input
      className={`editable-label${className ? ` ${className}` : ''}`}
      value={draft}
      aria-label={ariaLabel}
      size={Math.max(draft.length, 4)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      // Clicking a header shouldn't also trigger the row's lens selection.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}
