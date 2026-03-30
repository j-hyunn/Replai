import Image from "next/image";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import AppBreadcrumb from "@/components/common/AppBreadcrumb";

interface TopbarProps {
  userName: string;
}

export default function Topbar({ userName }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Link href="/resume" className="shrink-0">
        <Image src="/logo.svg" alt="reHEARsal" width={28} height={28} />
      </Link>
      <AppBreadcrumb userName={userName} />
    </header>
  );
}
