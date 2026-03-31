"use client";

import { useState, useTransition } from "react";
import { Link2Icon, PencilIcon, CheckIcon, XIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGitLinkAction, deleteDocumentAction } from "@/app/(main)/resume/actions";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface GitLinkSectionProps {
  documents: UserDocument[];
}

function GitLinkItem({ document }: { document: UserDocument }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(document.file_url ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      // Delete old + create new
      const deleteResult = await deleteDocumentAction(document.id, "");
      if (deleteResult.error) {
        toast.error(deleteResult.error);
        return;
      }
      const saveResult = await saveGitLinkAction(value);
      if (saveResult.error) {
        toast.error(saveResult.error);
      } else {
        setIsEditing(false);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDocumentAction(document.id, "");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("링크가 삭제되었습니다.");
      }
    });
  }

  if (isEditing) {
    return (
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          autoFocus
        />
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          <CheckIcon className="size-4" />
          <span className="sr-only">저장</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setValue(document.file_url ?? ""); setIsEditing(false); }}
          disabled={isPending}
        >
          <XIcon className="size-4" />
          <span className="sr-only">취소</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link2Icon className="size-4 shrink-0 text-muted-foreground" />
      <a
        href={document.file_url ?? ""}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 text-sm truncate hover:underline"
      >
        {document.file_url}
      </a>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          className="size-7 text-muted-foreground"
        >
          <PencilIcon className="size-3.5" />
          <span className="sr-only">수정</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={isPending}
          className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">삭제</span>
        </Button>
      </div>
    </div>
  );
}

export default function GitLinkSection({ documents }: GitLinkSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await saveGitLinkAction(value);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("GitHub 링크가 추가되었습니다.");
        setValue("");
        setIsAdding(false);
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">GitHub</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            GitHub 레포지토리 링크
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <PlusIcon className="size-3.5" />
            링크 추가
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <GitLinkItem key={doc.id} document={doc} />
        ))}

        {isAdding && (
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://github.com/username"
              disabled={isPending}
              autoFocus
            />
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              <CheckIcon className="size-4" />
              <span className="sr-only">추가</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setValue(""); setIsAdding(false); }}
              disabled={isPending}
            >
              <XIcon className="size-4" />
              <span className="sr-only">취소</span>
            </Button>
          </div>
        )}

        {documents.length === 0 && !isAdding && (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
            GitHub 링크를 추가해보세요
          </div>
        )}
      </div>
    </section>
  );
}
