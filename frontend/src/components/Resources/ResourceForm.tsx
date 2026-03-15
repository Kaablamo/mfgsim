import { useForm } from "react-hook-form";
import { useResourceStore } from "@/store/resourceStore";
import type { ResourceModel } from "@/types/resources";

interface Props {
  existing?: ResourceModel;
  onClose: () => void;
}

const defaultResource = (): ResourceModel => ({
  id: `res_${Date.now()}`,
  name: "Robot",
  quantity: 1,
});

export function ResourceForm({ existing, onClose }: Props) {
  const { addResource, updateResource } = useResourceStore();
  const { register, handleSubmit } = useForm<ResourceModel>({
    defaultValues: existing ?? defaultResource(),
  });

  function onSubmit(values: ResourceModel) {
    if (existing) {
      updateResource(existing.id, values);
    } else {
      addResource({ ...values, id: `res_${Date.now()}` });
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
          placeholder="e.g. Robot, Operator, Forklift"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Quantity</label>
        <p className="text-[11px] text-gray-400 mt-0.5">How many of this resource exist in the system</p>
        <input
          type="number"
          min={1}
          {...register("quantity", { valueAsNumber: true })}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {existing ? "Update" : "Add"} Resource
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
