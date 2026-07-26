"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { savePersonaSettingAction } from "@/app/(main)/persona/actions";
import type { Persona } from "@/lib/supabase/queries/personaSettings";

interface PersonaSettingsCardProps {
  persona: Persona;
  label: string;
  description: string;
  builtInInstructions: string;
  initialCustomInstructions: string;
}

export default function PersonaSettingsCard({
  persona,
  label,
  description,
  builtInInstructions,
  initialCustomInstructions,
}: PersonaSettingsCardProps) {
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await savePersonaSettingAction(persona, customInstructions);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("저장되었습니다.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Built-in instructions — collapsible */}
        <div className="rounded-lg border bg-muted/40">
          <button
            type="button"
            onClick={() => setShowBuiltIn((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>기본 지침 보기</span>
            {showBuiltIn ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
          </button>
          {showBuiltIn && (
            <div className="border-t px-3 py-3">
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans leading-relaxed">
                {builtInInstructions}
              </pre>
            </div>
          )}
        </div>

        {/* Custom instructions */}
        <div className="space-y-2">
          <label className="text-base font-medium">
            추가 지침
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              기본 지침에 덧붙여 AI 면접관에게 전달됩니다.
            </span>
          </label>
          <Textarea
            placeholder={`예) 답변이 영어로 섞여 나와도 한국어로만 질문해줘.\n기술 질문보다 협업 경험 위주로 파고들어줘.`}
            rows={5}
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
          />
        </div>

        <Button onClick={handleSave} disabled={isPending} size="sm">
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </CardContent>
    </Card>
  );
}
