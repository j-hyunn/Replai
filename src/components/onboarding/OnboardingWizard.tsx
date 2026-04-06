"use client";

import { useState } from "react";
import ProfileStep from "@/components/onboarding/steps/ProfileStep";
import DocumentStep from "@/components/onboarding/steps/DocumentStep";
import type { UserProfile } from "@/lib/supabase/queries/profiles";
import type { UserDocument } from "@/lib/supabase/queries/documents";
import type { SaveProfileInput } from "@/app/(main)/profile/actions";

const STEPS = [
  { label: "내 소개", description: "직군, 연차, 기술 스택을 알려주세요." },
  { label: "문서 업로드", description: "이력서를 업로드하면 면접 질문에 반영됩니다." },
] as const;

interface OnboardingWizardProps {
  profile: UserProfile | null;
  documents: UserDocument[];
}

export default function OnboardingWizard({ profile, documents }: OnboardingWizardProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [pendingProfile, setPendingProfile] = useState<SaveProfileInput | null>(null);

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`size-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                      ? "bg-primary/30 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-sm font-medium ${
                    i === step ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px w-8 bg-border" />
              )}
            </div>
          ))}
        </div>

        <div>
          <h1 className="text-xl font-semibold">{STEPS[step].label}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {STEPS[step].description}
          </p>
        </div>
      </div>

      {/* Step content */}
      {step === 0 && (
        <ProfileStep
          profile={profile}
          onNext={(data) => { setPendingProfile(data); setStep(1); }}
        />
      )}
      {step === 1 && (
        <DocumentStep
          documents={documents}
          pendingProfile={pendingProfile}
          onBack={() => setStep(0)}
        />
      )}
    </div>
  );
}
