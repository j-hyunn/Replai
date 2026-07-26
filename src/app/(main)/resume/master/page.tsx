import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import { getMasterResume } from "@/lib/supabase/queries/master-resume";
import MasterResumeForm from "@/components/resume/master/MasterResumeForm";
import type { MasterResumeInput } from "@/lib/types/master-resume";

const EMPTY_MASTER_RESUME: MasterResumeInput = {
  basics: { name: '', email: '', phone: '', website: '', summary: '' },
  experiences: [],
  projects: [],
  skills: { hard: [], soft: [] },
  educations: [],
  activities: [],
  self_intro_memo: '',
};

export default async function MasterResumePage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const userId = user.id;

  const masterResume = await getMasterResume(userId);

  const initialData: MasterResumeInput = masterResume
    ? {
        basics: masterResume.basics,
        experiences: masterResume.experiences,
        projects: masterResume.projects,
        skills: masterResume.skills,
        educations: masterResume.educations,
        activities: masterResume.activities,
        self_intro_memo: masterResume.self_intro_memo,
      }
    : EMPTY_MASTER_RESUME;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <MasterResumeForm initialData={initialData} />
    </div>
  );
}
