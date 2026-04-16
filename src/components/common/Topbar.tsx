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
    function getScrollParent(node: HTMLElement | null): HTMLElement | Window {
      if (!node) return window;
      const { overflow, overflowY } = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(overflow + overflowY)) return node;
      return getScrollParent(node.parentElement);
    }

    const container = getScrollParent(headerRef.current?.parentElement ?? null);

    function onScroll() {
      const top =
        container instanceof Window
          ? window.scrollY
          : (container as HTMLElement).scrollTop;
      setScrolled(top > 4);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 px-4 transition-all duration-200 ${
        scrolled ? "bg-background border-b" : "bg-transparent"
      }`}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Link href="/resume" className="shrink-0">
        <Image src="/logo.svg" alt="Replai" width={28} height={28} />
      </Link>
      <AppBreadcrumb userName={userName} />
    </header>
  );
}
