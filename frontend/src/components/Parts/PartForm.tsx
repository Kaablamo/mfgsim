import { useForm } from "react-hook-form";
import { usePartStore } from "@/store/partStore";
import type { PartDefinition } from "@/types/parts";

interface Props {
  existing?: PartDefinition;
  onClose: () => void;
}

function defaultPart(): PartDefinition {
  return { id: `part_${Date.now()}`, name: "" };
}

export function PartForm({ existing, onClose }: Props) {
  const { addPart, updatePart } = usePartStore();
  const { register, handleSubmit } = useForm<PartDefinition>({
    defaultValues: existing ?? defaultPart(),
  });

  function onSubmit(values: PartDefinition) {
    if (existing) {
      updatePart(existing.id, values);
    } else {
      addPart({ ...values, id: `part_${Date.now()}` });
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("name", { required: true })}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="e.g. Raw Casting"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Part Number</label>
        <p className="text-[11px] text-gray-400 mt-0.5">Optional identifier or P/N code</p>
        <input
          {...register("number")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="e.g. PN-1042"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {existing ? "Update" : "Add"} Part
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
