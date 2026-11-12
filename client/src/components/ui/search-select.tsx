import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./command";

// Drop-in replacement for <select> with search-as-you-type: same props (value, onChange, className, required, disabled) and the same
// <option> children, so a screen switches by renaming the tag. onChange receives { target: { value } } like a native select.
type Opt = { value: string; label: string; disabled?: boolean };

const textOf = (n: React.ReactNode): string => {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (React.isValidElement(n)) return textOf((n.props as any).children);
  return "";
};

function collect(children: React.ReactNode, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (ch) => {
    if (!React.isValidElement(ch)) return;
    const p = ch.props as any;
    if (ch.type === "option") { const label = textOf(p.children); out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: p.disabled }); }
    else collect(p?.children, out); // fragments, optgroup, arrays
  });
  return out;
}

// Utilities that size/place the control in its parent (the native select carried them); the rest styles the button itself.
const LAYOUT = /^(w-|min-w-|max-w-|flex-|grow|shrink|basis-|col-span-|self-|-?m[trblxy]?-|block$|inline|hidden$)/;

export type SearchSelectProps = {
  value?: string | number | null; defaultValue?: string | number; onChange?: (e: any) => void; // receives { target: { value, name }, currentTarget: { value } }, like the native select's event
  className?: string; required?: boolean; disabled?: boolean; name?: string; id?: string; title?: string; children?: React.ReactNode; searchPlaceholder?: string;
};

export function SearchSelect({ value, defaultValue, onChange, className = "", required, disabled, name, id, title, children, searchPlaceholder = "Buscar…" }: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(String(defaultValue ?? ""));
  const current = value === undefined ? inner : String(value ?? "");
  const options = React.useMemo(() => collect(children), [children]);
  const selected = options.find((o) => o.value === current);
  const empty = options.find((o) => o.value === ""); // the "Elegir…" / "Todos" entry doubles as placeholder
  const tokens = className.split(/\s+/).filter(Boolean);
  const wrapperCls = tokens.filter((t) => LAYOUT.test(t)).join(" ");
  const buttonCls = tokens.filter((t) => !LAYOUT.test(t)).join(" ");

  const pick = (v: string) => {
    setOpen(false);
    if (value === undefined) setInner(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v } });
  };

  return (
    <div className={cn("relative inline-block", wrapperCls)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" id={id} title={title} disabled={disabled} role="combobox" aria-expanded={open}
            className={cn(buttonCls, "flex w-full items-center justify-between gap-2 bg-white text-left disabled:cursor-not-allowed disabled:opacity-60", !selected || current === "" ? "text-gray-500" : "text-gray-900")}>
            <span className="truncate">{selected && current !== "" ? selected.label : (empty?.label ?? selected?.label ?? "")}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              {options.map((o, i) => (
                <CommandItem key={`${o.value}-${i}`} value={`${o.label} ${i}`} disabled={o.disabled} onSelect={() => pick(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", o.value === current ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label || "—"}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {required && <input tabIndex={-1} aria-hidden="true" required value={current} onChange={() => {}} className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" />}
    </div>
  );
}
