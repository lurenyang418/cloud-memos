import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Globe2, LockKeyhole, Users } from "lucide-react";
import type { ComponentType } from "react";
import type { MemoVisibility } from "../../shared/types";

const options: Array<{ value: MemoVisibility; label: string; icon: ComponentType<{ size?: number }> }> = [
  { value: "PRIVATE", label: "仅自己", icon: LockKeyhole },
  { value: "MEMBERS", label: "实例成员", icon: Users },
  { value: "PUBLIC", label: "公开", icon: Globe2 },
];

export function VisibilitySelect({ value, onChange }: { value: MemoVisibility; onChange: (value: MemoVisibility) => void }) {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as MemoVisibility)}>
      <Select.Trigger className="select-trigger" aria-label="可见性"><Select.Value /><ChevronDown size={15} /></Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={6}>
          <Select.Viewport>{options.map(({ value: option, label, icon: Icon }) => (
            <Select.Item key={option} value={option} className="select-item"><Icon size={15} /><Select.ItemText>{label}</Select.ItemText><Select.ItemIndicator className="ml-auto"><Check size={15} /></Select.ItemIndicator></Select.Item>
          ))}</Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function VisibilityBadge({ visibility }: { visibility: MemoVisibility }) {
  const option = options.find((item) => item.value === visibility)!;
  const Icon = option.icon;
  return <span className="meta-item"><Icon size={13} />{option.label}</span>;
}
