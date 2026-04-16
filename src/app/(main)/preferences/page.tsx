import PreferencesTabs from "@/components/preferences/PreferencesTabs";
import { getApiSettingsAction } from "@/app/(main)/settings/actions";

export const metadata = {
  title: "환경설정 | 리플레이",
};

export default async function PreferencesPage() {
  const apiSettings = await getApiSettingsAction();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">환경설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          서비스 이용 환경을 설정하세요.
        </p>
      </div>

      <PreferencesTabs
        hasCustomKey={apiSettings.hasCustomKey}
        currentModel={apiSettings.model}
      />
    </div>
  );
}
