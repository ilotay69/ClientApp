"use client";

import { Select } from "@base-ui/react/select";
import { Combobox } from "@base-ui/react/combobox";
import s from "./workspace-controls.module.css";

export type CGOption = {
  value: string;
  label: string;
  tone?: "red" | "amber" | "green" | "neutral";
  disabled?: boolean;
};
type Props = {
  label: string;
  value: string;
  options: CGOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
};
function Chevron() {
  return (
    <svg
      className={s.chevron}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
function Check() {
  return (
    <svg
      className={s.optionCheck}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m3 8 3 3 7-7" />
    </svg>
  );
}
function OptionLabel({ option }: { option: CGOption }) {
  return (
    <>
      {option.tone && (
        <span className={s.dot} data-tone={option.tone} aria-hidden="true" />
      )}
      <span className={s.optionLabel}>{option.label}</span>
    </>
  );
}

/** CG-styled keyboard-first select; searchable mode is for long client/reference lists. */
export function CGSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  searchable,
  className = "",
}: Props) {
  if (searchable)
    return (
      <Combobox.Root
        items={options}
        value={options.find((o) => o.value === value) ?? null}
        disabled={disabled}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(option) => {
          if (option) onChange(option.value);
        }}
      >
        <Combobox.Trigger
          aria-label={label}
          className={`${s.select} ${className}`}
        >
          <span>
            <Combobox.Value />
          </span>
          <Chevron />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner
            className={s.positioner}
            align="start"
            sideOffset={6}
          >
            <Combobox.Popup className={s.popup} aria-label={label}>
              <Combobox.Input
                className={s.searchInput}
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder="Type to find…"
              />
              <Combobox.Empty className={s.empty}>
                No matches found.
              </Combobox.Empty>
              <Combobox.List className={s.options}>
                {(option: CGOption) => (
                  <Combobox.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className={s.option}
                  >
                    <OptionLabel option={option} />
                    <Combobox.ItemIndicator>
                      <Check />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    );
  return (
    <Select.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <Select.Trigger aria-label={label} className={`${s.select} ${className}`}>
        <Select.Value />
        <Select.Icon>
          <Chevron />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className={s.positioner}
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={s.popup}>
            <Select.List className={s.options}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={s.option}
                >
                  {option.tone && (
                    <span
                      className={s.dot}
                      data-tone={option.tone}
                      aria-hidden="true"
                    />
                  )}
                  <Select.ItemText className={s.optionLabel}>
                    {option.label}
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
