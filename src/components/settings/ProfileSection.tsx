"use client";

import { useState, useTransition } from "react";
import { PencilIcon, CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateDisplayNameAction } from "@/app/(main)/settings/actions";

interface ProfileSectionProps {
  name: string;
  email: string;
  avatarUrl: string | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ProfileSection({ name, email, avatarUrl }: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateDisplayNameAction(value);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("이름이 변경되었습니다.");
        setIsEditing(false);
      }
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">프로필</h2>

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-1 min-w-0">
          {isEditing ? (
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isPending}
                autoFocus
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                <CheckIcon className="size-4" />
                <span className="sr-only">저장</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setValue(name); setIsEditing(false); }}
                disabled={isPending}
              >
                <XIcon className="size-4" />
                <span className="sr-only">취소</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-base font-medium">{name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="size-6 text-muted-foreground"
              >
                <PencilIcon className="size-3" />
                <span className="sr-only">이름 수정</span>
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>
    </section>
  );
}
