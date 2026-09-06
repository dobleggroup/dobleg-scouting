// src/services/coachWyscoutReportService.ts
import { supabase } from '@/lib/supabase'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

export interface WyscoutReportSummary {
  id: number
  coach_key: string
  match_window: number
  source_file: string | null
  created_at: string
}

const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20MB

export async function listWyscoutReports(coachKey: string): Promise<WyscoutReportSummary[]> {
  const { data, error } = await supabase
    .from('coach_wyscout_reports')
    .select('id, coach_key, match_window, source_file, created_at')
    .eq('coach_key', coachKey)
    .order('created_at', { ascending: false })

  if (error || !data) {
    console.error('Error listando informes de Wyscout:', error)
    return []
  }
  return data as unknown as WyscoutReportSummary[]
}

export async function getLatestWyscoutReport(coachKey: string): Promise<WyscoutReportData | null> {
  const { data, error } = await supabase
    .from('coach_wyscout_reports')
    .select('data')
    .eq('coach_key', coachKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data.data as unknown as WyscoutReportData
}

export async function saveWyscoutReport(
  coachKey: string,
  report: WyscoutReportData,
  warnings: string[],
  file: File,
): Promise<{ success: boolean; error?: string }> {
  if (file.size > MAX_PDF_BYTES) {
    return { success: false, error: 'El PDF pesa más de 20MB.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('coach_wyscout_reports')
    .insert({
      coach_key: coachKey,
      match_window: report.matchCountWindow,
      data: report,
      warnings,
      source_file: report.sourceFileName,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('Error guardando informe de Wyscout:', insertError)
    return { success: false, error: insertError?.message }
  }

  const path = `${coachKey}/${inserted.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('coach-wyscout-reports')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error('Error subiendo PDF de Wyscout:', uploadError)
    return { success: true } // el dato ya se guardo; el PDF original es solo para auditar
  }

  await supabase.from('coach_wyscout_reports').update({ storage_path: path }).eq('id', inserted.id)
  return { success: true }
}

export async function deleteWyscoutReport(id: number): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('coach_wyscout_reports').delete().eq('id', id)
  if (error) {
    console.error('Error borrando informe de Wyscout:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
