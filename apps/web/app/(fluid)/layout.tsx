import { FluidShell } from '@/modules/shared/fluid/shell/FluidShell';

export default function FluidLayout({ children }: { children: React.ReactNode }) {
  return <FluidShell>{children}</FluidShell>;
}
