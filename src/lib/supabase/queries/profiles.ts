import { createClient } from '@/lib/supabase/server'

export interface UserProfile {
  id: string
  user_id: string
  email: string | null
  name: string | null
  job_category: string | null
  years_of_experience: number | null
  tech_stack: string[]
  skills: string[]
  created_at: string
  updated_at: string
}

export interface UpsertProfileInput {
  user_id: string
  email?: string | null
  name?: string | null
  job_category: string | null
  years_of_experience: number | null
  tech_stack: string[]
  skills: string[]
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // no rows found
    throw new Error(`Failed to load profile: ${error.message}. Please refresh and try again.`)
  }

  return data
}

export async function upsertUserProfile(input: UpsertProfileInput): Promise<UserProfile> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to save profile: ${error.message}. Please try again.`)
  }

  return data
}
