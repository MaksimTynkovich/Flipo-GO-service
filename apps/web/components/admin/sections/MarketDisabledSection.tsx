"use client";

import { AdminPage, AdminPanel } from "@/components/admin/admin-ui";

export default function MarketDisabledSection() {
  return (
    <AdminPage title="Маркет" description="Раздел временно выключен.">
      <AdminPanel title="Недоступно">
        <p className="text-sm text-muted">
          Маркет отключён на платформе. Листинги, синхронизация бота и торговля недоступны, пока флаг
          не будет включён снова.
        </p>
      </AdminPanel>
    </AdminPage>
  );
}
