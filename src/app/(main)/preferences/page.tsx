import { Separator } from "@/components/ui/separator";
import AudioSettingsLoader from "@/components/preferences/AudioSettingsLoader";

export const metadata = {
  title: "환경설정 | 리허설",
};

export default function PreferencesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">환경설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          서비스 이용 환경을 설정하세요.
        </p>
      </div>

      <Separator />

      <AudioSettingsLoader />
    </div>
  );
}
