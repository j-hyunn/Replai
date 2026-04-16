import Link from "next/link";

export const metadata = {
  title: "이용약관 | 리플레이",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm text-foreground">
      <Link href="/login" className="text-xs text-muted-foreground hover:underline">
        ← 돌아가기
      </Link>

      <h1 className="mt-6 text-2xl font-bold">이용약관</h1>
      <p className="mt-1 text-xs text-muted-foreground">최종 수정일: 2026년 3월 30일</p>

      <Section title="1. 서비스 소개">
        <p>
          Replai(이하 "서비스")은 AI를 활용한 IT 직무 모의면접 서비스입니다.
          이용자가 업로드한 이력서와 채용공고를 분석해 맞춤형 면접 질문을 생성하고,
          실시간 대화형 면접 및 피드백 리포트를 제공합니다.
        </p>
      </Section>

      <Section title="2. 이용 자격">
        <p>
          본 서비스는 Google 계정을 보유한 누구나 이용할 수 있습니다.
          Google 계정으로 로그인하면 본 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.
        </p>
      </Section>

      <Section title="3. 이용자의 의무">
        <ul>
          <li>타인의 개인정보 또는 저작물을 무단으로 업로드하지 않습니다.</li>
          <li>서비스를 상업적 목적으로 무단 사용하지 않습니다.</li>
          <li>서비스의 정상적인 운영을 방해하는 행위를 하지 않습니다.</li>
          <li>부정한 방법으로 서비스를 이용하지 않습니다.</li>
        </ul>
      </Section>

      <Section title="4. 서비스 제공 및 변경">
        <p>
          서비스는 현재 무료로 제공됩니다. 운영 상황에 따라 사전 공지 후 유료화 또는 기능이 변경될 수 있습니다.
          서비스 중단 또는 종료 시 사전에 공지합니다.
        </p>
      </Section>

      <Section title="5. AI 생성 콘텐츠 면책">
        <p>
          서비스가 생성하는 면접 질문, 피드백, 점수는 AI 모델(Google Gemini)이 생성한 결과물입니다.
          실제 채용 결과와 무관하며, 참고용으로만 활용하시기 바랍니다.
          AI 응답의 정확성 및 완전성에 대해 서비스는 법적 책임을 지지 않습니다.
        </p>
      </Section>

      <Section title="6. 업로드 콘텐츠 책임">
        <p>
          이용자가 업로드하는 이력서, 포트폴리오 등의 콘텐츠에 대한 권리와 책임은 이용자에게 있습니다.
          제3자의 저작권을 침해하는 콘텐츠를 업로드해서는 안 됩니다.
        </p>
      </Section>

      <Section title="7. 계정 및 데이터 삭제">
        <p>
          이용자는 언제든지 업로드한 문서와 면접 이력을 서비스 내에서 직접 삭제할 수 있습니다.
          계정 삭제를 원하는 경우 서비스 내 문의 채널을 이용해주세요.
        </p>
      </Section>

      <Section title="8. 준거법">
        <p>본 약관은 대한민국 법률에 따라 해석·적용됩니다.</p>
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
