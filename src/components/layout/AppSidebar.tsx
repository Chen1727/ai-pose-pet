import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ExternalLinkIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useStudio } from '@/store/studioStore'
import { petsQuery } from '@/api/pets'
import { costumesQuery, portraitsQuery } from '@/api/gallery'
import { activeNavTo, navGroups } from './nav'

export function AppSidebar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const active = activeNavTo(pathname)
  const { recipe } = useStudio()
  const { data: pets } = useQuery(petsQuery)
  const { data: costumes } = useQuery(costumesQuery)
  const { data: portraits } = useQuery(portraitsQuery)
  const petCounts: Record<string, number | undefined> = {
    '/pet-poses': pets?.filter((image) => image.kind === 'pose').length,
    '/pet-breeds': pets?.filter((image) => image.kind === 'breed').length,
    '/pet-costumes': pets?.filter((image) => image.category === 'pet_costume').length,
    '/pet-interactions': pets?.filter((image) => image.category === 'interaction').length,
    '/costumes': costumes?.length,
    '/portraits': portraits?.length,
  }
  const count = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length + (recipe.extraImages || []).length

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl" aria-hidden="true">
                  <img className="size-16 max-w-none shrink-0 object-contain" src="/logo-mark.png" alt="" />
                </span>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-semibold tracking-wider">爪迹灵感库</span>
                  <span className="truncate text-[10px] tracking-wide text-sidebar-foreground/65">PAW ARCHIVE · 猫狗与人宠参考</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={item.to === active} tooltip={item.title}>
                    <Link to={item.to}>
                      <item.icon />
                      <span className="flex-1 truncate">{item.title}</span>
                      {(item.badge || petCounts[item.to] !== undefined) && (
                        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-medium">
                          {petCounts[item.to]?.toLocaleString('zh-CN') ?? item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="当前参考图组合">
              <Link to="/studio" className="bg-sidebar-accent/70 hover:bg-sidebar-accent">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
                  <SparklesIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-xs leading-tight">
                  <span className="truncate font-semibold">参考图组合 ({count}/5)</span>
                  <span className="truncate text-[11px] text-sidebar-foreground/65">
                    {count === 0 ? '选几张参考，开始创作' : '点击进入 AI 合成台'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" asChild tooltip="访问 GitHub 仓库">
              <a
                href="https://github.com/Chen1727/ai-pose-pet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sidebar-foreground/65"
              >
                <ExternalLinkIcon className="size-3.5" />
                <span>GitHub · Chen1727</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
