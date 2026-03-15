import { useFormContext } from "react-hook-form";
import type { DistributionType } from "@/types/graph";

const DIST_OPTIONS: { value: DistributionType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "normal", label: "Normal" },
  { value: "exponential", label: "Exponential" },
  { value: "triangular", label: "Triangular" },
  { value: "uniform", label: "Uniform" },
  { value: "weibull", label: "Weibull" },
  { value: "lognormal", label: "Log-Normal" },
  { value: "poisson", label: "Poisson" },
];

interface Props {
  fieldPrefix: string; // e.g. "duration" or "inter_arrival"
}

export function DistributionPicker({ fieldPrefix }: Props) {
  const { register, watch } = useFormContext();
  const distType: DistributionType = watch(`${fieldPrefix}.type`) ?? "fixed";

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Distribution</label>
        <select
          {...register(`${fieldPrefix}.type`)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          {DIST_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {distType === "fixed" && (
        <Field label="Value" name={`${fieldPrefix}.value`} />
      )}
      {(distType === "normal" || distType === "lognormal") && (
        <>
          <Field label="Mean" name={`${fieldPrefix}.mean`} />
          <Field label="Std Dev" name={`${fieldPrefix}.std`} />
        </>
      )}
      {distType === "exponential" && (
        <Field label="Scale (1/λ)" name={`${fieldPrefix}.scale`} />
      )}
      {distType === "triangular" && (
        <>
          <Field label="Low" name={`${fieldPrefix}.low`} />
          <Field label="Mode" name={`${fieldPrefix}.mode`} />
          <Field label="High" name={`${fieldPrefix}.high`} />
        </>
      )}
      {distType === "uniform" && (
        <>
          <Field label="Low" name={`${fieldPrefix}.low`} />
          <Field label="High" name={`${fieldPrefix}.high`} />
        </>
      )}
      {distType === "weibull" && (
        <>
          <Field label="Scale" name={`${fieldPrefix}.scale`} />
          <Field label="Shape" name={`${fieldPrefix}.shape`} />
        </>
      )}
      {distType === "poisson" && (
        <Field label="Mean (λ)" name={`${fieldPrefix}.mean`} />
      )}
    </div>
  );
}

function Field({ label, name }: { label: string; name: string }) {
  const { register } = useFormContext();
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        type="number"
        step="any"
        {...register(name, { valueAsNumber: true })}
        className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
    </div>
  );
}
