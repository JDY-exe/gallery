import React from 'react'
import { CloudDownload, Link2, LoaderCircle, RefreshCw } from 'lucide-react'

function buttonClass(active = false) {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs md:text-sm transition-colors ${
    active
      ? 'bg-white text-black border-white'
      : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
  }`
}

export function AdminPanel({
  open,
  onClose,
  isSignedIn,
  busyAction,
  onLogout,
  onToggleLoginForm,
  isAdmin,
  hasResolvedViewer,
  onAdminBootstrap,
  onRefresh,
  onConnectX,
  onSyncX,
  showLoginForm,
  loginEmail,
  onLoginEmailChange,
  loginPassword,
  onLoginPasswordChange,
  onLogin,
  apiBaseUrl,
  backendStorage,
  roleLabel,
  activeBoardTitle,
  statusBanner,
  dataError,
}) {
  return (
    <div className="fixed left-4 right-4 bottom-4 z-40 pointer-events-none md:left-12 md:right-auto md:max-w-4xl">
      {open ? (
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/65 backdrop-blur-xl p-3 md:p-4 shadow-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onClose} className={buttonClass()} type="button">
              Hide Panel
            </button>

            {isSignedIn ? (
              <button
                onClick={onLogout}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={onToggleLoginForm}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                Sign In
              </button>
            )}

            {isAdmin ? (
              <>
                <button
                  onClick={onRefresh}
                  className={buttonClass()}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'refresh' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh
                </button>

                <button
                  onClick={onConnectX}
                  className={buttonClass()}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'connect_x' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  Connect X
                </button>

                <button
                  onClick={onSyncX}
                  className={buttonClass(true)}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'sync_x' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <CloudDownload size={14} />
                  )}
                  Sync Likes
                </button>
              </>
            ) : isSignedIn && hasResolvedViewer ? (
              <button
                onClick={onAdminBootstrap}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                {busyAction === 'bootstrap_admin' ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Claim Admin (First User)
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                Sign in as admin to manage sync and X connection.
              </span>
            )}
          </div>

          {!isSignedIn && showLoginForm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={loginEmail}
                onChange={(event) => onLoginEmailChange(event.target.value)}
                className="h-9 min-w-[220px] rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/40"
                placeholder="Email"
                autoComplete="username"
              />
              <input
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                className="h-9 min-w-[220px] rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/40"
                placeholder="Password"
                type="password"
                autoComplete="current-password"
              />
              <button
                onClick={onLogin}
                className={buttonClass(true)}
                disabled={Boolean(busyAction)}
                type="button"
              >
                {busyAction === 'login' ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : null}
                Continue
              </button>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            <span>API: {apiBaseUrl}</span>
            <span>Storage: {backendStorage}</span>
            {roleLabel ? <span>Role: {roleLabel}</span> : null}
            {activeBoardTitle ? <span>Moodboard: {activeBoardTitle}</span> : null}
            {isAdmin ? <span>Auto-like sync: every 15 min (10 posts max)</span> : null}
            <span>Toggle: logo or Shift + A</span>
          </div>

          {statusBanner ? (
            <div
              className={`mt-2 rounded-xl px-3 py-2 text-xs ${
                statusBanner.kind === 'error'
                  ? 'bg-red-500/15 text-red-200 border border-red-400/20'
                  : statusBanner.kind === 'success'
                    ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20'
                    : 'bg-white/5 text-gray-200 border border-white/10'
              }`}
            >
              {statusBanner.text}
            </div>
          ) : null}

          {dataError ? (
            <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Backend error: {dataError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
