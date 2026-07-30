import type { MasterResumeInput } from '@/lib/types/master-resume';

/**
 * A master resume only counts as usable interview context when it holds at
 * least one experience or project — an empty shell serializes to nothing, so
 * treating it as a resume source would start an interview with no material.
 *
 * Shared by the interview page (start gating), the create-session action
 * (server-side validation) and the interview route (prompt assembly) so all
 * three agree on what "has a resume" means.
 */
export function hasMasterResumeContent(
  resume: Pick<MasterResumeInput, 'experiences' | 'projects'> | null,
): boolean {
  if (!resume) return false;
  return resume.experiences.length > 0 || resume.projects.length > 0;
}
