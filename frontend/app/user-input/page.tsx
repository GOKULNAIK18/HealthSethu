'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { symptomsList, karnatakaDistricts } from '@/lib/mock-data'
import {
  UserPlus, Upload, X, CheckCircle2, ArrowRight,
  ImageIcon, AlertCircle, ChevronRight, Loader2, Brain, Camera,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/auth-context'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

type Step = 'details' | 'upload' | 'processing' | 'done'

interface Form {
  name: string; age: string; gender: string
  village: string; district: string; state: string; phone: string
}

const INIT: Form = { name:'', age:'', gender:'', village:'', district:'', state:'Madhya Pradesh', phone:'' }

interface CreatedCase {
  id: number
  case_code: string
  ai_disease: string
  ai_confidence: number
  openai_disease?: string
  openai_confidence?: number
  severity: string
  carePathway?: string
  recommendedAction?: string
  reasoning?: string[]
}

export default function UserInputPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { user } = useAuth()
  const isPatient = user?.role === 'patient'
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [step,     setStep]     = useState<Step>('details')
  const [form,     setForm]     = useState<Form>(INIT)
  const [errors,   setErrors]   = useState<Partial<Form>>({})
  const [imageFile,setImageFile]= useState<File | null>(null)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [duration, setDuration] = useState(5)
  const [condition,setCondition]= useState('')
  const [drag,     setDrag]     = useState(false)
  const [procMsg,  setProcMsg]  = useState('')
  const [created,  setCreated]  = useState<CreatedCase | null>(null)
  const [error,    setError]    = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [districtQuery, setDistrictQuery] = useState('')
  const [districtOpen, setDistrictOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setForm(prev => ({
      ...prev,
      name: user.name || prev.name,
      phone: user.phone || prev.phone,
      village: user.village || prev.village,
      district: user.district || prev.district,
    }))
  }, [user])

  function validate(): boolean {
    const e: Partial<Form> = {}
    if (!form.name.trim())  e.name    = 'Name is required'
    if (!form.age || isNaN(+form.age) || +form.age < 1 || +form.age > 120) e.age = 'Valid age 1–120'
    if (!form.gender)       e.gender  = 'Select gender'
    if (!form.village.trim())e.village = 'Village is required'
    if (!/^\d{10}$/.test(form.phone)) e.phone = '10-digit phone number'
    setErrors(e)
    return !Object.keys(e).length
  }

  function handleFile(f: File | null) {
    if (!f || !f.type.startsWith('image/')) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play()
    }
  }, [cameraOpen])

  async function openCamera() {
    setError('')
    try {
      setCameraBusy(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      setError('Could not access camera. Please allow permission or use file upload.')
    } finally {
      setCameraBusy(false)
    }
  }

  function closeCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  function captureFromCamera() {
    if (!videoRef.current) return
    const video = videoRef.current
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(blob => {
      if (!blob) return
      const captured = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      handleFile(captured)
      closeCamera()
    }, 'image/jpeg', 0.92)
  }

  async function handleSubmit() {
    if (!imageFile) return
    setError('')
    setStep('processing')

    try {
      // 1. Resolve patient record (reuse existing for patient role)
      setProcMsg(isPatient ? 'Checking your patient profile…' : 'Creating patient record…')
      let patient: { id: number } | null = null
      if (isPatient) {
        const existing = await apiFetch('/api/patients')
        if (existing.ok) {
          const d = await existing.json()
          const first = (d.patients ?? [])[0]
          if (first?.id) patient = { id: Number(first.id) }
        }
      }

      if (!patient) {
        const patRes = await apiFetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name || user?.name || 'Patient',
            age: form.age,
            gender: form.gender,
            village: form.village || user?.village || 'Unknown',
            district: form.district || user?.district || '',
            state: form.state,
            phone: form.phone || user?.phone || '0000000000',
          }),
        })
        if (!patRes.ok) {
          const d = await patRes.json()
          throw new Error(d.error ?? 'Failed to create patient')
        }
        const d = await patRes.json()
        patient = { id: d.patient.id as number }
      }

      // 2. Create case (AI diagnosis happens server-side)
      setProcMsg('Running AI diagnosis engine…')
      await new Promise(r => setTimeout(r, 600))
      const caseRes = await apiFetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          condition: condition || 'Skin Condition',
          duration_days: duration,
          symptoms,
          assigned_asha: 'Rekha Verma',
        }),
      })
      if (!caseRes.ok) throw new Error('Failed to create case')
      const { case: newCase, prediction: diagnosis } = await caseRes.json()

      // 3. Upload image
      setProcMsg('Uploading and analysing image…')
      await new Promise(r => setTimeout(r, 400))
      const fd = new FormData()
      fd.append('image', imageFile)
      fd.append('label', 'Initial upload')
      const imgRes = await apiFetch(`/api/cases/${newCase.id}/images`, { method: 'POST', body: fd })
      if (!imgRes.ok) throw new Error('Image upload failed')
      const imgData = await imgRes.json()
      const finalDiagnosis = imgData.prediction ?? diagnosis

      setCreated({
        id: newCase.id,
        case_code: newCase.case_code,
        ai_disease: finalDiagnosis.disease,
        ai_confidence: finalDiagnosis.confidence,
        openai_disease: finalDiagnosis.openaiPrediction?.disease,
        openai_confidence: finalDiagnosis.openaiPrediction?.confidence,
        severity: finalDiagnosis.severity,
        carePathway: finalDiagnosis.carePathway,
        recommendedAction: finalDiagnosis.recommendedAction,
        reasoning: finalDiagnosis.reasoning,
      })
      setStep('done')
    } catch (e: any) {
      setError(e.message ?? 'Submission failed')
      setStep('upload')
    }
  }

  const inp = (k: keyof Form) =>
    clsx('w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all',
      errors[k] ? 'border-red-500/50' : 'border-white/8 focus:border-sky-500/50')

  /* ── Processing screen ── */
  if (step === 'processing') return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass p-10 rounded-3xl max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-sky-500/20 rounded-2xl flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Processing Case</h2>
          <p className="text-slate-400 text-sm mt-1">AI is analysing your data</p>
        </div>
        <p className="text-sm text-sky-400 font-medium animate-pulse">{procMsg}</p>
        <div className="w-full bg-white/8 rounded-full h-1.5">
          <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full shimmer w-3/4" />
        </div>
      </div>
    </div>
  )

  /* ── Done screen ── */
  if (step === 'done' && created) {
    const sev = created.severity as 'Early'|'Moderate'|'Severe'
    const sevColor = sev==='Severe' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                   : sev==='Moderate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                   : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass p-8 rounded-3xl max-w-lg w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Case Registered</h2>
              <p className="text-xs text-slate-500">Case ID: <strong className="text-slate-300">{created.case_code}</strong></p>
            </div>
          </div>

          {/* AI Result */}
          <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <p className="text-sm font-semibold text-white">{t('userInput.aiDiagnosis')}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Predicted Condition</p>
                <p className="text-sm font-bold text-slate-200 mt-0.5">{created.ai_disease}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Confidence</p>
                <p className="text-sm font-bold text-emerald-400">{created.ai_confidence}%</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/8 pt-2">
              <div>
                <p className="text-xs text-slate-500">{t('userInput.openaiDiagnosis')}</p>
                <p className="text-sm font-bold text-slate-200 mt-0.5">{created.openai_disease ?? 'Unavailable'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Confidence</p>
                <p className="text-sm font-bold text-violet-400">
                  {created.openai_confidence !== undefined ? `${created.openai_confidence}%` : 'N/A'}
                </p>
              </div>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold ${sevColor}`}>
              <span className="w-2 h-2 rounded-full bg-current" />
              Severity: {created.severity}
            </div>
            {created.carePathway && (
              <p className="text-xs text-slate-400 border-t border-white/8 pt-2">{created.carePathway}</p>
            )}
          </div>

          {/* Reasoning */}
          {created.reasoning?.length ? (
            <div className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">AI Reasoning</p>
              {created.reasoning.map((r, i) => (
                <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                  <span className="text-sky-500 mt-0.5">•</span>{r}
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={() => { setForm(INIT); setSymptoms([]); setDuration(5); setImageFile(null); setPreview(null); setCondition(''); setStep('details') }}
              className="flex-1 bg-white/8 hover:bg-white/12 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              New Case
            </button>
            <button onClick={() => router.push('/ai-prediction')}
              className="flex-1 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer">
              {t('userInput.viewDiagnosis')} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t('userInput.title')}</h1>
          <p className="text-slate-400 text-xs">
            {isPatient ? 'Submit your own case details and symptoms' : 'Patient registration and case submission'}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[(isPatient ? 'Your Details' : 'Patient Details'), 'Upload & Symptoms'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
              (step==='details' ? i===0 : i===1) ? 'bg-sky-500 text-white'
              : i===0 && step==='upload' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-white/8 text-slate-500')}>
              {i===0 && step==='upload' ? '✓' : i+1}
            </div>
            <span className={clsx('text-xs', (step==='details' ? i===0 : i===1) ? 'text-slate-200 font-medium' : 'text-slate-500')}>{label}</span>
            {i===0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Step 1: Patient details */}
      {step === 'details' && (
        <div className="glass p-6 space-y-5">
          <h2 className="text-base font-semibold text-white border-b border-white/8 pb-3">
            {isPatient ? 'Your Information' : 'Patient Information'}
          </h2>
          {isPatient ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account Name">
                  <div className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-300">
                    {form.name || user?.name || '—'}
                  </div>
                </Field>
                <Field label="Phone * (10 digits)" error={errors.phone}>
                  <input
                    type="tel"
                    className={inp('phone')}
                    placeholder="9876543210"
                    maxLength={10}
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                  />
                </Field>
                <Field label="Age *" error={errors.age}>
                  <input
                    type="number"
                    className={inp('age')}
                    placeholder="35"
                    min={1}
                    max={120}
                    value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                  />
                </Field>
                <Field label="Gender *" error={errors.gender}>
                  <div className="relative">
                    <select className={clsx(inp('gender'), 'cursor-pointer pr-8')} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="" className="bg-slate-900">Select gender</option>
                      <option value="Female" className="bg-slate-900">Female</option>
                      <option value="Male" className="bg-slate-900">Male</option>
                      <option value="Other" className="bg-slate-900">Other</option>
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▾</span>
                  </div>
                </Field>
                <Field label="Village / Town *" error={errors.village}>
                  <input className={inp('village')} placeholder="e.g. Rampur Kalan" value={form.village} onChange={e => setForm(f => ({ ...f, village: e.target.value }))} />
                </Field>
                <Field label="District">
                  <DistrictDropdown
                    value={form.district}
                    query={districtQuery}
                    open={districtOpen}
                    onQueryChange={q => { setDistrictQuery(q); setDistrictOpen(true); setForm(f => ({ ...f, district: q })) }}
                    onSelect={d => { setForm(f => ({ ...f, district: d })); setDistrictQuery(d); setDistrictOpen(false) }}
                    onBlur={() => setTimeout(() => setDistrictOpen(false), 150)}
                    onFocus={() => setDistrictOpen(true)}
                  />
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                You are submitting this case as your own profile. Staff-style patient registration is hidden for patient accounts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name *" error={errors.name}>
                <input className={inp('name')} placeholder="e.g. Priya Devi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </Field>
              <Field label="Age *" error={errors.age}>
                <input type="number" className={inp('age')} placeholder="35" min={1} max={120} value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))} />
              </Field>
              <Field label="Gender *" error={errors.gender}>
                <div className="relative">
                  <select className={clsx(inp('gender'),'cursor-pointer pr-8')} value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}>
                    <option value="" className="bg-slate-900">Select gender</option>
                    <option value="Female" className="bg-slate-900">Female</option>
                    <option value="Male"   className="bg-slate-900">Male</option>
                    <option value="Other"  className="bg-slate-900">Other</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▾</span>
                </div>
              </Field>
              <Field label="Phone * (10 digits)" error={errors.phone}>
                <input type="tel" className={inp('phone')} placeholder="9876543210" maxLength={10}
                  value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value.replace(/\D/g,'')}))} />
              </Field>
              <Field label="Village / Town *" error={errors.village}>
                <input className={inp('village')} placeholder="e.g. Rampur Kalan" value={form.village} onChange={e=>setForm(f=>({...f,village:e.target.value}))} />
              </Field>
              <Field label="District">
                <DistrictDropdown
                  value={form.district}
                  query={districtQuery}
                  open={districtOpen}
                  onQueryChange={q => { setDistrictQuery(q); setDistrictOpen(true); setForm(f => ({ ...f, district: q })) }}
                  onSelect={d => { setForm(f => ({ ...f, district: d })); setDistrictQuery(d); setDistrictOpen(false) }}
                  onBlur={() => setTimeout(() => setDistrictOpen(false), 150)}
                  onFocus={() => setDistrictOpen(true)}
                />
              </Field>
              <Field label="State" col={2}>
                <input className={inp('state')} value={form.state} onChange={e=>setForm(f=>({...f,state:e.target.value}))} />
              </Field>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={()=>{ if(validate()) setStep('upload') }}
              className="bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 cursor-pointer">
              {t('userInput.nextUpload')} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload + symptoms */}
      {step === 'upload' && (
        <div className="grid grid-cols-2 gap-4">

          {/* Upload */}
          <div className="glass p-6 space-y-4">
            <h2 className="text-base font-semibold text-white border-b border-white/8 pb-3">Upload Image</h2>
            <Field label="Condition / Chief Complaint">
              <input className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                placeholder="e.g. Skin rash, wound, burn…" value={condition} onChange={e=>setCondition(e.target.value)} />
            </Field>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e=>handleFile(e.target.files?.[0]??null)} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="bg-white/8 hover:bg-white/12 text-slate-300 text-xs font-medium py-2 rounded-xl transition-colors border border-white/10 cursor-pointer"
              >
                Upload from device
              </button>
              <button
                type="button"
                onClick={openCamera}
                disabled={cameraBusy}
                className="bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-60 text-sky-300 text-xs font-semibold py-2 rounded-xl transition-colors border border-sky-500/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                {cameraBusy ? 'Opening…' : 'Capture image'}
              </button>
            </div>
            {preview ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/10">
                <img src={preview} alt="Preview" className="w-full h-52 object-cover" />
                <button onClick={()=>{setImageFile(null);setPreview(null)}}
                  className="absolute top-2 right-2 w-7 h-7 bg-slate-900/80 rounded-full flex items-center justify-center hover:bg-red-500/80 transition-colors cursor-pointer"
                  aria-label="Remove image">
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 px-3 py-2">
                  <p className="text-xs text-slate-300 truncate">{imageFile?.name}</p>
                  <p className="text-[10px] text-slate-500">{imageFile ? (imageFile.size/1024).toFixed(0)+'KB' : ''}</p>
                </div>
              </div>
            ) : (
              <div role="button" tabIndex={0}
                onClick={()=>fileRef.current?.click()}
                onKeyDown={e=>e.key==='Enter'&&fileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();setDrag(true)}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]??null)}}
                className={clsx('border-2 border-dashed rounded-2xl h-52 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
                  drag ? 'border-sky-500 bg-sky-500/10' : 'border-white/12 hover:border-sky-500/50 hover:bg-white/3')}>
                <div className="w-12 h-12 bg-sky-500/15 rounded-xl flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-sky-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-300">Drop image here or click to browse</p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP · Max 10 MB</p>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              Upload a clear photo of the affected area for AI analysis.
            </p>
          </div>

          {/* Symptoms + duration */}
          <div className="glass p-6 space-y-5">
            <h2 className="text-base font-semibold text-white border-b border-white/8 pb-3">Symptoms &amp; Duration</h2>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-2 block">
                Select Symptoms <span className="text-sky-400">({symptoms.length} selected)</span>
              </label>
              <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
                {symptomsList.map(s => (
                  <button key={s} onClick={()=>setSymptoms(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])}
                    className={clsx('text-xs px-3 py-1.5 rounded-full border font-medium transition-all cursor-pointer',
                      symptoms.includes(s) ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-white/5 text-slate-400 border-white/8 hover:border-white/20 hover:text-slate-300')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-3">
                Duration: <span className="text-sky-400 font-bold">{duration} day{duration>1?'s':''}</span>
              </label>
              <input type="range" min={1} max={30} value={duration} onChange={e=>setDuration(+e.target.value)} className="w-full" />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>1 day</span><span>15 days</span><span>30 days</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={()=>setStep('details')}
                className="flex-1 bg-white/8 hover:bg-white/12 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors cursor-pointer">
                Back
              </button>
              <button onClick={handleSubmit} disabled={!imageFile}
                className={clsx('flex-1 text-sm font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer',
                  imageFile ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-white/8 text-slate-600 cursor-not-allowed')}>
                <Upload className="w-4 h-4" /> {t('userInput.submitAnalyze')}
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-4 w-full max-w-xl space-y-3 border border-white/12">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Capture image</p>
              <button
                type="button"
                onClick={closeCamera}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label="Close camera"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video ref={videoRef} className="w-full rounded-xl bg-black max-h-[60vh]" playsInline muted autoPlay />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeCamera}
                className="flex-1 bg-white/8 hover:bg-white/12 text-slate-300 text-sm py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureFromCamera}
                className="flex-1 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DistrictDropdown({ value, query, open, onQueryChange, onSelect, onBlur, onFocus }: {
  value: string; query: string; open: boolean
  onQueryChange: (q: string) => void
  onSelect: (d: string) => void
  onBlur: () => void
  onFocus: () => void
}) {
  const filtered = karnatakaDistricts.filter(d =>
    d.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div className="relative">
      <input
        className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
        placeholder="Search district…"
        value={query || value}
        onChange={e => onQueryChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(d => (
            <li
              key={d}
              onMouseDown={() => onSelect(d)}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                value === d ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-white/8'
              }`}
            >
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ label, error, col, children }: { label: string; error?: string; col?: number; children: React.ReactNode }) {
  return (
    <div className={clsx('space-y-1.5', col===2 && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{error}</p>}
    </div>
  )
}
