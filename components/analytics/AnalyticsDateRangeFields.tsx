"use client";

import { DatePickerInput } from "@mantine/dates";
import { IconCalendarStats } from "@tabler/icons-react";
import "dayjs/locale/id";

export type AnalyticsDateRange = [Date | null, Date | null];

interface AnalyticsDateRangeFieldsProps {
  value: AnalyticsDateRange;
  onChange: (value: AnalyticsDateRange) => void;
  startLabel?: string;
  endLabel?: string;
  maxDate?: Date;
  locale?: "id" | "en";
}

function earlierDate(left?: Date | null, right?: Date | null) {
  if (!left) return right ?? undefined;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

export function AnalyticsDateRangeFields({
  value,
  onChange,
  startLabel = "Tanggal mulai",
  endLabel = "Tanggal akhir",
  maxDate,
  locale = "id",
}: AnalyticsDateRangeFieldsProps) {
  const [startDate, endDate] = value;

  return (
    <>
      <DatePickerInput
        label={startLabel}
        value={startDate}
        onChange={(nextStart) => onChange([nextStart, endDate])}
        maxDate={earlierDate(endDate, maxDate)}
        clearable={false}
        locale={locale}
        valueFormat="DD MMM YYYY"
        leftSection={<IconCalendarStats size={16} />}
      />
      <DatePickerInput
        label={endLabel}
        value={endDate}
        onChange={(nextEnd) => onChange([startDate, nextEnd])}
        minDate={startDate ?? undefined}
        maxDate={maxDate}
        clearable={false}
        locale={locale}
        valueFormat="DD MMM YYYY"
        leftSection={<IconCalendarStats size={16} />}
      />
    </>
  );
}
