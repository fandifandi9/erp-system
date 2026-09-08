"use client";

import { useLocale } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/design/cn";

/** Account preference panel — language (saved to user account). */
export function AccountPreferencesPanel({ className }: { className?: string }) {
  const { t } = useLocale();

  return (
    <Card className={cn(className)}>
      <CardHeader
        title={t("profile.preferences.title")}
        description={t("profile.preferences.languageDesc")}
      />
      <LanguageSwitcher variant="erp" />
    </Card>
  );
}
