/**
 * Prompt for the document normalization agent.
 * Input : raw text extracted by pdfjs-dist (noisy, layout-broken)
 * Output: clean markdown structured by section
 */

export function buildNormalizePrompt(
  rawText: string,
  docType: "resume" | "portfolio" | "git"
): string {
  const docLabel =
    docType === "resume" ? "이력서"
    : docType === "portfolio" ? "포트폴리오"
    : "GitHub README";

  return `당신은 문서 정제 전문가입니다. 아래는 PDF에서 추출한 ${docLabel} 원문으로, 줄바꿈 노이즈와 레이아웃 파괴가 있습니다. 이 텍스트를 읽기 쉬운 마크다운 형태로 재구성하세요.

## 지시사항
1. 원문의 내용을 절대 추가하거나 삭제하지 마세요. 정제만 허용됩니다.
2. 섹션 제목(경력, 프로젝트, 스킬, 학력 등)을 ## 헤딩으로 구분하세요.
3. 깨진 줄바꿈을 복원해 문장이 자연스럽게 이어지도록 하세요.
4. 헤더/푸터/페이지 번호 등 반복 노이즈는 제거하세요.
5. 테이블 형태 데이터는 목록(- key: value)으로 변환하세요.
6. 결과물은 순수 마크다운 텍스트만 반환하세요. 설명, 주석, 코드 블록 불필요.

## 원문
${rawText}`;
}
