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
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Find the nearest scrollable ancestor (SidebarInset uses overflow-auto)
    const scrollContainer =
      headerRef.current?.parentElement ?? window as unknown as HTMLElement;

    function onScroll() {
      const top =
        scrollContainer instanceof Window
          ? scrollContainer.scrollY
          : (scrollContainer as HTMLElement).scrollTop;
      setScrolled(top > 4);
    }

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 px-4 transition-all duration-200 ${
        scrolled ? "bg-background border-b" : "bg-background"
      }`}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Link href="/resume" className="shrink-0">
        <Image src="/logo.svg" alt="reHEARsal" width={28} height={28} />
      </Link>
      <AppBreadcrumb userName={userName} />
    </header>
  );
}
