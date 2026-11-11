"use client";

import { Select, Tooltip } from "@mantine/core";
import { IconLanguage } from "@tabler/icons-react";
import { useLanguage } from "@/lib/language";

interface LanguageSelectProps {
  size?: "xs" | "sm" | "md";
}

export function LanguageSelect({ size = "sm" }: LanguageSelectProps) {
  const { language, options, setLanguage, t } = useLanguage();

  return (
    <Tooltip label={t.common.languageTooltip} position="bottom">
      <Select
        className="sade-language-select"
        size={size}
        w={190}
        data={options}
        value={language}
        onChange={setLanguage}
        leftSection={<IconLanguage size={16} />}
        aria-label={t.common.languageAriaLabel}
        allowDeselect={false}
      />
    </Tooltip>
  );
}
