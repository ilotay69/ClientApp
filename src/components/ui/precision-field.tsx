"use client";
import { useId } from "react";
import { NumberField } from "@base-ui/react/number-field";
import { boundedWholeNumber } from "@/lib/workspace-controls";
import s from "./workspace-controls.module.css";

/** Advanced sizing: typing, +/- and arrow keys first; mouse-label scrubbing is optional. */
export function PrecisionField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  function commit(next: number | null) {
    const bounded = boundedWholeNumber(next, min, max);
    if (bounded !== null) onChange(bounded);
  }
  return (
    <NumberField.Root
      className={s.numberField}
      value={value}
      min={min}
      max={max}
      step={1}
      snapOnStep
      locale="en-CA"
      onValueChange={(next, details) => {
        // Don't clamp the first digit while somebody is typing a multi-digit value.
        if (
          details.reason !== "input-change" &&
          details.reason !== "input-clear" &&
          next !== null
        )
          commit(next);
      }}
      onValueCommitted={commit}
    >
      <NumberField.ScrubArea className={s.scrubLabel}>
        <label htmlFor={id}>
          {label}
          <span aria-hidden="true">↔</span>
        </label>
      </NumberField.ScrubArea>
      <NumberField.Group className={s.numberGroup}>
        <NumberField.Decrement aria-label={`Decrease ${label.toLowerCase()}`}>
          −
        </NumberField.Decrement>
        <NumberField.Input id={id} aria-describedby={`${id}-hint`} />
        <NumberField.Increment aria-label={`Increase ${label.toLowerCase()}`}>
          +
        </NumberField.Increment>
      </NumberField.Group>
      <span className={s.numberHint} id={`${id}-hint`}>
        {hint}
      </span>
    </NumberField.Root>
  );
}
