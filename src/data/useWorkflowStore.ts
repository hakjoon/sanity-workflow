import { useCallback, useEffect, useRef, useState } from 'react'
import seed from './workflow.seed.json'
import { parseWorkflow, SCHEMA_VERSION, type WorkflowDoc } from './schema'

const STORAGE_KEY = 'sanity-workflow:draft:v1'
const SAVE_DEBOUNCE_MS = 400

function loadSeed(): WorkflowDoc {
  const parsed = parseWorkflow(seed)
  if (!parsed.ok) {
    // The seed is committed alongside the validator, so this is a build-time
    // bug rather than user input. Fail loudly.
    throw new Error('workflow.seed.json failed validation:\n' + parsed.errors.join('\n'))
  }
  return parsed.doc
}

function loadDraft(): { doc: WorkflowDoc | null; warning: string | null } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { doc: null, warning: null } // private mode, or storage disabled
  }
  if (!raw) return { doc: null, warning: null }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { doc: null, warning: 'Saved draft was unreadable and has been ignored.' }
  }

  const version = (json as { version?: unknown })?.version
  if (typeof version === 'number' && version !== SCHEMA_VERSION) {
    return {
      doc: null,
      warning: `Saved draft is version ${version}, this app expects ${SCHEMA_VERSION}. Loaded the committed seed instead — your draft is still in localStorage under "${STORAGE_KEY}".`,
    }
  }

  const parsed = parseWorkflow(json)
  if (!parsed.ok) {
    return {
      doc: null,
      warning: 'Saved draft failed validation and has been ignored: ' + parsed.errors[0],
    }
  }
  return { doc: parsed.doc, warning: null }
}

export interface WorkflowStore {
  doc: WorkflowDoc
  /** True when the current doc differs from the committed seed. */
  dirty: boolean
  warning: string | null
  dismissWarning: () => void
  update: (fn: (draft: WorkflowDoc) => WorkflowDoc) => void
  resetToSeed: () => void
  exportJson: () => void
  importJson: (text: string) => { ok: true } | { ok: false; errors: string[] }
}

/**
 * Document state with localStorage persistence.
 *
 * The committed seed is the source of truth on first run; after that the
 * local draft wins. Export downloads the current document so it can be
 * copied over the seed and committed — that round trip is how an edit
 * becomes permanent.
 */
export function useWorkflowStore(): WorkflowStore {
  const seedDoc = useRef<WorkflowDoc>(loadSeed())
  const [{ doc, warning }, setState] = useState(() => {
    const { doc: draft, warning } = loadDraft()
    return { doc: draft ?? seedDoc.current, warning }
  })
  const [dirty, setDirty] = useState(() => doc !== seedDoc.current)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!dirty) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
      } catch {
        // Quota or private mode — the in-memory doc still works.
      }
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [doc, dirty])

  const update = useCallback((fn: (draft: WorkflowDoc) => WorkflowDoc) => {
    setState((prev) => ({ ...prev, doc: fn(prev.doc) }))
    setDirty(true)
  }, [])

  const resetToSeed = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing to clear */
    }
    setState({ doc: seedDoc.current, warning: null })
    setDirty(false)
  }, [])

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workflow.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [doc])

  const importJson = useCallback((text: string) => {
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch (e) {
      return { ok: false as const, errors: ['Not valid JSON: ' + (e as Error).message] }
    }
    const parsed = parseWorkflow(json)
    if (!parsed.ok) return { ok: false as const, errors: parsed.errors }
    setState({ doc: parsed.doc, warning: null })
    setDirty(true)
    return { ok: true as const }
  }, [])

  const dismissWarning = useCallback(() => {
    setState((prev) => ({ ...prev, warning: null }))
  }, [])

  return { doc, dirty, warning, dismissWarning, update, resetToSeed, exportJson, importJson }
}
