'use client'

import { useEffect, useState } from 'react'
import { Share2, Play, RefreshCw, Shield, Database, Activity } from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface State {
  round_number: number
  model_version: string
  last_loss: number
  participating_nodes: number
  updated_at: string
}

export default function FederatedAdminPage() {
  const [state, setState]   = useState<State | null>(null)
  const [metrics, setMetrics] = useState<{ labeledCases: number; doctorOverrides: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/federated')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setState(data.state)
      setMetrics(data.metrics)
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function runRound() {
    setRunning(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/admin/federated', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Round failed')
      setState(data.state)
      setMessage(data.message)
      await load()
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="glass h-48 shimmer rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center">
          <Share2 className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Federated Learning</h1>
          <p className="text-slate-400 text-sm">Privacy-preserving model updates — raw patient data never centralized</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
        <div className="flex items-start gap-3 text-sm text-slate-400">
          <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p>
            Simulated federated rounds aggregate only gradient-style statistics from edge nodes (ASHA tablets / clinic
            workstations). Identifiers and images stay on-device; the server merges updates into the shared
            <span className="text-slate-300"> TensorFlow Lite–compatible </span>
            skin model weights.
          </p>
        </div>

        {state && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-white/5 rounded-xl p-4 border border-white/8">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Round</p>
              <p className="text-2xl font-bold text-white mt-1">{state.round_number}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/8">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Val loss (simulated)</p>
              <p className="text-2xl font-bold text-sky-400 mt-1">{state.last_loss.toFixed(4)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/8">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Model version</p>
              <p className="text-sm font-mono text-slate-200 mt-1 truncate">{state.model_version}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/8">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Participating nodes</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{state.participating_nodes}</p>
            </div>
          </div>
        )}

        {metrics && (
          <div className="flex items-center gap-6 text-xs text-slate-500 border-t border-white/8 pt-4">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Doctor-labeled cases: <strong className="text-slate-300">{metrics.labeledCases}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Overrides (training signal): <strong className="text-slate-300">{metrics.doctorOverrides}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={runRound}
            disabled={running}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {running ? 'Running round…' : 'Run federated round'}
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-slate-200 text-sm px-4 py-2.5 rounded-xl cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {message && (
          <p className="text-sm text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
