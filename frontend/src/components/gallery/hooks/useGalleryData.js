import { useEffect, useMemo, useState } from 'react'
import { galleryApi } from '../../../lib/api'
import { describeError, sortItemsByCreatedAtDesc } from '../utils'

export function useGalleryData({ reloadToken, authOptions }) {
  const [boards, setBoards] = useState([])
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [items, setItems] = useState([])
  const [backendHealth, setBackendHealth] = useState(null)
  const [isLoadingBoards, setIsLoadingBoards] = useState(true)
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [dataError, setDataError] = useState(null)

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadHealth() {
      try {
        const health = await galleryApi.getHealth()
        if (!isCancelled) {
          setBackendHealth(health)
        }
      } catch {
        if (!isCancelled) {
          setBackendHealth(null)
        }
      }
    }

    loadHealth()

    return () => {
      isCancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    let isCancelled = false

    async function loadBoards() {
      setIsLoadingBoards(true)
      setDataError(null)

      try {
        const response = await galleryApi.listBoards(authOptions)
        const nextBoards = Array.isArray(response?.boards) ? response.boards : []

        if (isCancelled) return

        setBoards(nextBoards)
        setActiveBoardId(nextBoards[0]?.id ?? null)

        if (nextBoards.length === 0) {
          setItems([])
        }
      } catch (error) {
        if (isCancelled) return
        setBoards([])
        setActiveBoardId(null)
        setItems([])
        setDataError(describeError(error))
      } finally {
        if (!isCancelled) {
          setIsLoadingBoards(false)
        }
      }
    }

    loadBoards()

    return () => {
      isCancelled = true
    }
  }, [reloadToken, authOptions])

  useEffect(() => {
    if (!activeBoardId) return undefined

    let isCancelled = false

    async function loadBoardItems() {
      setIsLoadingItems(true)
      setDataError(null)

      try {
        const response = await galleryApi.getBoardItems(activeBoardId, authOptions)
        const nextItems = Array.isArray(response?.items)
          ? sortItemsByCreatedAtDesc(response.items)
          : []

        if (!isCancelled) {
          setItems(nextItems)
        }
      } catch (error) {
        if (!isCancelled) {
          setItems([])
          setDataError(describeError(error))
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingItems(false)
        }
      }
    }

    loadBoardItems()

    return () => {
      isCancelled = true
    }
  }, [activeBoardId, reloadToken, authOptions])

  return {
    boards,
    activeBoardId,
    setActiveBoardId,
    activeBoard,
    items,
    backendHealth,
    isLoadingBoards,
    isLoadingItems,
    dataError,
  }
}
