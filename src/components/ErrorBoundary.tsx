import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Last line of defense: render a readable error + reload button instead of
// a blank white page when something throws during render.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-800/50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-900 bg-slate-900 p-6 text-center shadow-sm">
          <p className="text-3xl">😵</p>
          <h1 className="mt-2 text-lg font-bold text-slate-200">Something went wrong</h1>
          <p className="mt-1 text-xs break-all text-slate-400">{this.state.error.message}</p>
          <button
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Reload / โหลดใหม่
          </button>
        </div>
      </div>
    )
  }
}
