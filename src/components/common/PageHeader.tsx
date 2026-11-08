import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title truncate text-xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-xs text-muted-foreground sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:gap-2">{actions}</div>}
    </div>
  )
}
