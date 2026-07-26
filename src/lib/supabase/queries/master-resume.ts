import { createClient } from '@/lib/supabase/server';
import type {
  MasterResume,
  MasterResumeInput,
  ResumeBasics,
  ResumeExperience,
  ResumeProject,
  ResumeSkills,
  ResumeEducation,
  ResumeActivity,
  SubmittedResume,
  SubmittedResumeContent,
  ResumeAnalysis,
} from '@/lib/types/master-resume';

const EMPTY_BASICS: ResumeBasics = { name: '', email: '', phone: '', website: '', summary: '' };
const EMPTY_SKILLS: ResumeSkills = { hard: [], soft: [] };

interface MasterResumeRow {
  id: string;
  user_id: string;
  basics: ResumeBasics | null;
  experiences: ResumeExperience[] | null;
  projects: ResumeProject[] | null;
  skills: ResumeSkills | unknown[] | null;
  educations: ResumeEducation[] | null;
  activities: ResumeActivity[] | null;
  self_intro_memo: string | null;
  created_at: string;
  updated_at: string;
}

interface SubmittedResumeRow {
  id: string;
  user_id: string;
  company_name: string;
  position: string;
  jd_text: string;
  content_md: string;
  content_json: SubmittedResumeContent | null;
  analysis_json: ResumeAnalysis;
  created_at: string;
}

// Legacy rows may contain the old ResumeSkill[] array shape — fall back to empty object form.
function normalizeSkills(value: ResumeSkills | unknown[] | null): ResumeSkills {
  if (!value || Array.isArray(value)) return { ...EMPTY_SKILLS };
  return {
    hard: Array.isArray(value.hard) ? value.hard : [],
    soft: Array.isArray(value.soft) ? value.soft : [],
  };
}

// Legacy rows may miss newly added fields — backfill defaults so controlled inputs stay controlled.
function normalizeExperience(exp: ResumeExperience): ResumeExperience {
  return {
    id: exp.id,
    company: exp.company ?? '',
    position: exp.position ?? '',
    start_date: exp.start_date ?? '',
    end_date: exp.end_date ?? '',
    is_current: exp.is_current ?? false,
    description: exp.description ?? '',
    leave_reason: exp.leave_reason ?? '',
  };
}

function normalizeProject(proj: ResumeProject): ResumeProject {
  return {
    id: proj.id,
    name: proj.name ?? '',
    company: (proj as unknown as Record<string, string>).company ?? '',
    start_date: proj.start_date ?? '',
    end_date: proj.end_date ?? '',
    description: proj.description ?? '',
    contribution: proj.contribution ?? '',
    achievement: proj.achievement ?? '',
    tech_stack: proj.tech_stack ?? '',
    decisions: proj.decisions ?? '',
  };
}

function normalizeEducation(edu: ResumeEducation): ResumeEducation {
  return {
    id: edu.id,
    school: edu.school ?? '',
    major: edu.major ?? '',
    degree: edu.degree ?? '학사',
    start_date: edu.start_date ?? '',
    end_date: edu.end_date ?? '',
    entry_type: edu.entry_type ?? '입학',
    status: edu.status ?? '졸업',
  };
}

function toMasterResume(row: MasterResumeRow): MasterResume {
  return {
    id: row.id,
    user_id: row.user_id,
    basics: { ...EMPTY_BASICS, ...(row.basics ?? {}) },
    experiences: (row.experiences ?? []).map(normalizeExperience),
    projects: (row.projects ?? []).map(normalizeProject),
    skills: normalizeSkills(row.skills),
    educations: (row.educations ?? []).map(normalizeEducation),
    activities: row.activities ?? [],
    self_intro_memo: row.self_intro_memo ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSubmittedResume(row: SubmittedResumeRow): SubmittedResume {
  return {
    id: row.id,
    user_id: row.user_id,
    company_name: row.company_name,
    position: row.position,
    jd_text: row.jd_text,
    content_md: row.content_md,
    content_json: row.content_json ?? null,
    analysis_json: row.analysis_json ?? { keyword_mapping: [], highlights: [], missing_items: [] },
    created_at: row.created_at,
  };
}

export async function getMasterResume(userId: string): Promise<MasterResume | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('master_resumes')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return toMasterResume(data as MasterResumeRow);
}

export async function upsertMasterResume(
  userId: string,
  data: MasterResumeInput
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('master_resumes')
    .upsert(
      {
        user_id: userId,
        basics: data.basics,
        experiences: data.experiences,
        projects: data.projects,
        skills: data.skills,
        educations: data.educations,
        activities: data.activities,
        self_intro_memo: data.self_intro_memo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(error.message);
}

const SUBMITTED_RESUME_COLUMNS = 'id, user_id, company_name, position, jd_text, content_md, content_json, analysis_json, created_at';

export async function getSubmittedResumes(userId: string): Promise<SubmittedResume[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submitted_resumes')
    .select(SUBMITTED_RESUME_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toSubmittedResume(row as SubmittedResumeRow));
}

export async function getSubmittedResume(id: string): Promise<SubmittedResume | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submitted_resumes')
    .select(SUBMITTED_RESUME_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return toSubmittedResume(data as SubmittedResumeRow);
}

export interface CreateSubmittedResumeInput {
  user_id: string;
  company_name: string;
  position: string;
  jd_text: string;
  content_md: string;
  content_json?: SubmittedResumeContent;
  analysis_json: ResumeAnalysis;
}

export async function createSubmittedResume(
  input: CreateSubmittedResumeInput
): Promise<SubmittedResume> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submitted_resumes')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toSubmittedResume(data as SubmittedResumeRow);
}

export async function deleteSubmittedResume(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('submitted_resumes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteMasterResume(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('master_resumes')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
