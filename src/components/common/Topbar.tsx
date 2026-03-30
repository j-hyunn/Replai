"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import AppBreadcrumb from "@/components/common/AppBreadcrumb";

interface TopbarProps {
  userName: string;
}

export default function Topbar({ userName }: TopbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Sentinel: when this leaves the viewport, topbar is "scrolled" */}
      <div ref={sentinelRef} className="h-px w-full" aria-hidden />
      <header
        className={`sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 px-4 transition-all duration-200 ${
          scrolled ? "bg-background border-b" : "bg-transparent"
        }`}
      >
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Link href="/resume" className="shrink-0">
          <Image src="/logo.svg" alt="reHEARsal" width={28} height={28} />
        </Link>
        <AppBreadcrumb userName={userName} />
      </header>
    </>
  );
}
