import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  /** Called on blur or Enter, never per keystroke. */
  onCommit: (next: string) => void
  ariaLabel: string
}

/**
 * A label you can click to rename.
 *
 * Renders as plain text until activated, and only then swaps to an input.
 * That matters for the matrix headers: an <input> can't wrap, so rendering one
 * permanently forced every column as wide as its longest label — "AI-Assist
 * (all types)" alone pushed a column to 200px. As text it wraps and the column
 * stays checkbox-width.
 *
 * Commits on blur or Enter rather than per keystroke, so a rename is one undo
 * step and one write instead of one per character. Escape abandons. Blanking
 * restores the previous value — an unnamed group would be unreadable in every
 * other panel, and silently keeping "" is worse than refusing it.
 */
export function EditableLabel({ value, onCommit, ariaLabel }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)

  // Follow external changes — import, reset to seed, a rename elsewhere.
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (!next) {
      setDraft(value)
      return
    }
    if (next !== value) onCommit(next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="editable-label"
        aria-label={ariaLabel}
        title="Click to rename"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {value}
      </button>
    )
  }

  return (
    <input
      ref={input}
      className="editable-label editable-label--editing"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      onClick={(e) => e.stopPropagation()}
      autoFocus
    />
  )
}
