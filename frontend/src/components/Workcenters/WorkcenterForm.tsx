import { useForm } from "react-hook-form";
import { useWorkcenterStore } from "@/store/workcenterStore";
import type { WorkcenterModel } from "@/types/workcenter";

interface Props {
  existing?: WorkcenterModel;
  onClose: () => void;
}

const defaultWorkcenter = (): WorkcenterModel => ({
  id: `wc_${Date.now()}`,
  name: "Workcenter",
  capacity: 1,
});

export function WorkcenterForm({ existing, onClose }: Props) {
  const { addWorkcenter, updateWorkcenter } = useWorkcenterStore();
  const { register, handleSubmit } = useForm<WorkcenterModel>({
    defaultValues: existing ?? defaultWorkcenter(),
  });

  function onSubmit(values: WorkcenterModel) {
    if (existing) {
      updateWorkcenter(existing.id, values);
    } else {
      addWorkcenter({ ...values, id: `wc_${Date.now()}` });
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("name")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="e.g. Nest 1, Assembly Cell A"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Capacity</label>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Max parts active in this workcenter simultaneously
        </p>
        <input
          type="number"
          min={1}
          {...register("capacity", { valueAsNumber: true })}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {existing ? "Update" : "Add"} Workcenter
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
