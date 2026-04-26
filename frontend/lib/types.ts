export interface PatientImage {
  date: string
  score: number   // 1–10: 1 = healthy, 10 = critical
  label: string
}

export interface Patient {
  id: string
  name: string
  age: number
  gender: 'Male' | 'Female'
  village: string
  district: string
  state: string
  phone: string
  condition: string
  symptoms: string[]
  duration: number         // days
  severity: 'Early' | 'Moderate' | 'Severe'
  aiDiagnosis: {
    disease: string
    confidence: number     // 0–100
  }
  status: 'Active' | 'Resolved' | 'Escalated'
  uploadedAt: string       // ISO date string
  ashaWorker: string
  doctorNotes?: string
  doctorDiagnosis?: string
  images: PatientImage[]
}
