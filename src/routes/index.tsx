import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  staticData: { title: '图库总览' },
  beforeLoad: () => { throw redirect({ to: '/pets' }) },
})
