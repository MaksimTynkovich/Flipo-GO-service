export function AppSplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background pt-[var(--app-safe-top)] pb-[var(--app-safe-bottom)]"
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
    >
      <div className="splash-spinner" aria-hidden />
    </div>
  );
}
