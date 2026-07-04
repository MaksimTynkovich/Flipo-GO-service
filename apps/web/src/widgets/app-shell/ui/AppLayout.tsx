import { PropsWithChildren } from "react";
import { AppShell } from "./AppShell";

export function AppLayout({ children }: PropsWithChildren) {
  return <AppShell>{children}</AppShell>;
}
