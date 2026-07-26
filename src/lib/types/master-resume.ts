export interface ResumeBasics {
  name: string;
  email: string;
  phone: string;
  website: string;
  summary: string;
}

export interface ResumeExperience {
  id: string;
  company: string;
  position: string;     // 직급/직책
  start_date: string;   // 입사일 YYYY-MM
  end_date: string;     // 퇴사일 YYYY-MM, is_current=true면 ''
  is_current: boolean;  // 재직 중
  description: string;  // 업무 내용
  leave_reason: string; // 퇴사 사유
}

export interface ResumeProject {
  id: string;
  name: string;         // 프로젝트명
  company: string;      // 회사명
  start_date: string;
  end_date: string;
  description: string;  // 프로젝트 내용
  decisions: string;    // 의사결정 및 협업
  achievement: string;  // 성과
  contribution: string; // 기여도
  tech_stack: string;   // 사용 기술
}

export interface ResumeSkills {
  hard: string[];
  soft: string[];
}

export type EducationDegree = '고등학교' | '전문학사' | '학사' | '석사' | '박사' | '기타';
export type EducationStatus = '졸업' | '중퇴' | '재학중';
export type EducationEntryType = '입학' | '편입';

export interface ResumeEducation {
  id: string;
  school: string;
  major: string;
  degree: EducationDegree;
  start_date: string;             // 입학일
  end_date: string;               // 졸업일
  entry_type: EducationEntryType; // 입학/편입
  status: EducationStatus;        // 졸업/중퇴/재학중
}

export interface ResumeActivity {
  id: string;
  title: string;
  issuer: string;
  date: string; // YYYY-MM
  description: string;
}

export interface MasterResume {
  id: string;
  user_id: string;
  basics: ResumeBasics;
  experiences: ResumeExperience[];
  projects: ResumeProject[];
  skills: ResumeSkills;
  educations: ResumeEducation[];
  activities: ResumeActivity[];
  self_intro_memo: string;
  created_at: string;
  updated_at: string;
}

export type MasterResumeInput = Omit<MasterResume, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface ResumeAnalysis {
  keyword_mapping: Array<{ keyword: string; found_in: string }>;
  highlights: Array<{ item: string; reason: string }>;
  missing_items: Array<{ item: string; recommendation: string }>;
}

// Submitted resume content — same fields as MasterResume minus id/user_id/timestamps
export interface SubmittedResumeContent {
  basics: ResumeBasics;
  experiences: ResumeExperience[];
  projects: ResumeProject[];
  skills: ResumeSkills;
  educations: ResumeEducation[];
  activities: ResumeActivity[];
  self_intro_memo: string;
  summary: string; // JD-optimized summary (5~8 sentences)
}

export interface SubmittedResume {
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
