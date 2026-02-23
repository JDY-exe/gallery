import { getAuthUser, requireAuth } from '../lib/auth.js'

function canReadBoard(board, user) {
  if (!board) return false
  if (board.isPublic) return true
  if (!user) return false
  return board.ownerUserId === user.id
}

function canWriteBoard(board, user) {
  if (!board || !user) return false
  return board.ownerUserId === user.id
}

export async function boardRoutes(app) {
  app.get('/api/boards', async (request) => {
    const user = await getAuthUser(request)
    const boards = app.store.listBoards({
      includePrivate: Boolean(user),
      ownerUserId: user?.id ?? null,
    })

    return {
      boards,
    }
  })

  app.get('/api/boards/:boardId', async (request, reply) => {
    const user = await getAuthUser(request)
    const board = app.store.getBoard(request.params.boardId)
    if (!canReadBoard(board, user)) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    return { board }
  })

  app.get('/api/boards/:boardId/items', async (request, reply) => {
    const user = await getAuthUser(request)
    const board = app.store.getBoard(request.params.boardId)
    if (!canReadBoard(board, user)) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    const items = app.store.getBoardItems(request.params.boardId) ?? []
    return {
      board,
      items,
    }
  })

  app.post('/api/boards', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

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

    const board = app.store.createBoard({
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

    const board = app.store.getBoard(request.params.boardId)
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

    const updatedBoard = app.store.updateBoard(request.params.boardId, patch)
    return { board: updatedBoard }
  })

  app.delete('/api/boards/:boardId', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const board = app.store.getBoard(request.params.boardId)
    if (!canWriteBoard(board, user)) {
      return reply.code(404).send({ error: 'board_not_found' })
    }

    const result = app.store.deleteBoard(request.params.boardId)
    return { deleted: true, result }
  })
}
