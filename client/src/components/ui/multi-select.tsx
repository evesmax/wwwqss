import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./command";

// Multiple-choice sibling of SearchSelect: the list stays open so several entries can be ticked. No selection means "all".
export type MultiSelectProps = {
  options: [value: string, label: string][]; values: string[]; onChange: (values: string[]) => void;
  allLabel: string; noun: string; // "3 estados"
  className?: string; searchPlaceholder?: string; "aria-label"?: string;
};

export function MultiSelect({ options, values, onChange, allLabel, noun, className = "", searchPlaceholder = "Buscar…", "aria-label": ariaLabel }: MultiSelectProps) {
  const selected = options.filter(([v]) => values.includes(v));
  const text = !selected.length ? allLabel : selected.length <= 2 ? selected.map(([, l]) => l).join(", ") : `${selected.length} ${noun}`;
  // Emitted in option order, so the same selection always yields the same value.
  const toggle = (value: string) => onChange(options.map(([v]) => v).filter((v) => (v === value) !== values.includes(v)));
  const Box = ({ on }: { on: boolean }) => (
    <span className={cn("mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-[#00aeef] bg-[#00aeef] text-white" : "border-gray-300")}>
      {on && <Check className="h-3 w-3" />}
    </span>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-label={ariaLabel} title={selected.map(([, l]) => l).join(", ") || undefined}
          className={cn(className, "flex items-center justify-between gap-2 bg-white text-left", selected.length ? "text-gray-900" : "text-gray-500")}>
          <span className="truncate">{text}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandItem value={allLabel} data-checked={!selected.length} onSelect={() => onChange([])}><Box on={!selected.length} />{allLabel}</CommandItem>
            {options.map(([v, label], i) => (
              <CommandItem key={v} value={`${label} ${i}`} data-checked={values.includes(v)} onSelect={() => toggle(v)}>
                <Box on={values.includes(v)} />
                <span className="truncate">{label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
