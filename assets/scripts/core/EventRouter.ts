import {
    GameContentRegistry,
    MapEventConfig,
} from './GameContentRegistry';
import { SaveManager } from './SaveManager';
import { EventTriggerMode, LocalSave } from './StoryTypes';

export type EventArrivalStatus =
    | 'none'
    | 'auto'
    | 'confirm'
    | 'recorded';

export interface EventArrivalResult {
    status: EventArrivalStatus;
    event: MapEventConfig | null;
}

export class EventRouter {
    public static arrive(
        save: LocalSave,
        mapId: string,
        locationId: string,
    ): EventArrivalResult {
        const event = GameContentRegistry.eventAt(save, mapId, locationId);
        if (!event) {
            return { status: 'none', event: null };
        }

        if (save.eventTriggerMode === 'auto') {
            save.pendingEventId = '';
            SaveManager.save(save);
            return { status: 'auto', event };
        }

        save.pendingEventId = event.id;
        SaveManager.save(save);
        return {
            status:
                save.eventTriggerMode === 'manual'
                    ? 'recorded'
                    : 'confirm',
            event,
        };
    }

    public static pending(save: LocalSave): MapEventConfig | null {
        if (!save.pendingEventId) {
            return null;
        }
        const event = GameContentRegistry.event(save.pendingEventId);
        if (!event || !GameContentRegistry.isEventUnlocked(save, event)) {
            save.pendingEventId = '';
            SaveManager.save(save);
            return null;
        }
        return event;
    }

    public static consumePending(save: LocalSave): MapEventConfig | null {
        const event = this.pending(save);
        save.pendingEventId = '';
        SaveManager.save(save);
        return event;
    }

    public static setMode(save: LocalSave, mode: EventTriggerMode): void {
        save.eventTriggerMode = mode;
        SaveManager.save(save);
    }
}
