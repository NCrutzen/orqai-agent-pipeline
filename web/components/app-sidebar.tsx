"use client";

import { useRouter } from "next/navigation";
import {
  Home,
  BarChart3,
  FolderOpen,
  Play,
  Settings,
  LogOut,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { title: "Dashboard", href: "/", icon: Home },
  { title: "Executive", href: "/executive", icon: BarChart3 },
  { title: "Projects", href: "/", icon: FolderOpen },
  { title: "Creations", href: "/runs", icon: Play },
  { title: "Rijtijden", href: "/rijtijden", icon: Clock },
  { title: "Settings", href: "/settings", icon: Settings },
];

interface AppSidebarProps {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
    };
  };
}

export function AppSidebar({ user }: AppSidebarProps) {
  const router = useRouter();
  const supabase = createClient();

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "User";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
                Agent Workforce
              </span>
              <SidebarTrigger className="ml-auto" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{displayName}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem disabled>
                  <span className="truncate text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
