"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineInput } from "@/components/ui/inline-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { CheckIcon, ChevronLeftIcon, ChevronUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { toast } from "sonner";
import { saveMasterResumeAction } from "@/app/(main)/resume/master/actions";
import type {
  EducationDegree,
  EducationEntryType,
  EducationStatus,
  MasterResumeInput,
  ResumeActivity,
  ResumeBasics,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkills,
} from "@/lib/types/master-resume";

interface Props {
  initialData: MasterResumeInput;
}

const DEGREE_OPTIONS: EducationDegree[] = ['고등학교', '전문학사', '학사', '석사', '박사', '기타'];
const ENTRY_TYPE_OPTIONS: EducationEntryType[] = ['입학', '편입'];
const STATUS_OPTIONS: EducationStatus[] = ['졸업', '중퇴', '재학중'];

function newExperience(): ResumeExperience {
  return {
    id: crypto.randomUUID(),
    company: '', position: '', start_date: '', end_date: '', is_current: false,
    description: '', leave_reason: '',
  };
}

function newProject(): ResumeProject {
  return {
    id: crypto.randomUUID(),
    name: '', company: '', start_date: '', end_date: '',
    description: '', decisions: '', achievement: '', contribution: '', tech_stack: '',
  };
}

function newEducation(): ResumeEducation {
  return {
    id: crypto.randomUUID(),
    school: '', major: '', degree: '학사', start_date: '', end_date: '',
    entry_type: '입학', status: '졸업',
  };
}

function newActivity(): ResumeActivity {
  return { id: crypto.randomUUID(), title: '', issuer: '', date: '', description: '' };
}

export default function MasterResumeForm({ initialData }: Props) {
  const router = useRouter();
  const [basics, setBasics] = useState<ResumeBasics>(initialData.basics);
  const [experiences, setExperiences] = useState<ResumeExperience[]>(initialData.experiences);
  const [projects, setProjects] = useState<ResumeProject[]>(initialData.projects);
  const [skills, setSkills] = useState<ResumeSkills>(initialData.skills);
  const [educations, setEducations] = useState<ResumeEducation[]>(initialData.educations);
  const [activities, setActivities] = useState<ResumeActivity[]>(initialData.activities);
  const [selfIntroMemo, setSelfIntroMemo] = useState(initialData.self_intro_memo);
  const [focusedExpId, setFocusedExpId] = useState<string | null>(null);
  const [focusedProjId, setFocusedProjId] = useState<string | null>(null);
  const [focusedEduId, setFocusedEduId] = useState<string | null>(null);
  const [focusedActId, setFocusedActId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // Snapshot of the last saved state — dirty when current data differs from it
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(initialData));

  const currentData: MasterResumeInput = useMemo(
    () => ({
      basics,
      experiences,
      projects,
      skills,
      educations,
      activities,
      self_intro_memo: selfIntroMemo,
    }),
    [basics, experiences, projects, skills, educations, activities, selfIntroMemo]
  );

  const isDirty = JSON.stringify(currentData) !== savedSnapshot;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Warn on browser refresh / tab close while there are unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function handleBack() {
    if (isDirty) {
      setLeaveDialogOpen(true);
    } else {
      router.push("/resume");
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      const result = await saveMasterResumeAction(currentData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSavedSnapshot(JSON.stringify(currentData));
        toast.success("저장되었습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Filled state per section — drives the check marks in the side index.
  // Repeated sections count as filled only when every field of every item is filled.
  const sections: SectionMeta[] = [
    { id: "basics", title: "기본 정보", filled: isBasicsFilled(basics) },
    { id: "experiences", title: "경력", filled: experiences.length > 0 && experiences.every(isExperienceFilled) },
    { id: "projects", title: "프로젝트", filled: projects.length > 0 && projects.every(isProjectFilled) },
    { id: "skills", title: "Hard / Soft Skills", filled: skills.hard.length + skills.soft.length > 0 },
    { id: "educations", title: "학력", filled: educations.length > 0 && educations.every(isEducationFilled) },
    { id: "activities", title: "수상 / 자격증 / 활동", filled: activities.length > 0 && activities.every(isActivityFilled) },
    { id: "self_intro", title: "자기소개 소재 메모", filled: selfIntroMemo.trim() !== "" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={handleBack}>
          <ChevronLeftIcon className="size-4 mr-1" />
          서류 관리
        </Button>
        <h1 className="text-2xl font-bold">마스터 이력서</h1>
        <p className="text-sm text-muted-foreground">
          모든 경력과 경험을 기록해두세요. JD에 맞는 제출용 이력서 생성에 활용됩니다.
        </p>
      </div>

      <div className="flex items-start gap-8">
        <div className="flex-1 min-w-0 space-y-10">
          {/* A. 기본 정보 */}
          <Section id="basics" title="기본 정보">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>이름</Label>
                <Input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>이메일</Label>
                <Input type="email" value={basics.email} onChange={(e) => setBasics({ ...basics, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>전화번호</Label>
                <Input value={basics.phone} onChange={(e) => setBasics({ ...basics, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>웹사이트 / LinkedIn</Label>
                <Input value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>한 줄 소개</Label>
                <Textarea className="min-h-40" value={basics.summary} onChange={(e) => setBasics({ ...basics, summary: e.target.value })} />
              </div>
            </div>
          </Section>

          {/* B. 경력 */}
          <Section id="experiences" title="경력">
            {experiences.map((exp, i) => (
              focusedExpId === exp.id ? (
                <div key={exp.id} className="border rounded-md p-4 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-10 text-muted-foreground"
                    onClick={() => setFocusedExpId(null)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive"
                    onClick={() => { setExperiences(experiences.filter((_, j) => j !== i)); if (focusedExpId === exp.id) setFocusedExpId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="space-y-1 pr-8">
                    <div className="flex items-baseline gap-0.5">
                      <InlineInput
                        className="text-xl font-bold"
                        placeholder="회사명 입력"
                        value={exp.company}
                        onChange={(e) => { const next = [...experiences]; next[i] = { ...exp, company: e.target.value }; setExperiences(next); }}
                      />
                      <span className="text-destructive text-sm leading-none" aria-hidden>*</span>
                    </div>
                    <div className="flex items-center">
                      <InlineInput
                        className="text-sm text-muted-foreground min-w-[200px]"
                        placeholder="직급/직책 입력"
                        value={exp.position}
                        onChange={(e) => { const next = [...experiences]; next[i] = { ...exp, position: e.target.value }; setExperiences(next); }}
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <MonthPicker
                          variant="ghost"
                          placeholder="YYYY.MM"
                          value={exp.start_date}
                          onChange={(v) => { const next = [...experiences]; next[i] = { ...exp, start_date: v }; setExperiences(next); }}
                        />
                        <span className="text-muted-foreground text-xs" aria-hidden>–</span>
                        {exp.is_current ? (
                          <span className="text-muted-foreground text-sm px-1">현재</span>
                        ) : (
                          <MonthPicker
                            variant="ghost"
                            placeholder="YYYY.MM"
                            value={exp.end_date}
                            onChange={(v) => { const next = [...experiences]; next[i] = { ...exp, end_date: v }; setExperiences(next); }}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        <Checkbox
                          id={`current-${exp.id}`}
                          checked={exp.is_current}
                          onCheckedChange={(v) => { const next = [...experiences]; next[i] = { ...exp, is_current: Boolean(v), end_date: v ? '' : exp.end_date, leave_reason: v ? '' : exp.leave_reason }; setExperiences(next); }}
                        />
                        <Label htmlFor={`current-${exp.id}`} className="font-normal text-xs text-muted-foreground">재직 중</Label>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-normal text-xs">업무 상세 설명</Label>
                    <MarkdownEditor value={exp.description} onChange={(md) => { const next = [...experiences]; next[i] = { ...next[i], description: md }; setExperiences(next); }} />
                  </div>
                  {!exp.is_current && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground font-normal text-xs">퇴사 사유</Label>
                      <Input
                        placeholder="퇴사 사유 입력"
                        value={exp.leave_reason}
                        onChange={(e) => { const next = [...experiences]; next[i] = { ...exp, leave_reason: e.target.value }; setExperiences(next); }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={exp.id}
                  role="button"
                  tabIndex={0}
                  className="group relative rounded-md px-3 py-3 w-full text-left hover:bg-muted/30 cursor-pointer"
                  onClick={() => setFocusedExpId(exp.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocusedExpId(exp.id); } }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setExperiences(experiences.filter((_, j) => j !== i)); if (focusedExpId === exp.id) setFocusedExpId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="space-y-1.5 pr-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">{exp.company || <span className="text-muted-foreground/40 font-normal">회사명</span>}</span>
                      {exp.position && <span className="text-base text-muted-foreground">{exp.position}</span>}
                      <span className="ml-auto text-base text-muted-foreground whitespace-nowrap shrink-0">
                        {exp.start_date || '–'}{' – '}{exp.is_current ? '현재' : (exp.end_date || '–')}
                      </span>
                    </div>
                    {exp.description && (
                      <div className="text-base text-muted-foreground [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-0.5 [&_li]:my-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_strong]:font-semibold [&_em]:italic [&_del]:line-through">
                        <MarkdownPreview>{exp.description}</MarkdownPreview>
                      </div>
                    )}
                    {!exp.is_current && exp.leave_reason && (
                      <p className="text-base text-muted-foreground">퇴사 사유: {exp.leave_reason}</p>
                    )}
                  </div>
                </div>
              )
            ))}
            <Button variant="outline" size="sm" onClick={() => { const e = newExperience(); setExperiences([...experiences, e]); setFocusedExpId(e.id); }}>
              <PlusIcon className="size-4 mr-1" /> 항목 추가
            </Button>
          </Section>

          {/* C. 프로젝트 */}
          <Section id="projects" title="프로젝트">
            {projects.map((proj, i) => (
              focusedProjId === proj.id ? (
                <div key={proj.id} className="border rounded-md p-4 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-10 text-muted-foreground"
                    onClick={() => setFocusedProjId(null)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive"
                    onClick={() => { setProjects(projects.filter((_, j) => j !== i)); if (focusedProjId === proj.id) setFocusedProjId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>프로젝트명</Label>
                      <Input value={proj.name} onChange={(e) => { const next = [...projects]; next[i] = { ...proj, name: e.target.value }; setProjects(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>회사명</Label>
                      <Input value={proj.company} onChange={(e) => { const next = [...projects]; next[i] = { ...proj, company: e.target.value }; setProjects(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>시작일</Label>
                      <MonthPicker value={proj.start_date} onChange={(v) => { const next = [...projects]; next[i] = { ...proj, start_date: v }; setProjects(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>종료일</Label>
                      <MonthPicker value={proj.end_date} onChange={(v) => { const next = [...projects]; next[i] = { ...proj, end_date: v }; setProjects(next); }} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>프로젝트 내용</Label>
                    <MarkdownEditor value={proj.description} onChange={(md) => { const next = [...projects]; next[i] = { ...next[i], description: md }; setProjects(next); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>의사결정 및 협업</Label>
                    <MarkdownEditor value={proj.decisions} onChange={(md) => { const next = [...projects]; next[i] = { ...next[i], decisions: md }; setProjects(next); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>성과</Label>
                    <MarkdownEditor value={proj.achievement} onChange={(md) => { const next = [...projects]; next[i] = { ...next[i], achievement: md }; setProjects(next); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>기여도</Label>
                    <Input
                      placeholder="기여도 입력"
                      value={proj.contribution}
                      onChange={(e) => { const next = [...projects]; next[i] = { ...proj, contribution: e.target.value }; setProjects(next); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>사용 기술</Label>
                    <Input value={proj.tech_stack} onChange={(e) => { const next = [...projects]; next[i] = { ...proj, tech_stack: e.target.value }; setProjects(next); }} />
                  </div>
                </div>
              ) : (
                <div
                  key={proj.id}
                  role="button"
                  tabIndex={0}
                  className="group relative rounded-md px-3 py-3 w-full text-left hover:bg-muted/30 cursor-pointer"
                  onClick={() => setFocusedProjId(proj.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocusedProjId(proj.id); } }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setProjects(projects.filter((_, j) => j !== i)); if (focusedProjId === proj.id) setFocusedProjId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="space-y-3 pr-8">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold">{proj.name || <span className="text-muted-foreground/40 font-normal">프로젝트명</span>}</span>
                        <span className="ml-auto text-base text-muted-foreground whitespace-nowrap shrink-0">
                          {proj.start_date || '–'}{' – '}{proj.end_date || '–'}
                        </span>
                      </div>
                      {proj.company && (
                        <p className="text-base text-muted-foreground mt-0.5">{proj.company}</p>
                      )}
                    </div>
                    {proj.description && (
                      <div className="space-y-1">
                        <p className="text-base font-semibold">프로젝트 내용</p>
                        <div className="text-base text-muted-foreground [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-0.5 [&_li]:my-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_strong]:font-semibold [&_em]:italic [&_del]:line-through">
                          <MarkdownPreview>{proj.description}</MarkdownPreview>
                        </div>
                      </div>
                    )}
                    {proj.decisions && (
                      <div className="space-y-1">
                        <p className="text-base font-semibold">의사결정 및 협업</p>
                        <div className="text-base text-muted-foreground [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-0.5 [&_li]:my-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_strong]:font-semibold [&_em]:italic [&_del]:line-through">
                          <MarkdownPreview>{proj.decisions}</MarkdownPreview>
                        </div>
                      </div>
                    )}
                    {proj.achievement && (
                      <div className="space-y-1">
                        <p className="text-base font-semibold">성과</p>
                        <div className="text-base text-muted-foreground [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-0.5 [&_li]:my-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_strong]:font-semibold [&_em]:italic [&_del]:line-through">
                          <MarkdownPreview>{proj.achievement}</MarkdownPreview>
                        </div>
                      </div>
                    )}
                    {proj.contribution && (
                      <div className="space-y-1">
                        <p className="text-base font-semibold">기여도</p>
                        <p className="text-base text-muted-foreground">{proj.contribution}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
            <Button variant="outline" size="sm" onClick={() => { const p = newProject(); setProjects([...projects, p]); setFocusedProjId(p.id); }}>
              <PlusIcon className="size-4 mr-1" /> 항목 추가
            </Button>
          </Section>

          {/* D. Hard / Soft Skills */}
          <Section id="skills" title="Hard / Soft Skills">
            <SkillChipInput
              label="Hard Skills"
              placeholder="기술명 입력 후 Enter (예: React, Kubernetes)"
              values={skills.hard}
              onChange={(hard) => setSkills({ ...skills, hard })}
            />
            <SkillChipInput
              label="Soft Skills"
              placeholder="역량 입력 후 Enter (예: 커뮤니케이션, 리더십)"
              values={skills.soft}
              onChange={(soft) => setSkills({ ...skills, soft })}
            />
          </Section>

          {/* E. 학력 */}
          <Section id="educations" title="학력">
            {educations.map((edu, i) => (
              focusedEduId === edu.id ? (
                <div key={edu.id} className="border rounded-md p-4 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-10 text-muted-foreground"
                    onClick={() => setFocusedEduId(null)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive"
                    onClick={() => { setEducations(educations.filter((_, j) => j !== i)); if (focusedEduId === edu.id) setFocusedEduId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>학교명</Label>
                      <Input value={edu.school} onChange={(e) => { const next = [...educations]; next[i] = { ...edu, school: e.target.value }; setEducations(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>전공</Label>
                      <Input value={edu.major} onChange={(e) => { const next = [...educations]; next[i] = { ...edu, major: e.target.value }; setEducations(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>학위</Label>
                      <Select value={edu.degree} onValueChange={(v) => { const next = [...educations]; next[i] = { ...edu, degree: v as EducationDegree }; setEducations(next); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEGREE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>입학 구분</Label>
                      <Select value={edu.entry_type} onValueChange={(v) => { const next = [...educations]; next[i] = { ...edu, entry_type: v as EducationEntryType }; setEducations(next); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTRY_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>입학일</Label>
                      <MonthPicker value={edu.start_date} onChange={(v) => { const next = [...educations]; next[i] = { ...edu, start_date: v }; setEducations(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>졸업일</Label>
                      <MonthPicker value={edu.end_date} onChange={(v) => { const next = [...educations]; next[i] = { ...edu, end_date: v }; setEducations(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>상태</Label>
                      <Select value={edu.status} onValueChange={(v) => { const next = [...educations]; next[i] = { ...edu, status: v as EducationStatus }; setEducations(next); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={edu.id}
                  role="button"
                  tabIndex={0}
                  className="group relative rounded-md px-3 py-3 w-full text-left hover:bg-muted/30 cursor-pointer"
                  onClick={() => setFocusedEduId(edu.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocusedEduId(edu.id); } }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setEducations(educations.filter((_, j) => j !== i)); if (focusedEduId === edu.id) setFocusedEduId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="flex items-baseline gap-2 pr-8">
                    <span className="text-lg font-semibold">{edu.school || <span className="text-muted-foreground/40 font-normal">학교명</span>}</span>
                    {edu.major && <span className="text-base text-muted-foreground">{edu.major}</span>}
                    {edu.degree && <span className="text-base text-muted-foreground">· {edu.degree}</span>}
                    {edu.entry_type && <span className="text-base text-muted-foreground">· {edu.entry_type}</span>}
                    {edu.status && <span className="text-base text-muted-foreground">· {edu.status}</span>}
                    <span className="ml-auto text-base text-muted-foreground whitespace-nowrap shrink-0">
                      {edu.start_date || '–'}{' – '}{edu.end_date || '–'}
                    </span>
                  </div>
                </div>
              )
            ))}
            <Button variant="outline" size="sm" onClick={() => { const edu = newEducation(); setEducations([...educations, edu]); setFocusedEduId(edu.id); }}>
              <PlusIcon className="size-4 mr-1" /> 항목 추가
            </Button>
          </Section>

          {/* F. 수상/자격증/활동 */}
          <Section id="activities" title="수상 / 자격증 / 활동">
            {activities.map((act, i) => (
              focusedActId === act.id ? (
                <div key={act.id} className="border rounded-md p-4 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-10 text-muted-foreground"
                    onClick={() => setFocusedActId(null)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive"
                    onClick={() => { setActivities(activities.filter((_, j) => j !== i)); if (focusedActId === act.id) setFocusedActId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>제목</Label>
                      <Input value={act.title} onChange={(e) => { const next = [...activities]; next[i] = { ...act, title: e.target.value }; setActivities(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>발급 기관</Label>
                      <Input value={act.issuer} onChange={(e) => { const next = [...activities]; next[i] = { ...act, issuer: e.target.value }; setActivities(next); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>날짜</Label>
                      <MonthPicker value={act.date} onChange={(v) => { const next = [...activities]; next[i] = { ...act, date: v }; setActivities(next); }} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>설명</Label>
                    <Textarea rows={2} value={act.description} onChange={(e) => { const next = [...activities]; next[i] = { ...act, description: e.target.value }; setActivities(next); }} />
                  </div>
                </div>
              ) : (
                <div
                  key={act.id}
                  role="button"
                  tabIndex={0}
                  className="group relative rounded-md px-3 py-3 w-full text-left hover:bg-muted/30 cursor-pointer"
                  onClick={() => setFocusedActId(act.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocusedActId(act.id); } }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setActivities(activities.filter((_, j) => j !== i)); if (focusedActId === act.id) setFocusedActId(null); }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                  <div className="space-y-1 pr-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold">{act.title || <span className="text-muted-foreground/40 font-normal">제목</span>}</span>
                      {act.issuer && <span className="text-base text-muted-foreground">{act.issuer}</span>}
                      {act.date && <span className="ml-auto text-base text-muted-foreground whitespace-nowrap shrink-0">{act.date}</span>}
                    </div>
                    {act.description && (
                      <p className="text-base text-muted-foreground">{act.description}</p>
                    )}
                  </div>
                </div>
              )
            ))}
            <Button variant="outline" size="sm" onClick={() => { const a = newActivity(); setActivities([...activities, a]); setFocusedActId(a.id); }}>
              <PlusIcon className="size-4 mr-1" /> 항목 추가
            </Button>
          </Section>

          {/* G. 자기소개 소재 메모 */}
          <Section id="self_intro" title="자기소개 소재 메모">
            <p className="text-sm text-muted-foreground">
              면접 준비 소재로만 사용되며 이력서에 포함되지 않습니다.
            </p>
            <Textarea
              rows={6}
              placeholder="자기소개에 활용할 소재, 스토리, 강점 등을 자유롭게 작성하세요."
              value={selfIntroMemo}
              onChange={(e) => setSelfIntroMemo(e.target.value)}
            />
          </Section>

          {/* Save all */}
          <div className="flex justify-end pt-2 pb-10">
            <Button disabled={saving || !isDirty} onClick={handleSaveAll}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>

        {/* Side index navigation (desktop only) */}
        <aside className="hidden lg:block w-52 shrink-0 sticky top-20">
          <p className="text-sm font-medium mb-2">전체 {sections.length}개 항목</p>
          <ul className="border-l">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="flex w-full items-center gap-2 border-l-2 border-transparent -ml-px px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  <span className="flex-1 truncate">{s.title}</span>
                  {s.filled ? (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* Unsaved changes confirm dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>저장하지 않은 변경사항이 있습니다</DialogTitle>
            <DialogDescription>
              페이지를 나가면 입력한 내용이 저장되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>계속 작성</Button>
            <Button variant="destructive" onClick={() => router.push("/resume")}>나가기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SectionMeta {
  id: string;
  title: string;
  filled: boolean;
}

function filled(v: string): boolean {
  return v.trim() !== "";
}

function isBasicsFilled(b: ResumeBasics): boolean {
  return filled(b.name) && filled(b.email) && filled(b.phone) && filled(b.summary);
}

function isExperienceFilled(e: ResumeExperience): boolean {
  const dateOk = filled(e.start_date) && (e.is_current || filled(e.end_date));
  const leaveOk = e.is_current || filled(e.leave_reason);
  return filled(e.company) && filled(e.position) && dateOk && filled(e.description) && leaveOk;
}

function isProjectFilled(p: ResumeProject): boolean {
  return (
    filled(p.name) && filled(p.start_date) && filled(p.end_date) &&
    filled(p.description) && filled(p.decisions) && filled(p.achievement) &&
    filled(p.contribution) && filled(p.tech_stack)
  );
}

function isEducationFilled(e: ResumeEducation): boolean {
  return filled(e.school) && filled(e.major) && filled(e.start_date) && filled(e.end_date);
}

function isActivityFilled(a: ResumeActivity): boolean {
  return filled(a.title) && filled(a.issuer) && filled(a.date) && filled(a.description);
}

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Separator />
      </div>
      {children}
    </section>
  );
}

interface SkillChipInputProps {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}

function SkillChipInput({ label, placeholder, values, onChange }: SkillChipInputProps) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = input.trim();
    if (value === "") return;
    if (values.includes(value)) {
      setInput("");
      return;
    }
    onChange([...values, value]);
    setInput("");
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={input}
        placeholder={placeholder}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                aria-label={`${v} 삭제`}
                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
