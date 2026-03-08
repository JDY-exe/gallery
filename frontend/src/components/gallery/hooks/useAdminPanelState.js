import { useEffect, useState } from 'react'

const LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY = 'gallery.adminPanelOpen'

function readInitialAdminPanelOpen() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY) === '1'
}

export function useAdminPanelState() {
  const [adminPanelOpen, setAdminPanelOpen] = useState(readInitialAdminPanelOpen)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY,
      adminPanelOpen ? '1' : '0',
    )
  }, [adminPanelOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleKeyDown = (event) => {
      const isToggleHotkey = event.shiftKey && String(event.key).toLowerCase() === 'a'
      if (!isToggleHotkey) return

      const target = event.target
      const tagName = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : ''
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return
      }

      event.preventDefault()
      setAdminPanelOpen((prev) => !prev)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return { adminPanelOpen, setAdminPanelOpen }
}
