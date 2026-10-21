import { LocalSave } from './StoryTypes';

export const GAME_PROGRESS_SAVE_FORMAT = 'xiuxian-game-save-v1';

interface LampsPlatformResult {
    ok: boolean;
    message?: string;
    data?: {
        record?: {
            gamePayload?: unknown;
            updatedAt?: string | number;
        };
        gamePayload?: unknown;
    } | null;
}

interface LampsPlatformApi {
    saveGameProgress(progress: unknown): Promise<LampsPlatformResult>;
    getGameProgress(): Promise<LampsPlatformResult>;
}

interface WindowWithLampsPlatform extends Window {
    LampsPlatform?: LampsPlatformApi;
}

export interface CloudSaveEnvelope {
    format: typeof GAME_PROGRESS_SAVE_FORMAT;
    slotIndex: number;
    savedAt: number;
    revision: number;
    save: LocalSave;
}

export interface CloudReadResult {
    available: boolean;
    envelope: CloudSaveEnvelope | null;
    message?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? value as Record<string, unknown>
        : null;
}

function toTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string' && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function getPlatform(): LampsPlatformApi | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const platform = (window as WindowWithLampsPlatform).LampsPlatform;
    return platform &&
        typeof platform.saveGameProgress === 'function' &&
        typeof platform.getGameProgress === 'function'
        ? platform
        : null;
}

function unwrapGamePayload(value: unknown): unknown {
    const record = asRecord(value);
    if (!record) {
        return value;
    }
    if (Object.prototype.hasOwnProperty.call(record, 'game_payload')) {
        return record.game_payload;
    }
    if (Object.prototype.hasOwnProperty.call(record, 'game_paload')) {
        return record.game_paload;
    }
    if (Object.prototype.hasOwnProperty.call(record, 'payload')) {
        return record.payload;
    }
    return value;
}

function normalizeEnvelope(
    payload: unknown,
    updatedAt: unknown,
): CloudSaveEnvelope | null {
    const candidate = asRecord(unwrapGamePayload(payload));
    if (!candidate) {
        return null;
    }

    const saveCandidate = asRecord(candidate.save) ?? candidate;
    if (
        typeof saveCandidate.chapterId !== 'string' ||
        typeof saveCandidate.nodeId !== 'string'
    ) {
        return null;
    }

    const savedAt = toTimestamp(candidate.savedAt) || toTimestamp(updatedAt);
    const slotIndex = Math.max(
        0,
        Math.floor(Number(candidate.slotIndex) || 0),
    );
    const revision = Math.max(
        0,
        Math.floor(Number(candidate.revision) || savedAt),
    );

    return {
        format: GAME_PROGRESS_SAVE_FORMAT,
        slotIndex,
        savedAt,
        revision,
        save: saveCandidate as unknown as LocalSave,
    };
}

export class GameProgressCloud {
    public static async read(): Promise<CloudReadResult> {
        const platform = getPlatform();
        if (!platform) {
            return {
                available: false,
                envelope: null,
                message: '进度能力暂不可用',
            };
        }

        try {
            const result = await platform.getGameProgress();
            if (!result || result.ok !== true) {
                return {
                    available: true,
                    envelope: null,
                    message: result?.message || '云端存档读取失败',
                };
            }
            const data = result.data ?? null;
            const record = data?.record;
            const payload = record?.gamePayload ?? data?.gamePayload ?? data;
            return {
                available: true,
                envelope: normalizeEnvelope(payload, record?.updatedAt),
            };
        } catch (error) {
            return {
                available: true,
                envelope: null,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public static async write(
        envelope: CloudSaveEnvelope,
    ): Promise<{ ok: boolean; message?: string }> {
        const platform = getPlatform();
        if (!platform) {
            return {
                ok: false,
                message: '进度能力暂不可用',
            };
        }

        try {
            const result = await platform.saveGameProgress(envelope);
            return result?.ok === true
                ? { ok: true }
                : {
                    ok: false,
                    message: result?.message || '云端存档写入失败',
                };
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
