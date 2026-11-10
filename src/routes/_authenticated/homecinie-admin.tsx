import { createFileRoute } from '@tanstack/react-router'
import { HomecinieAdmin } from '@/features/homecinie-admin'

export const Route = createFileRoute('/_authenticated/homecinie-admin')({
  component: HomecinieAdmin,
})
