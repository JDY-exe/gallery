import crypto from 'node:crypto'

const nowIso = () => new Date().toISOString()

function makePublicBoardSummary(board, itemCount) {
  return {
    id: board.id,
    ownerUserId: board.ownerUserId,
    title: board.title,
    description: board.description,
    isPublic: board.isPublic,
    itemCount,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}

function mapItemToApiShape(item) {
  const primaryMedia = item.media[0] ?? null
  const createdYear = new Date(item.createdAt).getUTCFullYear()

  return {
    id: item.id,
    boardId: item.boardId,
    title: item.title ?? 'Untitled',
    artist: item.sourceAuthorUsername
      ? `@${item.sourceAuthorUsername}`
      : item.sourceAuthorDisplayName ?? 'Unknown',
    year: Number.isFinite(createdYear) ? String(createdYear) : 'Unknown',
    caption: item.caption ?? null,
    src: primaryMedia?.srcUrl ?? null,
    aspectRatio: primaryMedia?.aspectRatio ?? null,
    tags: [...item.tags],
    source: {
      type: item.sourceType,
      postId: item.sourcePostId,
      postUrl: item.sourcePostUrl,
      authorId: item.sourceAuthorId,
      authorUsername: item.sourceAuthorUsername,
    },
    media: item.media.map((media) => ({ ...media })),
    createdAt: item.createdAt,
  }
}

export function createInMemoryStore() {
  const profiles = new Map()
  const boards = new Map()
  const boardItems = new Map()
  const adminUsers = new Set()
  const xConnections = new Map()
  const xSyncRuns = []
  const xSyncState = new Map()
  const xOAuthStates = new Map()

  const ensureProfile = (userId, overrides = {}) => {
    if (!profiles.has(userId)) {
      profiles.set(userId, {
        id: userId,
        username: overrides.username ?? null,
        displayName: overrides.displayName ?? 'Demo User',
        email: overrides.email ?? null,
        createdAt: nowIso(),
      })
    }

    return profiles.get(userId)
  }

  const seed = () => {
    const ownerUserId = 'demo-user'
    ensureProfile(ownerUserId, { displayName: 'Demo User', username: 'demo' })
    adminUsers.add(ownerUserId)

    const boardId = crypto.randomUUID()
    const createdAt = nowIso()
    boards.set(boardId, {
      id: boardId,
      ownerUserId,
      title: 'Public Moodboard',
      description: 'Seed board from backend scaffold',
      isPublic: true,
      createdAt,
      updatedAt: createdAt,
    })

    const seededItems = [
      {
        id: crypto.randomUUID(),
        boardId,
        addedByUserId: ownerUserId,
        sourceType: 'x_like',
        sourcePostId: 'demo-post-1',
        sourcePostUrl: 'https://x.com/example/status/demo-post-1',
        sourceAuthorId: '12345',
        sourceAuthorUsername: 'kisaragi_byakko',
        sourceAuthorDisplayName: 'Kisaragi',
        title: 'Test Tweet 1',
        caption: 'Backend seed item using X CDN image URL.',
        tags: ['twitter', 'test', 'feasibility'],
        createdAt,
        media: [
          {
            id: crypto.randomUUID(),
            mediaKey: '3_demo_1',
            mediaType: 'photo',
            srcUrl:
              'https://pbs.twimg.com/media/G-7IawUWkAALgHG?format=jpg&name=900x900',
            width: 900,
            height: 1125,
            aspectRatio: 0.8,
            altText: null,
            status: 'active',
            createdAt,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        boardId,
        addedByUserId: ownerUserId,
        sourceType: 'x_like',
        sourcePostId: 'demo-post-2',
        sourcePostUrl: 'https://x.com/example/status/demo-post-2',
        sourceAuthorId: '67890',
        sourceAuthorUsername: 'ichiichizero2',
        sourceAuthorDisplayName: 'Ichi',
        title: 'Test Tweet 2',
        caption: 'Second seed item for API integration testing.',
        tags: ['twitter', 'test', 'mvp'],
        createdAt,
        media: [
          {
            id: crypto.randomUUID(),
            mediaKey: '3_demo_2',
            mediaType: 'photo',
            srcUrl:
              'https://pbs.twimg.com/media/G-4sUKBXAAEKPdZ?format=jpg&name=900x900',
            width: 900,
            height: 1153,
            aspectRatio: 0.78,
            altText: null,
            status: 'active',
            createdAt,
          },
        ],
      },
    ]

    boardItems.set(boardId, seededItems)
  }

  seed()

  return {
    kind: 'in-memory',

    ensureProfile,

    isAdminUser(userId) {
      return adminUsers.has(userId)
    },

    hasAdminUsers() {
      return adminUsers.size > 0
    },

    grantAdminUser(userId) {
      adminUsers.add(userId)
      return {
        userId,
        createdAt: nowIso(),
      }
    },

    listBoards({ includePrivate = false, ownerUserId = null } = {}) {
      const summaries = []
      for (const board of boards.values()) {
        const ownedByRequester = ownerUserId && board.ownerUserId === ownerUserId
        if (!board.isPublic && !includePrivate && !ownedByRequester) continue
        const items = boardItems.get(board.id) ?? []
        summaries.push(makePublicBoardSummary(board, items.length))
      }
      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    getBoard(boardId) {
      const board = boards.get(boardId)
      if (!board) return null
      const items = boardItems.get(board.id) ?? []
      return makePublicBoardSummary(board, items.length)
    },

    getBoardItems(boardId) {
      const items = boardItems.get(boardId)
      if (!items) return null
      return items.map(mapItemToApiShape)
    },

    createBoard({ ownerUserId, title, description = null, isPublic = true }) {
      for (const board of boards.values()) {
        if (board.ownerUserId !== ownerUserId) continue
        const items = boardItems.get(board.id) ?? []
        return makePublicBoardSummary(board, items.length)
      }

      const id = crypto.randomUUID()
      const timestamp = nowIso()
      const board = {
        id,
        ownerUserId,
        title,
        description,
        isPublic,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      boards.set(id, board)
      boardItems.set(id, [])
      return makePublicBoardSummary(board, 0)
    },

    updateBoard(boardId, patch) {
      const board = boards.get(boardId)
      if (!board) return null
      const updated = {
        ...board,
        ...patch,
        updatedAt: nowIso(),
      }
      boards.set(boardId, updated)
      const items = boardItems.get(boardId) ?? []
      return makePublicBoardSummary(updated, items.length)
    },

    deleteBoard(boardId) {
      const board = boards.get(boardId)
      if (!board) return null
      boards.delete(boardId)
      const items = boardItems.get(boardId) ?? []
      boardItems.delete(boardId)
      return {
        boardId,
        deletedBoard: makePublicBoardSummary(board, items.length),
      }
    },

    createXOAuthState({ state, userId, codeVerifier, requestedScopes }) {
      xOAuthStates.set(state, {
        state,
        userId,
        codeVerifier,
        requestedScopes,
        createdAt: nowIso(),
      })
    },

    consumeXOAuthState(state) {
      const value = xOAuthStates.get(state) ?? null
      if (value) {
        xOAuthStates.delete(state)
      }
      return value
    },

    upsertXConnection({
      userId,
      xUserId,
      xUsername,
      scopes = [],
      status = 'connected',
      accessTokenEncrypted = null,
      refreshTokenEncrypted = null,
      tokenExpiresAt = null,
      tokenType = 'bearer',
    }) {
      const existing = xConnections.get(userId)
      const timestamp = nowIso()
      const record = {
        id: existing?.id ?? crypto.randomUUID(),
        userId,
        xUserId,
        xUsername,
        scopes,
        status,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt,
        tokenType,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      xConnections.set(userId, record)
      return { ...record }
    },

    getXConnection(userId) {
      const record = xConnections.get(userId)
      return record ? { ...record } : null
    },

    recordXSyncRun({ userId, triggeredBy = 'manual' }) {
      const entry = {
        id: crypto.randomUUID(),
        userId,
        triggeredBy,
        status: 'queued',
        itemsCreated: 0,
        itemsUpdated: 0,
        rawResult: null,
        errorMessage: null,
        createdAt: nowIso(),
      }
      xSyncRuns.push(entry)
      return { ...entry }
    },

    updateXSyncRun(runId, patch) {
      const index = xSyncRuns.findIndex((run) => run.id === runId)
      if (index < 0) return null
      xSyncRuns[index] = { ...xSyncRuns[index], ...patch }
      return { ...xSyncRuns[index] }
    },

    listXSyncRunsForUser(userId) {
      return xSyncRuns.filter((run) => run.userId === userId).map((run) => ({
        ...run,
      }))
    },

    getXSyncState(userId) {
      const value = xSyncState.get(userId)
      return value ? { ...value } : null
    },

    upsertXSyncState(userId, patch) {
      const current = xSyncState.get(userId) ?? {
        userId,
        likeSinceId: null,
        likeNextToken: null,
        lastLikeSyncAt: null,
        bookmarkSinceId: null,
        bookmarkNextToken: null,
        lastBookmarkSyncAt: null,
        lastSyncStatus: null,
        lastError: null,
      }
      const next = { ...current, ...patch }
      xSyncState.set(userId, next)
      return { ...next }
    },

    ensureDefaultBoard(userId) {
      for (const board of boards.values()) {
        if (board.ownerUserId === userId) {
          const items = boardItems.get(board.id) ?? []
          return makePublicBoardSummary(board, items.length)
        }
      }

      return this.createBoard({
        ownerUserId: userId,
        title: 'My Moodboard',
        description: 'Imported from X likes',
        isPublic: true,
      })
    },

    upsertBoardItemWithMedia({
      boardId,
      addedByUserId,
      sourceType,
      sourcePostId,
      sourcePostUrl,
      sourceAuthorId = null,
      sourceAuthorUsername = null,
      sourceAuthorDisplayName = null,
      title = null,
      caption = null,
      media = [],
      tags = [],
      createdAt = null,
    }) {
      const list = boardItems.get(boardId) ?? []
      let item = list.find(
        (existing) =>
          existing.sourceType === sourceType &&
          existing.sourcePostId &&
          sourcePostId &&
          existing.sourcePostId === sourcePostId,
      )

      const timestamp = createdAt ?? nowIso()
      const mappedMedia = media.map((m) => ({
        id: m.id ?? crypto.randomUUID(),
        mediaKey: m.mediaKey ?? null,
        mediaType: m.mediaType ?? 'photo',
        srcUrl: m.srcUrl,
        width: m.width ?? null,
        height: m.height ?? null,
        altText: m.altText ?? null,
        aspectRatio:
          m.aspectRatio ??
          (m.width && m.height ? Number(m.width) / Number(m.height) : null),
        status: m.status ?? 'active',
        createdAt: timestamp,
      }))

      if (!item) {
        item = {
          id: crypto.randomUUID(),
          boardId,
          addedByUserId,
          sourceType,
          sourcePostId,
          sourcePostUrl,
          sourceAuthorId,
          sourceAuthorUsername,
          sourceAuthorDisplayName,
          title,
          caption,
          tags: Array.from(new Set(tags.filter(Boolean))),
          createdAt: timestamp,
          media: mappedMedia,
        }
        list.push(item)
      } else {
        Object.assign(item, {
          sourcePostUrl,
          sourceAuthorId,
          sourceAuthorUsername,
          sourceAuthorDisplayName,
          title,
          caption,
          tags: Array.from(new Set(tags.filter(Boolean))),
          media: mappedMedia,
        })
      }

      boardItems.set(boardId, list)
      const board = boards.get(boardId)
      if (board) {
        board.updatedAt = nowIso()
        boards.set(boardId, board)
      }

      return mapItemToApiShape(item)
    },

    deleteUserData(userId) {
      profiles.delete(userId)
      adminUsers.delete(userId)
      xConnections.delete(userId)
      xSyncState.delete(userId)

      const deletedBoardIds = []
      for (const board of boards.values()) {
        if (board.ownerUserId !== userId) continue
        deletedBoardIds.push(board.id)
      }
      for (const boardId of deletedBoardIds) {
        boards.delete(boardId)
        boardItems.delete(boardId)
      }

      return {
        userId,
        deletedBoards: deletedBoardIds.length,
        xConnectionDeleted: true,
      }
    },
  }
}
