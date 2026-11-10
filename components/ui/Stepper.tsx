"use client";

import {
  Box,
  Group,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
  useMantineColorScheme,
  Paper,
  rem,
  Transition,
} from "@mantine/core";
import { IconCheck, IconCircle } from "@tabler/icons-react";
import { ReactNode } from "react";

export interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
}

interface StepperProps {
  steps: Step[];
  activeStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowClickNavigation?: boolean;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  completedSteps?: number[];
}

interface StepperContentProps {
  children: ReactNode;
  step: number;
  activeStep: number;
}

const sizeConfig = {
  sm: {
    iconSize: 32,
    fontSize: "sm" as const,
    descFontSize: "xs" as const,
    spacing: "xs" as const,
    lineWidth: 2,
  },
  md: {
    iconSize: 40,
    fontSize: "sm" as const,
    descFontSize: "xs" as const,
    spacing: "sm" as const,
    lineWidth: 2,
  },
  lg: {
    iconSize: 48,
    fontSize: "md" as const,
    descFontSize: "sm" as const,
    spacing: "md" as const,
    lineWidth: 3,
  },
};

export function Stepper({
  steps,
  activeStep,
  onStepClick,
  allowClickNavigation = false,
  orientation = "horizontal",
  size = "md",
  completedSteps = [],
}: StepperProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const config = sizeConfig[size];

  const isStepCompleted = (stepIndex: number) => {
    return completedSteps.includes(stepIndex) || stepIndex < activeStep;
  };

  const isStepActive = (stepIndex: number) => {
    return stepIndex === activeStep;
  };

  const isStepClickable = (stepIndex: number) => {
    if (!allowClickNavigation || !onStepClick) return false;
    // Can click on completed steps or the next step
    return isStepCompleted(stepIndex) || stepIndex <= activeStep + 1;
  };

  const getStepColor = (stepIndex: number) => {
    if (isStepCompleted(stepIndex)) return "var(--mantine-color-green-6)";
    if (isStepActive(stepIndex)) return "var(--mantine-color-brand-6)";
    return isDark
      ? "var(--mantine-color-dark-3)"
      : "var(--mantine-color-gray-4)";
  };

  const getStepBgColor = (stepIndex: number) => {
    if (isStepCompleted(stepIndex)) {
      return isDark ? "rgba(111, 139, 106, 0.15)" : "rgba(111, 139, 106, 0.1)";
    }
    if (isStepActive(stepIndex)) {
      return isDark ? "rgba(111, 139, 106, 0.15)" : "rgba(111, 139, 106, 0.1)";
    }
    return isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)";
  };

  const getLineColor = (stepIndex: number) => {
    if (isStepCompleted(stepIndex)) return "var(--mantine-color-green-6)";
    return isDark
      ? "var(--mantine-color-dark-4)"
      : "var(--mantine-color-gray-3)";
  };

  const renderStepIcon = (step: Step, index: number) => {
    const completed = isStepCompleted(index);
    const active = isStepActive(index);

    return (
      <ThemeIcon
        size={config.iconSize}
        radius="xl"
        style={{
          backgroundColor: getStepBgColor(index),
          color: getStepColor(index),
          border: `2px solid ${getStepColor(index)}`,
          transition: "all 0.2s ease",
        }}
      >
        {completed ? (
          <IconCheck size={config.iconSize * 0.5} stroke={3} />
        ) : step.icon ? (
          step.icon
        ) : (
          <Text size={config.fontSize} fw={600}>
            {index + 1}
          </Text>
        )}
      </ThemeIcon>
    );
  };

  if (orientation === "vertical") {
    return (
      <Stack gap={0}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const clickable = isStepClickable(index);

          return (
            <Box key={step.id}>
              <UnstyledButton
                onClick={() => clickable && onStepClick?.(index)}
                disabled={!clickable}
                style={{
                  cursor: clickable ? "pointer" : "default",
                  width: "100%",
                }}
              >
                <Group gap={config.spacing} align="flex-start" wrap="nowrap">
                  <Stack gap={0} align="center">
                    {renderStepIcon(step, index)}
                    {!isLast && (
                      <Box
                        style={{
                          width: config.lineWidth,
                          height: 40,
                          backgroundColor: getLineColor(index),
                          marginTop: 4,
                          marginBottom: 4,
                          borderRadius: config.lineWidth,
                          transition: "background-color 0.2s ease",
                        }}
                      />
                    )}
                  </Stack>
                  <Stack gap={2} style={{ paddingTop: 8 }}>
                    <Text
                      size={config.fontSize}
                      fw={isStepActive(index) ? 600 : 500}
                      c={isStepActive(index) ? undefined : "dimmed"}
                    >
                      {step.title}
                    </Text>
                    {step.description && (
                      <Text size={config.descFontSize} c="dimmed">
                        {step.description}
                      </Text>
                    )}
                  </Stack>
                </Group>
              </UnstyledButton>
            </Box>
          );
        })}
      </Stack>
    );
  }

  // Horizontal orientation
  return (
    <Group gap={0} justify="center" wrap="nowrap" style={{ width: "100%" }}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const clickable = isStepClickable(index);

        return (
          <Group
            key={step.id}
            gap={0}
            wrap="nowrap"
            style={{ flex: isLast ? "0 0 auto" : 1 }}
          >
            <UnstyledButton
              onClick={() => clickable && onStepClick?.(index)}
              disabled={!clickable}
              style={{
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <Stack gap={config.spacing} align="center">
                {renderStepIcon(step, index)}
                <Stack gap={2} align="center" style={{ maxWidth: 120 }}>
                  <Text
                    size={config.fontSize}
                    fw={isStepActive(index) ? 600 : 500}
                    c={isStepActive(index) ? undefined : "dimmed"}
                    ta="center"
                    lineClamp={1}
                  >
                    {step.title}
                  </Text>
                  {step.description && (
                    <Text
                      size={config.descFontSize}
                      c="dimmed"
                      ta="center"
                      lineClamp={2}
                    >
                      {step.description}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </UnstyledButton>

            {!isLast && (
              <Box
                style={{
                  flex: 1,
                  height: config.lineWidth,
                  backgroundColor: getLineColor(index),
                  marginLeft: rem(8),
                  marginRight: rem(8),
                  marginTop: config.iconSize / 2,
                  borderRadius: config.lineWidth,
                  transition: "background-color 0.2s ease",
                  alignSelf: "flex-start",
                }}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

// Wrapper for step content with transition
export function StepperContent({
  children,
  step,
  activeStep,
}: StepperContentProps) {
  const isVisible = step === activeStep;

  return (
    <Transition
      mounted={isVisible}
      transition="fade"
      duration={200}
      timingFunction="ease"
    >
      {(styles) => (
        <Box style={{ ...styles, display: isVisible ? "block" : "none" }}>
          {children}
        </Box>
      )}
    </Transition>
  );
}

// Navigation buttons component
interface StepperNavigationProps {
  activeStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onComplete?: () => void;
  nextLabel?: string;
  prevLabel?: string;
  completeLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function StepperNavigation({
  activeStep,
  totalSteps,
  onNext,
  onPrev,
  onComplete,
  nextLabel = "Lanjut",
  prevLabel = "Kembali",
  completeLabel = "Selesai",
  nextDisabled = false,
  loading = false,
  children,
}: StepperNavigationProps) {
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === totalSteps - 1;

  // Import Button dynamically to avoid circular dependencies
  const { Button, Group } = require("@mantine/core");

  return (
    <Group justify="space-between" mt="xl">
      <Button
        variant="subtle"
        onClick={onPrev}
        disabled={isFirstStep || loading}
      >
        {prevLabel}
      </Button>

      <Group gap="sm">
        {children}
        {isLastStep ? (
          <Button
            onClick={onComplete || onNext}
            disabled={nextDisabled}
            loading={loading}
            color="green"
          >
            {completeLabel}
          </Button>
        ) : (
          <Button onClick={onNext} disabled={nextDisabled} loading={loading}>
            {nextLabel}
          </Button>
        )}
      </Group>
    </Group>
  );
}

// Card wrapper for stepper
interface StepperCardProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function StepperCard({
  children,
  title,
  description,
}: StepperCardProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Paper
      p="xl"
      radius="lg"
      shadow="sm"
      style={{
        border: isDark
          ? "1px solid var(--mantine-color-dark-4)"
          : "1px solid var(--mantine-color-gray-2)",
      }}
    >
      {(title || description) && (
        <Stack gap="xs" mb="lg">
          {title && (
            <Text size="lg" fw={600}>
              {title}
            </Text>
          )}
          {description && (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
      )}
      {children}
    </Paper>
  );
}
