import { useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { useSimApi } from "@/hooks/useSimApi";
import { useSimStore } from "@/store/simStore";
import type { SimConfig } from "@/types/simConfig";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function SimConfigModal({ onClose }: Props) {
  const { simConfig, setSimConfig, simState, setShutdownRequested } = useSimStore();
  const { shutdownServer } = useSimApi();
  const { register, handleSubmit } = useForm<SimConfig>({ defaultValues: simConfig });
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [shutdownError, setShutdownError] = useState<string | null>(null);

  const hasActiveRun = simState === "running" || simState === "warmup";

  function onSubmit(values: SimConfig) {
    const seed = values.rng_seed;
    setSimConfig({
      ...values,
      rng_seed: seed === ("" as never) || seed === undefined ? undefined : Number(seed),
    });
    onClose();
  }

  async function handleShutdown() {
    setIsShuttingDown(true);
    setShutdownError(null);
    try {
      await shutdownServer();
      setShutdownRequested(true);
      onClose();
    } catch (error) {
      setShutdownError(getErrorMessage(error, "Failed to shut down the local MfgSim server."));
    } finally {
      setIsShuttingDown(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-[26rem] rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Simulation Settings</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Duration (time units)" name="duration" register={register} />
            <Field label="Warm-up Period" name="warmup_period" register={register} helpText="Sim time before stats collection begins" />
            <Field label="Tick Interval" name="tick_interval" register={register} helpText="How often the UI updates" />
            <Field label="RNG Seed (optional)" name="rng_seed" register={register} helpText="Leave blank for random" optional />
            <button
              type="submit"
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save Settings
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-900">Application</h3>
            <p className="mt-1 text-xs leading-5 text-red-800">
              Shut down the local server that hosts this page. You can always relaunch MfgSim
              from the executable later.
            </p>
            <button
              type="button"
              onClick={() => {
                setShutdownError(null);
                setShowShutdownConfirm(true);
              }}
              className="mt-3 w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Shut Down MfgSim
            </button>
            {shutdownError && <p className="mt-2 text-xs text-red-700">{shutdownError}</p>}
          </div>
        </div>
      </div>

      {showShutdownConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Shut down MfgSim?</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  This will stop the local server hosting this page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShutdownConfirm(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={isShuttingDown}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p>Unsaved model changes in this browser session will be lost.</p>
              <p className="mt-2">All open MfgSim tabs will disconnect until you relaunch the app.</p>
              {hasActiveRun && (
                <p className="mt-2 font-medium">
                  An active simulation is running now. Shutting down will stop it immediately.
                </p>
              )}
            </div>

            {shutdownError && <p className="mt-3 text-sm text-red-700">{shutdownError}</p>}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowShutdownConfirm(false)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={isShuttingDown}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShutdown}
                className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                disabled={isShuttingDown}
              >
                {isShuttingDown ? "Shutting down..." : "Shut Down"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label, name, register, helpText, optional,
}: {
  label: string;
  name: keyof SimConfig;
  register: UseFormRegister<SimConfig>;
  helpText?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</label>
      {helpText && <p className="mt-0.5 text-[11px] text-gray-400">{helpText}</p>}
      <input
        type="number"
        step="any"
        {...register(name, { valueAsNumber: !optional })}
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        placeholder={optional ? "Leave blank for random" : undefined}
      />
    </div>
  );
}
