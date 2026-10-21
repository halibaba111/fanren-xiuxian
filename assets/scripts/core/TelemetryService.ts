import { LocalSave, TelemetryEvent } from './StoryTypes';

export type TelemetryPayload = Record<string, string | number | boolean>;

/**
 * Keeps lightweight, local-only gameplay traces. The capped history is useful
 * for balancing without turning the save file into an unbounded event log.
 */
export class TelemetryService {
    public static record(
        save: LocalSave,
        name: string,
        payload: TelemetryPayload = {},
    ): void {
        const event: TelemetryEvent = {
            name,
            timestamp: Date.now(),
            payload,
        };
        save.telemetry = [...(save.telemetry ?? []), event].slice(-100);
    }
}
