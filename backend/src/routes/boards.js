import { getAuthUser, requireAuth } from '../lib/auth.js'

async function canReadBoard(app, board, user) {
  if (!board) return false
  if (user) return board.ownerUserId === user.id
  if (!board.isPublic) return false
  if (typeof app.store.isAdminUser !== 'function') return false
  return Boolean(await app.store.isAdminUser(board.ownerUserId))
}

function canWriteBoard(board, user) {
  if (!board || !user) return false
  return board.ownerUserId === user.id
}

export async function boardRoutes(app) {
  app.get('/api/boards', async (request) => {
    const user = await getAuthUser(request)
    const boards = await app.store.listBoards({
      includePrivate: Boolean(user),
      ownerUserId: user?.id ?? null,
    })

    let filteredBoards = boards
    if (user) {
      filteredBoards = boards.filter((board) => board.ownerUserId === user.id)
    } else {
      const publicBoards = boards.filter((board) => board.isPublic)
      const adminFlags = await Promise.all(
        publicBoards.map((board) =>
          typeof app.store.isAdminUser === 'function'
            ? app.store.isAdminUser(board.ownerUserId)
            : Promise.resolve(false),
        ),
      )
      filteredBoards = publicBoards.filter((_, index) => Boolean(adminFlags[index]))
    }

    return {
      boards: filteredBoards,
    }
  })

  app.get('/api/boards/:boardId', async (request, reply) => {
    const user = await getAuthUser(request)
    const board = await app.store.getBoard(request.params.boardId)
    if (!(await canReadBoard(app, board, user))) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    return { board }
  })

  app.get('/api/boards/:boardId/items', async (request, reply) => {
    const user = await getAuthUser(request)
    const board = await app.store.getBoard(request.params.boardId)
    if (!(await canReadBoard(app, board, user))) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    const items = (await app.store.getBoardItems(request.params.boardId)) ?? []
    return {
      board,
      items,
    }
  })

  app.post('/api/boards', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const existingBoards = await app.store.listBoards({
      includePrivate: true,
      ownerUserId: user.id,
    })
    const existing = existingBoards.find((board) => board.ownerUserId === user.id) ?? null
    if (existing) {
      return reply.code(409).send({
        error: 'single_board_enforced',
        message: 'One moodboard per user is enabled. Reuse the existing board.',
        board: existing,
      })
    }

    const body = request.body ?? {}
    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : null

    if (!title) {
      return reply.code(400).send({
        error: 'validation_error',
        message: '`title` is required.',
      })
    }

    const description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null
    const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : true

    const board = await app.store.createBoard({
      ownerUserId: user.id,
      title,
      description,
      isPublic,
    })

    return reply.code(201).send({ board })
  })

  app.patch('/api/boards/:boardId', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const board = await app.store.getBoard(request.params.boardId)
    if (!canWriteBoard(board, user)) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    const body = request.body ?? {}
    const patch = {}

    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim()
    }
    if (typeof body.description === 'string') {
      patch.description = body.description.trim() || null
    }
    if (typeof body.isPublic === 'boolean') {
      patch.isPublic = body.isPublic
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Provide at least one mutable field: title, description, isPublic.',
      })
    }

    const updatedBoard = await app.store.updateBoard(request.params.boardId, patch)
    return { board: updatedBoard }
  })

  app.delete('/api/boards/:boardId', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const board = await app.store.getBoard(request.params.boardId)
    if (!canWriteBoard(board, user)) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    return reply.code(405).send({
      error: 'single_board_enforced',
      message: 'Deleting the only moodboard is disabled in single-board mode.',
      board,
    })
  })
}
