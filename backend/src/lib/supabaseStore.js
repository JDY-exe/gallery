function nowIso() {
  return new Date().toISOString()
}

function assertSupabaseSuccess(result, context) {
  if (result.error) {
    const error = new Error(`${context}: ${result.error.message}`)
    error.code = result.error.code
    error.details = result.error.details
    error.hint = result.error.hint
    throw error
  }
  return result.data
}

function mapBoardRow(boardRow, itemCount = 0) {
  if (!boardRow) return null
  return {
    id: boardRow.id,
    ownerUserId: boardRow.owner_user_id,
    title: boardRow.title,
    description: boardRow.description,
    isPublic: boardRow.is_public,
    itemCount,
    createdAt: boardRow.created_at,
    updatedAt: boardRow.updated_at,
  }
}

function mapBoardItemRow(itemRow, mediaRows = [], tagNames = []) {
  const media = mediaRows
    .map((mediaRow) => ({
      id: mediaRow.id,
      mediaKey: mediaRow.media_key,
      mediaType: mediaRow.media_type,
      srcUrl: mediaRow.src_url,
      width: mediaRow.width,
      height: mediaRow.height,
      altText: mediaRow.alt_text,
      aspectRatio: mediaRow.aspect_ratio,
      status: mediaRow.status,
      createdAt: mediaRow.created_at,
    }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

  const primaryMedia = media[0] ?? null
  const createdYear = new Date(itemRow.created_at).getUTCFullYear()

  return {
    id: itemRow.id,
    boardId: itemRow.board_id,
    title: itemRow.title ?? 'Untitled',
    artist: itemRow.source_author_username
      ? `@${itemRow.source_author_username}`
      : itemRow.source_author_display_name ?? 'Unknown',
    year: Number.isFinite(createdYear) ? String(createdYear) : 'Unknown',
    caption: itemRow.caption ?? null,
    src: primaryMedia?.srcUrl ?? null,
    aspectRatio: primaryMedia?.aspectRatio ?? null,
    tags: tagNames,
    source: {
      type: itemRow.source_type,
      postId: itemRow.source_post_id,
      postUrl: itemRow.source_post_url,
      authorId: itemRow.source_author_id,
      authorUsername: itemRow.source_author_username,
    },
    media,
    createdAt: itemRow.created_at,
  }
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
}

export function createSupabaseStore({ serviceClient }) {
  if (!serviceClient) {
    throw new Error('Supabase service client is required for Supabase store.')
  }

  const db = serviceClient

  async function ensureProfile(userId, overrides = {}) {
    let username = overrides.username ?? null
    if (typeof username === 'string') {
      username = username.trim() || null
    }

    if (username) {
      const usernameCheck = await db
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      const usernameOwner = assertSupabaseSuccess(usernameCheck, 'ensureProfile:usernameCheck')
      if (usernameOwner?.id && usernameOwner.id !== userId) {
        // Keep the sign-in flow resilient if an old/stale profile still owns this username.
        username = null
      }
    }

    const payload = {
      id: userId,
      username,
      display_name: overrides.displayName ?? 'User',
      email: overrides.email ?? null,
    }

    const result = await db
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, username, display_name, email, created_at')
      .single()

    return assertSupabaseSuccess(result, 'ensureProfile')
  }

  async function isAdminUser(userId) {
    if (!userId) return false
    const result = await db
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    const row = assertSupabaseSuccess(result, 'isAdminUser')
    return Boolean(row?.user_id)
  }

  async function hasAdminUsers() {
    const result = await db
      .from('admin_users')
      .select('user_id')
      .limit(1)

    const rows = assertSupabaseSuccess(result, 'hasAdminUsers')
    return rows.length > 0
  }

  async function grantAdminUser(userId) {
    const result = await db
      .from('admin_users')
      .upsert(
        {
          user_id: userId,
        },
        { onConflict: 'user_id' },
      )
      .select('user_id, created_at')
      .single()

    const row = assertSupabaseSuccess(result, 'grantAdminUser')
    return {
      userId: row.user_id,
      createdAt: row.created_at,
    }
  }

  async function getItemCountsByBoardIds(boardIds) {
    if (!boardIds.length) return new Map()

    const result = await db
      .from('board_items')
      .select('board_id')
      .in('board_id', boardIds)

    const rows = assertSupabaseSuccess(result, 'getItemCountsByBoardIds')
    const counts = new Map()
    for (const row of rows) {
      counts.set(row.board_id, (counts.get(row.board_id) ?? 0) + 1)
    }
    return counts
  }

  async function listBoards({ includePrivate = false, ownerUserId = null } = {}) {
    const result = await db
      .from('boards')
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .order('updated_at', { ascending: false })

    const rows = assertSupabaseSuccess(result, 'listBoards')
    const filtered = rows.filter((row) => {
      if (row.is_public) return true
      if (!includePrivate || !ownerUserId) return false
      return row.owner_user_id === ownerUserId
    })

    const counts = await getItemCountsByBoardIds(filtered.map((row) => row.id))
    return filtered.map((row) => mapBoardRow(row, counts.get(row.id) ?? 0))
  }

  async function getBoard(boardId) {
    const result = await db
      .from('boards')
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .eq('id', boardId)
      .maybeSingle()

    const row = assertSupabaseSuccess(result, 'getBoard')
    if (!row) return null
    const counts = await getItemCountsByBoardIds([boardId])
    return mapBoardRow(row, counts.get(boardId) ?? 0)
  }

  async function getBoardItems(boardId) {
    const itemsResult = await db
      .from('board_items')
      .select(
        'id, board_id, source_type, source_post_id, source_post_url, source_author_id, source_author_username, source_author_display_name, title, caption, created_at',
      )
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })

    const itemRows = assertSupabaseSuccess(itemsResult, 'getBoardItems:items')
    if (!itemRows.length) return []

    const itemIds = itemRows.map((row) => row.id)

    const [mediaResult, tagJoinResult] = await Promise.all([
      db
        .from('board_item_media')
        .select(
          'id, board_item_id, media_key, media_type, src_url, width, height, alt_text, aspect_ratio, status, created_at',
        )
        .in('board_item_id', itemIds),
      db
        .from('board_item_tags')
        .select('board_item_id, tags(name)')
        .in('board_item_id', itemIds),
    ])

    const mediaRows = assertSupabaseSuccess(mediaResult, 'getBoardItems:media')
    const tagJoinRows = assertSupabaseSuccess(tagJoinResult, 'getBoardItems:tags')

    const mediaByItem = new Map()
    for (const row of mediaRows) {
      if (!mediaByItem.has(row.board_item_id)) mediaByItem.set(row.board_item_id, [])
      mediaByItem.get(row.board_item_id).push(row)
    }

    const tagsByItem = new Map()
    for (const row of tagJoinRows) {
      const itemId = row.board_item_id
      const tagName =
        row.tags && typeof row.tags === 'object' && 'name' in row.tags
          ? row.tags.name
          : null
      if (!tagName) continue
      if (!tagsByItem.has(itemId)) tagsByItem.set(itemId, [])
      tagsByItem.get(itemId).push(tagName)
    }

    return itemRows.map((itemRow) =>
      mapBoardItemRow(
        itemRow,
        mediaByItem.get(itemRow.id) ?? [],
        uniqueStrings(tagsByItem.get(itemRow.id) ?? []),
      ),
    )
  }

  async function createBoard({ ownerUserId, title, description = null, isPublic = true }) {
    const existingResult = await db
      .from('boards')
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: true })
      .limit(1)

    const existingRows = assertSupabaseSuccess(existingResult, 'createBoard:listExisting')
    if (existingRows.length) {
      const counts = await getItemCountsByBoardIds([existingRows[0].id])
      return mapBoardRow(existingRows[0], counts.get(existingRows[0].id) ?? 0)
    }

    const result = await db
      .from('boards')
      .insert({
        owner_user_id: ownerUserId,
        title,
        description,
        is_public: isPublic,
      })
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .single()

    const row = assertSupabaseSuccess(result, 'createBoard')
    return mapBoardRow(row, 0)
  }

  async function updateBoard(boardId, patch) {
    const payload = {}
    if ('title' in patch) payload.title = patch.title
    if ('description' in patch) payload.description = patch.description
    if ('isPublic' in patch) payload.is_public = patch.isPublic

    const result = await db
      .from('boards')
      .update(payload)
      .eq('id', boardId)
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .maybeSingle()

    const row = assertSupabaseSuccess(result, 'updateBoard')
    if (!row) return null
    const counts = await getItemCountsByBoardIds([boardId])
    return mapBoardRow(row, counts.get(boardId) ?? 0)
  }

  async function deleteBoard(boardId) {
    const board = await getBoard(boardId)
    if (!board) return null
    const result = await db.from('boards').delete().eq('id', boardId)
    assertSupabaseSuccess(result, 'deleteBoard')
    return {
      boardId,
      deletedBoard: board,
    }
  }

  async function createXOAuthState({ state, userId, codeVerifier, requestedScopes }) {
    const result = await db.from('x_oauth_states').upsert(
      {
        state,
        user_id: userId,
        code_verifier: codeVerifier,
        requested_scopes: requestedScopes,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      { onConflict: 'state' },
    )

    assertSupabaseSuccess(result, 'createXOAuthState')
  }

  async function consumeXOAuthState(state) {
    const fetchResult = await db
      .from('x_oauth_states')
      .select('state, user_id, code_verifier, requested_scopes, created_at, expires_at')
      .eq('state', state)
      .maybeSingle()

    const row = assertSupabaseSuccess(fetchResult, 'consumeXOAuthState:fetch')
    if (!row) return null

    const deleteResult = await db.from('x_oauth_states').delete().eq('state', state)
    assertSupabaseSuccess(deleteResult, 'consumeXOAuthState:delete')

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return null
    }

    return {
      state: row.state,
      userId: row.user_id,
      codeVerifier: row.code_verifier,
      requestedScopes: Array.isArray(row.requested_scopes) ? row.requested_scopes : [],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }
  }

  async function upsertXConnection({
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
    const payload = {
      user_id: userId,
      x_user_id: xUserId,
      x_username: xUsername,
      scopes,
      status,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: tokenExpiresAt,
      token_type: tokenType,
      revoked_at: null,
      updated_at: nowIso(),
    }

    const result = await db
      .from('x_connections')
      .upsert(payload, { onConflict: 'user_id' })
      .select(
        'id, user_id, x_user_id, x_username, scopes, status, token_type, access_token_encrypted, refresh_token_encrypted, token_expires_at, created_at, updated_at, revoked_at',
      )
      .single()

    const row = assertSupabaseSuccess(result, 'upsertXConnection')
    return {
      id: row.id,
      userId: row.user_id,
      xUserId: row.x_user_id,
      xUsername: row.x_username,
      scopes: row.scopes ?? [],
      status: row.status,
      tokenType: row.token_type,
      accessTokenEncrypted: row.access_token_encrypted,
      refreshTokenEncrypted: row.refresh_token_encrypted,
      tokenExpiresAt: row.token_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    }
  }

  async function getXConnection(userId) {
    const result = await db
      .from('x_connections')
      .select(
        'id, user_id, x_user_id, x_username, scopes, status, token_type, access_token_encrypted, refresh_token_encrypted, token_expires_at, created_at, updated_at, revoked_at',
      )
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle()

    const row = assertSupabaseSuccess(result, 'getXConnection')
    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      xUserId: row.x_user_id,
      xUsername: row.x_username,
      scopes: row.scopes ?? [],
      status: row.status,
      tokenType: row.token_type,
      accessTokenEncrypted: row.access_token_encrypted,
      refreshTokenEncrypted: row.refresh_token_encrypted,
      tokenExpiresAt: row.token_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    }
  }

  async function getXSyncState(userId) {
    const result = await db
      .from('x_sync_state')
      .select(
        'user_id, bookmark_since_id, bookmark_next_token, last_bookmark_sync_at, last_sync_status, last_error',
      )
      .eq('user_id', userId)
      .maybeSingle()

    const row = assertSupabaseSuccess(result, 'getXSyncState')
    if (!row) return null
    return {
      userId: row.user_id,
      likeSinceId: row.bookmark_since_id,
      likeNextToken: row.bookmark_next_token,
      lastLikeSyncAt: row.last_bookmark_sync_at,
      bookmarkSinceId: row.bookmark_since_id,
      bookmarkNextToken: row.bookmark_next_token,
      lastBookmarkSyncAt: row.last_bookmark_sync_at,
      lastSyncStatus: row.last_sync_status,
      lastError: row.last_error,
    }
  }

  async function upsertXSyncState(userId, patch) {
    const bookmarkSinceId =
      patch.bookmarkSinceId !== undefined ? patch.bookmarkSinceId : patch.likeSinceId
    const bookmarkNextToken =
      patch.bookmarkNextToken !== undefined
        ? patch.bookmarkNextToken
        : patch.likeNextToken
    const lastBookmarkSyncAt =
      patch.lastBookmarkSyncAt !== undefined
        ? patch.lastBookmarkSyncAt
        : patch.lastLikeSyncAt

    const payload = {
      user_id: userId,
      ...(bookmarkSinceId !== undefined
        ? { bookmark_since_id: bookmarkSinceId }
        : {}),
      ...(bookmarkNextToken !== undefined
        ? { bookmark_next_token: bookmarkNextToken }
        : {}),
      ...(lastBookmarkSyncAt !== undefined
        ? { last_bookmark_sync_at: lastBookmarkSyncAt }
        : {}),
      ...(patch.lastSyncStatus !== undefined
        ? { last_sync_status: patch.lastSyncStatus }
        : {}),
      ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
      updated_at: nowIso(),
    }

    const result = await db.from('x_sync_state').upsert(payload, {
      onConflict: 'user_id',
    })
    assertSupabaseSuccess(result, 'upsertXSyncState')
  }

  async function recordXSyncRun({ userId, triggeredBy = 'manual' }) {
    const result = await db
      .from('x_sync_runs')
      .insert({
        user_id: userId,
        triggered_by: triggeredBy,
        status: 'queued',
      })
      .select(
        'id, user_id, triggered_by, status, created_at, completed_at, items_created, items_updated, raw_result, error_message',
      )
      .single()

    const row = assertSupabaseSuccess(result, 'recordXSyncRun')
    return {
      id: row.id,
      userId: row.user_id,
      triggeredBy: row.triggered_by,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      itemsCreated: row.items_created ?? 0,
      itemsUpdated: row.items_updated ?? 0,
      rawResult: row.raw_result ?? null,
      errorMessage: row.error_message ?? null,
    }
  }

  async function updateXSyncRun(runId, patch) {
    const payload = {}
    if (patch.status !== undefined) payload.status = patch.status
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt
    if (patch.itemsCreated !== undefined) payload.items_created = patch.itemsCreated
    if (patch.itemsUpdated !== undefined) payload.items_updated = patch.itemsUpdated
    if (patch.rawResult !== undefined) payload.raw_result = patch.rawResult
    if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage

    const result = await db
      .from('x_sync_runs')
      .update(payload)
      .eq('id', runId)
      .select(
        'id, user_id, triggered_by, status, created_at, completed_at, items_created, items_updated, raw_result, error_message',
      )
      .single()

    const row = assertSupabaseSuccess(result, 'updateXSyncRun')
    return {
      id: row.id,
      userId: row.user_id,
      triggeredBy: row.triggered_by,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      itemsCreated: row.items_created ?? 0,
      itemsUpdated: row.items_updated ?? 0,
      rawResult: row.raw_result ?? null,
      errorMessage: row.error_message ?? null,
    }
  }

  async function ensureDefaultBoard(userId) {
    const listResult = await db
      .from('boards')
      .select('id, owner_user_id, title, description, is_public, created_at, updated_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)

    const rows = assertSupabaseSuccess(listResult, 'ensureDefaultBoard:list')
    if (rows.length) {
      const counts = await getItemCountsByBoardIds([rows[0].id])
      return mapBoardRow(rows[0], counts.get(rows[0].id) ?? 0)
    }

    return createBoard({
      ownerUserId: userId,
      title: 'My Moodboard',
      description: 'Imported from X likes',
      isPublic: true,
    })
  }

  async function upsertTagNamesForItem(boardItemId, tagNames) {
    const uniqueTagNames = uniqueStrings(tagNames).slice(0, 24)
    if (!uniqueTagNames.length) return

    const tagInsertResult = await db
      .from('tags')
      .upsert(uniqueTagNames.map((name) => ({ name })), { onConflict: 'name' })
      .select('id, name')

    const tagRows = assertSupabaseSuccess(tagInsertResult, 'upsertTagNamesForItem:tags')
    const tagIds = tagRows
      .filter((row) => uniqueTagNames.includes(row.name))
      .map((row) => ({ board_item_id: boardItemId, tag_id: row.id }))

    if (!tagIds.length) return

    const deleteExisting = await db
      .from('board_item_tags')
      .delete()
      .eq('board_item_id', boardItemId)
    assertSupabaseSuccess(deleteExisting, 'upsertTagNamesForItem:deleteExisting')

    const insertJoins = await db
      .from('board_item_tags')
      .insert(tagIds)
    assertSupabaseSuccess(insertJoins, 'upsertTagNamesForItem:insertJoins')
  }

  async function upsertBoardItemWithMedia({
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
    if (!sourcePostId) {
      throw new Error('upsertBoardItemWithMedia requires sourcePostId for dedupe.')
    }

    const timestamp = createdAt ?? nowIso()
    const itemResult = await db
      .from('board_items')
      .upsert(
        {
          board_id: boardId,
          added_by_user_id: addedByUserId,
          source_type: sourceType,
          source_post_id: sourcePostId,
          source_post_url: sourcePostUrl,
          source_author_id: sourceAuthorId,
          source_author_username: sourceAuthorUsername,
          source_author_display_name: sourceAuthorDisplayName,
          title,
          caption,
          created_at: timestamp,
        },
        { onConflict: 'board_id,source_type,source_post_id' },
      )
      .select(
        'id, board_id, source_type, source_post_id, source_post_url, source_author_id, source_author_username, source_author_display_name, title, caption, created_at',
      )
      .single()

    const itemRow = assertSupabaseSuccess(itemResult, 'upsertBoardItemWithMedia:item')

    const deleteMediaResult = await db
      .from('board_item_media')
      .delete()
      .eq('board_item_id', itemRow.id)
    assertSupabaseSuccess(deleteMediaResult, 'upsertBoardItemWithMedia:deleteMedia')

    const mediaPayload = media
      .filter((m) => m?.srcUrl)
      .map((m) => ({
        board_item_id: itemRow.id,
        media_key: m.mediaKey ?? null,
        media_type: m.mediaType ?? 'photo',
        src_url: m.srcUrl,
        width: m.width ?? null,
        height: m.height ?? null,
        alt_text: m.altText ?? null,
        aspect_ratio:
          m.aspectRatio ??
          (m.width && m.height ? Number(m.width) / Number(m.height) : null),
        status: m.status ?? 'active',
      }))

    let insertedMediaRows = []
    if (mediaPayload.length) {
      const mediaInsertResult = await db
        .from('board_item_media')
        .insert(mediaPayload)
        .select(
          'id, board_item_id, media_key, media_type, src_url, width, height, alt_text, aspect_ratio, status, created_at',
        )
      insertedMediaRows = assertSupabaseSuccess(
        mediaInsertResult,
        'upsertBoardItemWithMedia:insertMedia',
      )
    }

    await upsertTagNamesForItem(itemRow.id, tags)

    return mapBoardItemRow(itemRow, insertedMediaRows, uniqueStrings(tags))
  }

  async function deleteUserData(userId) {
    const xDelete = await db.from('x_connections').delete().eq('user_id', userId)
    assertSupabaseSuccess(xDelete, 'deleteUserData:x_connections')

    const boardsBeforeDelete = await db
      .from('boards')
      .select('id')
      .eq('owner_user_id', userId)
    const boardRows = assertSupabaseSuccess(boardsBeforeDelete, 'deleteUserData:listBoards')

    const boardsDelete = await db.from('boards').delete().eq('owner_user_id', userId)
    assertSupabaseSuccess(boardsDelete, 'deleteUserData:boards')

    const profileDelete = await db.from('profiles').delete().eq('id', userId)
    assertSupabaseSuccess(profileDelete, 'deleteUserData:profile')

    return {
      userId,
      deletedBoards: boardRows.length,
      xConnectionDeleted: true,
    }
  }

  return {
    kind: 'supabase',
    ensureProfile,
    isAdminUser,
    hasAdminUsers,
    grantAdminUser,
    listBoards,
    getBoard,
    getBoardItems,
    createBoard,
    updateBoard,
    deleteBoard,
    createXOAuthState,
    consumeXOAuthState,
    upsertXConnection,
    getXConnection,
    getXSyncState,
    upsertXSyncState,
    recordXSyncRun,
    updateXSyncRun,
    ensureDefaultBoard,
    upsertBoardItemWithMedia,
    deleteUserData,
  }
}
