"use client";

import { useState, useTransition, KeyboardEvent } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveProfileAction } from "@/app/(main)/profile/actions";
import type { UserProfile } from "@/lib/supabase/queries/profiles";

const JOB_CATEGORIES = [
  "프론트엔드 개발자",
  "백엔드 개발자",
  "풀스택 개발자",
  "iOS 개발자",
  "Android 개발자",
  "Product Manager",
  "Product Designer (UI/UX)",
  "ML 엔지니어",
  "데이터 사이언티스트",
  "데이터 엔지니어",
  "MLOps 엔지니어",
  "DevOps 엔지니어",
  "SRE",
  "클라우드 엔지니어",
  "보안 엔지니어",
] as const;

const YEARS_OPTIONS = [
  { label: "1년 미만", value: "0" },
  { label: "1년", value: "1" },
  { label: "2년", value: "2" },
  { label: "3년", value: "3" },
  { label: "4년", value: "4" },
  { label: "5년", value: "5" },
  { label: "6년", value: "6" },
  { label: "7년", value: "7" },
  { label: "8년", value: "8" },
  { label: "9년", value: "9" },
  { label: "10년 이상", value: "10" },
] as const;

interface Props {
  profile: UserProfile | null;
}

export default function ProfileForm({ profile }: Props) {
  const [isPending, startTransition] = useTransition();

  const [jobCategory, setJobCategory] = useState<string>(
    profile?.job_category ?? ""
  );
  const [yearsOfExperience, setYearsOfExperience] = useState<string>(
    profile?.years_of_experience != null
      ? String(profile.years_of_experience)
      : ""
  );
  const [techStack, setTechStack] = useState<string[]>(
    profile?.tech_stack ?? []
  );
  const [skills, setSkills] = useState<string[]>(profile?.skills ?? []);

  const [techInput, setTechInput] = useState("");
  const [skillInput, setSkillInput] = useState("");

  function addTag(
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) {
      setInput("");
      return;
    }
    setList([...list, trimmed]);
    setInput("");
  }

  function removeTag(
    index: number,
    list: string[],
    setList: (v: string[]) => void
  ) {
    setList(list.filter((_, i) => i !== index));
  }

  function handleTagKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    inputValue: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      addTag(inputValue, list, setList, setInput);
    }
    if (e.key === "Backspace" && inputValue === "" && list.length > 0) {
      setList(list.slice(0, -1));
    }
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveProfileAction({
        job_category: jobCategory || null,
        years_of_experience:
          yearsOfExperience !== "" ? Number(yearsOfExperience) : null,
        tech_stack: techStack,
        skills,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("내 소개가 저장되었습니다.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* 직군 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">직군</label>
        <Select value={jobCategory} onValueChange={setJobCategory}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="선택해주세요" />
          </SelectTrigger>
          <SelectContent>
            {JOB_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 연차 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">연차</label>
        <Select value={yearsOfExperience} onValueChange={setYearsOfExperience}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="선택해주세요" />
          </SelectTrigger>
          <SelectContent>
            {YEARS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 기술 스택 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">기술 스택</label>
        <p className="text-xs text-muted-foreground">
          입력 후 Enter를 눌러 추가하세요.
        </p>
        <div className="flex flex-wrap gap-2 min-h-9 rounded-md border border-input bg-transparent px-3 py-2">
          {techStack.map((tag, i) => (
            <Badge key={i} className="gap-1 pr-1 bg-accent text-primary hover:bg-accent">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i, techStack, setTechStack)}
                className="rounded-full hover:bg-muted"
                aria-label={`${tag} 삭제`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={techStack.length === 0 ? "예: React, TypeScript" : ""}
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            onKeyDown={(e) =>
              handleTagKeyDown(
                e,
                techInput,
                techStack,
                setTechStack,
                setTechInput
              )
            }
            onBlur={() =>
              addTag(techInput, techStack, setTechStack, setTechInput)
            }
          />
        </div>
      </div>

      {/* 스킬 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">스킬</label>
        <p className="text-xs text-muted-foreground">
          입력 후 Enter를 눌러 추가하세요.
        </p>
        <div className="flex flex-wrap gap-2 min-h-9 rounded-md border border-input bg-transparent px-3 py-2">
          {skills.map((tag, i) => (
            <Badge key={i} className="gap-1 pr-1 bg-accent text-primary hover:bg-accent">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i, skills, setSkills)}
                className="rounded-full hover:bg-muted"
                aria-label={`${tag} 삭제`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={
              skills.length === 0 ? "예: 커뮤니케이션, 문제 해결" : ""
            }
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) =>
              handleTagKeyDown(e, skillInput, skills, setSkills, setSkillInput)
            }
            onBlur={() => addTag(skillInput, skills, setSkills, setSkillInput)}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}
