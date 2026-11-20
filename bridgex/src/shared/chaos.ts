export const CHAOS_TARGETS = ['core-banking', 'fintech'] as const;
export type ChaosTarget = (typeof CHAOS_TARGETS)[number];
export type ChaosMode = 'error' | 'timeout';

export interface ChaosSetting {
  target: ChaosTarget;
  mode: ChaosMode | 'off';
  remaining: number;
}

/** Failure injection shared by the simulators (consume) and the gateway admin API (set, list). */
export interface ChaosStore {
  /** Atomically takes one unit of chaos for the target. Returns the mode, or null when none is left. */
  consume(target: ChaosTarget): Promise<ChaosMode | null>;
  set(target: ChaosTarget, mode: ChaosMode | 'off', count: number): Promise<void>;
  list(): Promise<ChaosSetting[]>;
}

export function isChaosTarget(value: unknown): value is ChaosTarget {
  return typeof value === 'string' && (CHAOS_TARGETS as readonly string[]).includes(value);
}

export class InMemoryChaosStore implements ChaosStore {
  private readonly settings = new Map<ChaosTarget, ChaosSetting>();

  async consume(target: ChaosTarget): Promise<ChaosMode | null> {
    const setting = this.settings.get(target);
    if (!setting || setting.mode === 'off' || setting.remaining <= 0) return null;
    setting.remaining -= 1;
    return setting.mode;
  }

  async set(target: ChaosTarget, mode: ChaosMode | 'off', count: number): Promise<void> {
    this.settings.set(target, { target, mode, remaining: mode === 'off' ? 0 : count });
  }

  async list(): Promise<ChaosSetting[]> {
    return CHAOS_TARGETS.map((target) => this.settings.get(target) ?? { target, mode: 'off', remaining: 0 });
  }
}
