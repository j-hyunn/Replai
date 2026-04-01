"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotIcon, FileTextIcon, MessageSquareIcon, MessageSquarePlusIcon, SettingsIcon, UserIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/common/NavUser";

const navMain = [
  {
    title: "내 정보",
    items: [
      {
        title: "내 소개",
        href: "/profile",
        icon: UserIcon,
      },
      {
        title: "문서 관리",
        href: "/resume",
        icon: FileTextIcon,
      },
    ],
  },
  {
    title: "면접",
    items: [
      {
        title: "면접관 페르소나",
        href: "/persona",
        icon: BotIcon,
      },
      {
        title: "모의 인터뷰",
        href: "/interview",
        icon: MessageSquareIcon,
      },
    ],
  },
] as const;

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="p-2">
        <NavUser name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
      </SidebarHeader>

      <SidebarContent>
        {navMain.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      asChild
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="피드백"
              asChild
            >
              <a href="https://walla.my/a/rhsfeedback" target="_blank" rel="noopener noreferrer">
                <MessageSquarePlusIcon />
                <span>피드백</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/preferences"}
              tooltip="환경설정"
              asChild
            >
              <Link href="/preferences">
                <SettingsIcon />
                <span>환경설정</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
