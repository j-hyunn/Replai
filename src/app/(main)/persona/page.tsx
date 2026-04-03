import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import { getPersonaSettings } from "@/lib/supabase/queries/personaSettings";
import { PERSONA_INSTRUCTIONS } from "@/lib/prompts/interview";
import PersonaSettingsCard from "@/components/persona/PersonaSettingsCard";

const PERSONAS = [
  {
    persona: "explorer" as const,
    label: "경험 탐색형",
    description: "편안하고 대화적인 분위기로 지원자의 경험을 자연스럽게 끌어내는 면접관",
  },
  {
    persona: "pressure" as const,
    label: "심층 압박형",
    description: "논리적 허점을 짚어내며 답변을 끝까지 파고드는 날카로운 면접관",
  },
  {
    persona: "technical" as const,
    label: "기술 검증형",
    description: "설계 결정의 근거, CS 기초 원리, 성능 트레이드오프를 집요하게 검증하는 면접관",
  },
] as const;

export default async function PersonaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const settings = await getPersonaSettings(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">면접관 페르소나</h1>
        <p className="text-sm text-muted-foreground">
          각 면접관 유형에 추가 지침을 작성하면 AI 면접관이 기본 지침과 함께 반영해 면접을 진행합니다.
        </p>
      </div>

      <div className="space-y-4">
        {PERSONAS.map(({ persona, label, description }) => {
          const saved = settings.find((s) => s.persona === persona);
          return (
            <PersonaSettingsCard
              key={persona}
              persona={persona}
              label={label}
              description={description}
              builtInInstructions={PERSONA_INSTRUCTIONS[persona]}
              initialCustomInstructions={saved?.custom_instructions ?? ""}
            />
          );
        })}
      </div>
    </div>
  );
}
