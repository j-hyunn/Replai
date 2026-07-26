import type { User } from "@supabase/supabase-js";

interface AccountInfoSectionProps {
  user: User;
}

export default function AccountInfoSection({ user }: AccountInfoSectionProps) {
  const joinedAt = new Date(user.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rows = [
    { label: "로그인 방법", value: "Google" },
    { label: "가입일", value: joinedAt },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">계정 정보</h2>
      <div className="space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-base text-muted-foreground">{label}</span>
            <span className="text-base">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
