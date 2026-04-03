"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  saveApiKeyAction,
  deleteApiKeyAction,
  updateModelAction,
} from "@/app/(main)/settings/actions";
import { SUPPORTED_MODELS, type SupportedModelId } from "@/lib/models";

interface ApiKeySectionProps {
  hasCustomKey: boolean;
  currentModel: string;
}

export default function ApiKeySection({
  hasCustomKey,
  currentModel,
}: ApiKeySectionProps) {
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<SupportedModelId>(
    (currentModel as SupportedModelId) ?? "gemini-2.5-flash"
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keySaved, setKeySaved] = useState(hasCustomKey);
  const [savedModel, setSavedModel] = useState(currentModel);

  // 편집 모드에서는 키가 이미 있으므로 모델 select 항상 활성화
  const selectDisabled = !isEditing && !apiKey.trim();

  function handleOpenNew() {
    setIsEditing(false);
    setApiKey("");
    setModel((savedModel as SupportedModelId) ?? "gemini-2.5-flash");
    setOpen(true);
  }

  function handleOpenEdit() {
    setIsEditing(true);
    setApiKey("");
    setModel((savedModel as SupportedModelId) ?? "gemini-2.5-flash");
    setOpen(true);
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      setApiKey("");
      setModel((savedModel as SupportedModelId) ?? "gemini-2.5-flash");
      setIsEditing(false);
    }
    setOpen(value);
  }

  async function handleSave() {
    setSaving(true);

    if (isEditing && !apiKey.trim()) {
      // 편집 모드에서 키 입력 없이 저장 → 모델만 업데이트
      const result = await updateModelAction(model);
      setSaving(false);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSavedModel(model);
        setOpen(false);
        toast.success("모델이 변경되었습니다.");
      }
      return;
    }

    if (!apiKey.trim()) {
      setSaving(false);
      toast.error("API 키를 입력해주세요.");
      return;
    }

    const result = await saveApiKeyAction(apiKey, model);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      setKeySaved(true);
      setSavedModel(model);
      setApiKey("");
      setOpen(false);
      toast.success(isEditing ? "API 키가 수정되었습니다." : "API 키가 저장되었습니다.");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteApiKeyAction();
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      setKeySaved(false);
      setModel("gemini-2.5-flash");
      setSavedModel("gemini-2.5-flash");
      toast.success("API 키가 삭제되었습니다. 기본 모델로 전환됩니다.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">내 AI 모델 사용하기</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {keySaved
              ? `내 API 키 사용 중 — ${savedModel}`
              : "기본 모델 사용 중 (gemini-2.5-flash)"}
          </p>
        </div>
        <Button size="sm" onClick={handleOpenNew} disabled={keySaved}>
          <Plus className="w-4 h-4 mr-1" />
          새로운 API Key
        </Button>
      </div>

      {keySaved && (
        <div className="rounded-lg border overflow-hidden text-sm">
          <div className="grid grid-cols-[160px_1fr_auto] gap-4 px-4 py-2 bg-muted/50 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <span>Name</span>
            <span>API Key</span>
            <span />
          </div>
          <div className="grid grid-cols-[160px_1fr_auto] gap-4 items-center px-4 py-3 border-t">
            <div>
              <p className="font-semibold">GOOGLE_API_KEY</p>
              <p className="text-xs text-muted-foreground">{savedModel}</p>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-sm bg-muted rounded-full px-3 py-1 truncate max-w-xs">
                {"•".repeat(32)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full"
                onClick={() => {
                  toast.info("보안상 키 값은 복사할 수 없습니다.");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenEdit}>
                  Key / 모델 수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="px-4 py-2 border-t text-xs text-muted-foreground">
            API 키는 AES-256 암호화 후 저장되며 서버에서만 복호화됩니다. 음성 기능(TTS/STT)은 항상 기본 키를 사용합니다.
          </p>
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "API Key / 모델 수정" : "새로운 API Key 추가"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">이름</label>
              <Input value="GOOGLE_API_KEY" disabled />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">API Key</label>
              <Input
                type="text"
                placeholder={isEditing ? "새 키를 입력하면 교체됩니다" : "API 키를 입력하세요"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
              />
              <p className="text-xs text-muted-foreground">
                현재 <span className="font-medium text-foreground">Gemini API 키</span>만 지원합니다.{" "}
                <a
                  href="https://aistudio.google.com/welcome"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Google AI Studio에서 발급
                </a>
              </p>
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  비워두면 기존 키를 유지하고 모델만 변경됩니다.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">모델 선택</label>
              <Select
                value={model}
                onValueChange={(v) => setModel(v as SupportedModelId)}
                disabled={selectDisabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              API 키는 AES-256 암호화 후 저장되며 서버에서만 복호화됩니다.
              음성 기능(TTS/STT)은 항상 기본 키를 사용합니다.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
