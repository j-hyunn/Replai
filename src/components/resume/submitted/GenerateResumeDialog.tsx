"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GenerateResponse {
  id: string;
}

export default function GenerateResumeDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [position, setPosition] = useState('');
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    if (!companyName.trim()) { toast.error("회사명을 입력해주세요."); return; }
    if (!position.trim()) { toast.error("포지션을 입력해주세요."); return; }
    if (!jdText.trim()) { toast.error("JD 내용을 입력해주세요."); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, position, jd_text: jdText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '서버 오류가 발생했습니다.' })) as { error?: string };
        toast.error(err.error ?? '생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const data = await res.json() as GenerateResponse;
      onOpenChange(false);
      router.push(`/resume/submitted/${data.id}`);
    } catch {
      toast.error('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>제출용 이력서 생성</DialogTitle>
          <DialogDescription className="text-base">
            JD를 입력하면 마스터 이력서를 기반으로 최적화된 이력서를 자동 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>회사명</Label>
              <Input
                placeholder="예: 카카오"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>포지션</Label>
              <Input
                placeholder="예: 백엔드 개발자"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>채용 공고 (JD)</Label>
            <Textarea
              rows={8}
              placeholder="채용 공고 내용을 붙여넣으세요."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button className="w-full" onClick={handleGenerate} disabled={loading}>
            {loading ? 'AI가 이력서를 생성 중입니다...' : '이력서 생성'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
