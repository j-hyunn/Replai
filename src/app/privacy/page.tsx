import Link from "next/link";

export const metadata = {
  title: "개인정보 처리방침 | 리플레이",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm text-foreground">
      <Link href="/login" className="text-xs text-muted-foreground hover:underline">
        ← 돌아가기
      </Link>

      <h1 className="mt-6 text-2xl font-bold">개인정보 처리방침</h1>
      <p className="mt-1 text-xs text-muted-foreground">최종 수정일: 2026년 3월 30일</p>

      <Section title="1. 수집하는 개인정보">
        <p>리플레이는 서비스 제공을 위해 아래 정보를 수집합니다.</p>
        <ul>
          <li>Google 계정 정보: 이름, 이메일 주소, 프로필 사진</li>
          <li>사용자가 직접 입력하거나 업로드한 정보: 이력서, 포트폴리오, GitHub 링크, 직군·경력·기술 스택</li>
          <li>면접 세션 정보: 채용공고(JD), 면접 대화 내역, 평가 리포트</li>
        </ul>
      </Section>

      <Section title="2. 개인정보의 이용 목적">
        <ul>
          <li>AI 모의면접 서비스 제공 및 맞춤형 질문·피드백 생성</li>
          <li>서비스 개선 및 오류 대응</li>
          <li>회원 식별 및 로그인 유지</li>
        </ul>
      </Section>

      <Section title="3. 개인정보의 보유 및 파기">
        <p>
          개인정보는 서비스 이용 기간 동안 보유하며, 회원 탈퇴 또는 삭제 요청 시 지체 없이 파기합니다.
          업로드된 문서는 사용자가 직접 삭제할 수 있으며, 삭제 시 스토리지에서도 즉시 제거됩니다.
          면접 이력은 최근 10건만 보관됩니다.
        </p>
      </Section>

      <Section title="4. 제3자 제공 및 위탁">
        <p>리플레이는 아래 제3자 서비스를 활용합니다.</p>
        <ul>
          <li>
            <strong>Google (OAuth)</strong>: 로그인 인증 처리
          </li>
          <li>
            <strong>Supabase</strong>: 사용자 데이터 및 파일 저장
          </li>
          <li>
            <strong>Google Gemini API</strong>: AI 면접 질문 생성 및 평가 (입력된 문서·대화 내역이 API로 전송됩니다)
          </li>
          <li>
            <strong>Vercel</strong>: 서비스 호스팅
          </li>
        </ul>
        <p>위 경우 외에는 사전 동의 없이 개인정보를 제3자에게 제공하지 않습니다.</p>
      </Section>

      <Section title="5. 이용자의 권리">
        <p>
          이용자는 언제든지 자신의 개인정보 열람, 수정, 삭제를 요청할 수 있습니다.
          서비스 내에서 직접 삭제하거나, 아래 이메일로 요청해주세요.
        </p>
      </Section>

      <Section title="6. 문의">
        <p>개인정보 관련 문의는 GitHub 이슈 또는 서비스 내 문의 채널을 이용해주세요.</p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-3">
      <h2 className="font-semibold text-base">{title}</h2>
      <div className="space-y-2 text-muted-foreground leading-relaxed [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
