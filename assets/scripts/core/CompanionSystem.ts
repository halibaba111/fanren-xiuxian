import { CharacterDefinition, CompanionState, LocalSave } from './StoryTypes';
import { CharacterRegistry } from './CharacterRegistry';
import { RelationshipSystem } from './RelationshipSystem';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';

export interface CompanionSummary {
    definition: CharacterDefinition;
    state: CompanionState;
    canRecruit: boolean;
    favor: number;
    levelLabel: string;
}

export interface CompanionFavorAdResult {
    success: boolean;
    message: string;
    favor?: number;
}

const MAX_ACTIVE_COMPANIONS = 3;

function normalizeSupportLevel(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.min(4, Math.floor(parsed)));
}

function normalizeDuplicateCount(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.floor(parsed));
}

export class CompanionSystem {
    public static definitions(): CharacterDefinition[] {
        return CharacterRegistry.companions();
    }

    public static ensure(save: LocalSave): void {
        save.companions = save.companions ?? {};
        this.definitions().forEach((definition) => {
            const current = save.companions[definition.npcId];
            const recruited = current?.recruited === true;
            save.companions[definition.npcId] = {
                npcId: definition.npcId,
                recruited,
                active: recruited && current?.active === true,
                recruitChapter:
                    current?.recruitChapter ??
                    definition.recruitChapter ??
                    '',
                recruitSceneId: current?.recruitSceneId ?? '',
                supportLevel: normalizeSupportLevel(current?.supportLevel),
                duplicateCount: normalizeDuplicateCount(current?.duplicateCount),
            };
        });
    }

    /**
     * Chapter one introduces Xu Zhaotang, so the first mainline clear grants
     * her as a reliable baseline partner instead of making combat readiness
     * depend on random recruitment.
     */
    public static ensureStarter(save: LocalSave): boolean {
        if (
            save.starterCompanionGranted === true ||
            !SaveManager.isChapterComplete(save, 'qi_01')
        ) {
            return false;
        }

        const npcId = 'xu_zhao_tang';
        const definition = this.getDefinition(npcId);
        if (!definition?.recruitable) {
            return false;
        }

        this.ensure(save);
        const contentId =
            definition.summonUnlockContent ?? `summon_${npcId}`;
        if (!SaveManager.isUnlocked(save, contentId)) {
            save.unlockedContent.push(contentId);
        }
        if (save.summon.unlockedNpcIds.indexOf(npcId) < 0) {
            save.summon.unlockedNpcIds.push(npcId);
        }
        SaveManager.addFlag(save, `summon_${npcId}_unlocked`, true);

        const state = save.companions[npcId];
        if (!state?.recruited && !this.recruit(save, npcId, 'qi01_starter')) {
            return false;
        }
        if (state && this.active(save).length < MAX_ACTIVE_COMPANIONS) {
            this.setActive(save, npcId, true);
        }
        save.starterCompanionGranted = true;
        SaveManager.addFlag(save, 'starter_companion_granted', true);
        return true;
    }

    public static getState(
        save: LocalSave,
        npcId: string,
    ): CompanionState | null {
        this.ensure(save);
        return save.companions[npcId] ?? null;
    }

    public static getDefinition(npcId: string): CharacterDefinition | null {
        return CharacterRegistry.get(npcId);
    }

    public static isSummonUnlocked(
        save: LocalSave,
        npcId: string,
    ): boolean {
        const definition = this.getDefinition(npcId);
        if (!definition?.recruitable) {
            return false;
        }

        this.ensure(save);
        const contentId =
            definition.summonUnlockContent ?? `summon_${definition.npcId}`;
        const explicitlyUnlocked =
            SaveManager.isUnlocked(save, contentId) ||
            save.summon?.unlockedNpcIds?.indexOf(npcId) >= 0 ||
            save.flags[`summon_${npcId}_unlocked`] === true;
        if (!explicitlyUnlocked) {
            return false;
        }

        const forbiddenFlags = definition.forbiddenFlags ?? [];
        return !forbiddenFlags.some((flag) => save.flags[flag] === true);
    }

    public static canSummon(save: LocalSave, npcId: string): boolean {
        const state = this.getState(save, npcId);
        return Boolean(
            state &&
            !state.recruited &&
            this.isSummonUnlocked(save, npcId),
        );
    }

    /**
     * Compatibility name for older callers. New acquisition is handled by
     * SummonSystem, but existing panels can still ask whether this partner is
     * available in the summon pool.
     */
    public static canRecruit(save: LocalSave, npcId: string): boolean {
        return this.canSummon(save, npcId);
    }

    public static recruit(
        save: LocalSave,
        npcId: string,
        recruitSceneId = '',
    ): boolean {
        const definition = this.getDefinition(npcId);
        if (!definition?.recruitable) {
            return false;
        }

        this.ensure(save);
        let state = save.companions[npcId];
        if (!state) {
            return false;
        }
        if (state.recruited) {
            return true;
        }
        if (!this.isSummonUnlocked(save, npcId)) {
            return false;
        }

        const activeCount = this.active(save).length;
        state = save.companions[npcId];
        if (!state) {
            return false;
        }
        state.recruited = true;
        state.active = activeCount < MAX_ACTIVE_COMPANIONS;
        state.recruitChapter =
            save.chapterId || definition.recruitChapter || '';
        state.recruitSceneId = recruitSceneId;
        state.supportLevel = normalizeSupportLevel(
            save.relationships[npcId]?.level,
        );

        const relationship = save.relationships[npcId];
        if (relationship) {
            relationship.recruited = true;
        }

        SaveManager.addFlag(save, `companion_${npcId}_recruited`, true);
        SaveManager.addFlag(
            save,
            `companion_${npcId}_active`,
            state.active,
        );
        return true;
    }

    public static registerDuplicate(
        save: LocalSave,
        npcId: string,
    ): number {
        this.ensure(save);
        const state = save.companions[npcId];
        if (!state) {
            return 0;
        }
        state.duplicateCount =
            normalizeDuplicateCount(state.duplicateCount) + 1;
        return state.duplicateCount;
    }

    public static setActive(
        save: LocalSave,
        npcId: string,
        active: boolean,
    ): boolean {
        this.ensure(save);
        const state = save.companions[npcId];
        if (!state?.recruited) {
            return false;
        }

        if (active && !state.active && this.active(save).length >= MAX_ACTIVE_COMPANIONS) {
            return false;
        }

        state.active = active;
        SaveManager.addFlag(save, `companion_${npcId}_active`, active);
        return true;
    }

    public static active(save: LocalSave): CompanionState[] {
        this.ensure(save);
        return Object.keys(save.companions)
            .map((npcId) => save.companions[npcId])
            .filter((state) => state.recruited && state.active);
    }

    public static recruited(save: LocalSave): CompanionState[] {
        this.ensure(save);
        return Object.keys(save.companions)
            .map((npcId) => save.companions[npcId])
            .filter((state) => state.recruited);
    }

    public static summary(save: LocalSave): CompanionSummary[] {
        this.ensure(save);
        return this.definitions()
            .map((definition) => {
                const state = save.companions[definition.npcId];
                const relationship = save.relationships[definition.npcId];
                if (relationship) {
                    state.supportLevel = normalizeSupportLevel(
                        relationship.level,
                    );
                }
                return {
                    definition,
                    state,
                    canRecruit: this.canRecruit(save, definition.npcId),
                    favor: Number(relationship?.favor ?? 0),
                    levelLabel: relationship?.levelLabel ?? '初识',
                };
            })
            .sort((a, b) => {
                if (a.state.recruited !== b.state.recruited) {
                    return a.state.recruited ? -1 : 1;
                }
                return a.definition.npcId.localeCompare(b.definition.npcId);
            });
    }

    public static claimFavorAd(
        save: LocalSave,
        npcId: string,
    ): CompanionFavorAdResult {
        const state = this.getState(save, npcId);
        const definition = this.getDefinition(npcId);
        if (!state?.recruited || !definition) {
            return {
                success: false,
                message: '先招募这名伙伴，再进行培养或赠礼结算。',
            };
        }
        const relationship = RelationshipSystem.addFavor(save, npcId, 5);
        if (!relationship) {
            return {
                success: false,
                message: '这名伙伴的关系数据还没准备好。',
            };
        }
        TelemetryService.record(save, 'companion.favor_ad_claimed', {
            npcId,
            amount: 5,
            favor: relationship.favor,
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'companion_favor_settlement',
            outcome: 'success',
            rewardGranted: true,
            npcId,
            amount: 5,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `${definition.name}好感度 +5，当前好感 ${relationship.favor}。`,
            favor: relationship.favor,
        };
    }
}
