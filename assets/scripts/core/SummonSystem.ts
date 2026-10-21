import {
    CharacterGender,
    CharacterDefinition,
    LocalSave,
    SummonProgress,
} from './StoryTypes';
import { CharacterRegistry } from './CharacterRegistry';
import { CompanionSystem } from './CompanionSystem';
import { EconomySystem } from './EconomySystem';
import { RelationshipSystem } from './RelationshipSystem';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';

export const SUMMON_SINGLE_COST = 24;
export const SUMMON_TEN_COST = 216;
export const SUMMON_PITY_LIMIT = 30;
export const SUMMON_BEGINNER_GUARANTEE_DRAWS = 1;
export const SUMMON_MALE_RATE = 0.03;
export const SUMMON_FEMALE_RATE = 0.01;

const FRESH_PARTNER_WEIGHT = 7;
const OWNED_PARTNER_WEIGHT = 3;
const DUPLICATE_FAVOR = 1;

export interface SummonDrawResult {
    type: 'companion' | 'memory';
    npcId: string;
    name: string;
    isNew: boolean;
    duplicateCount: number;
    pityTriggered: boolean;
    beginnerGuarantee?: boolean;
}

export interface SummonResult {
    success: boolean;
    message: string;
    cost: number;
    results: SummonDrawResult[];
    balance: number;
    pityCount: number;
    poolCount: number;
    freshPoolCount: number;
    usedFreeTicket?: boolean;
}

export interface SummonPoolAdResult {
    success: boolean;
    message: string;
    unlockedNpcIds: string[];
}

export interface UpdateRewardResult {
    success: boolean;
    message: string;
}

function emptyProgress(): SummonProgress {
    return {
        totalDraws: 0,
        pityCount: 0,
        totalLingShiSpent: 0,
        freeTenDraws: 0,
        unlockedNpcIds: [],
        lastResultNpcId: '',
        lastResultWasDuplicate: false,
    };
}

function finiteFloor(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function getCharacterRate(pool: CharacterDefinition[]): number {
    const hasMale = pool.some((definition) => definition.gender === 'male');
    const hasFemale = pool.some(
        (definition) => definition.gender === 'female',
    );
    return Math.max(
        hasMale ? SUMMON_MALE_RATE : 0,
        hasFemale ? SUMMON_FEMALE_RATE : 0,
    );
}

function pickGender(pool: CharacterDefinition[]): CharacterGender | null {
    const hasMale = pool.some((definition) => definition.gender === 'male');
    const hasFemale = pool.some(
        (definition) => definition.gender === 'female',
    );
    const maleRate = hasMale ? SUMMON_MALE_RATE : 0;
    const femaleRate = hasFemale ? SUMMON_FEMALE_RATE : 0;
    const totalRate = maleRate + femaleRate;
    if (totalRate <= 0) {
        return null;
    }
    const roll = Math.random() * totalRate;
    return roll < maleRate ? 'male' : 'female';
}

function normalizeProgress(save: LocalSave): SummonProgress {
    const current = save.summon ?? emptyProgress();
    const progress: SummonProgress = {
        ...emptyProgress(),
        ...current,
        totalDraws: Math.max(0, finiteFloor(current.totalDraws)),
        pityCount: Math.max(
            0,
            Math.min(
                SUMMON_PITY_LIMIT,
                finiteFloor(current.pityCount),
            ),
        ),
        totalLingShiSpent: Math.max(
            0,
            finiteFloor(current.totalLingShiSpent),
        ),
        freeTenDraws: Math.max(
            0,
            Math.min(99, finiteFloor(current.freeTenDraws)),
        ),
        unlockedNpcIds: Array.from(
            new Set(
                (Array.isArray(current.unlockedNpcIds)
                    ? current.unlockedNpcIds
                    : []
                )
                    .map(String)
                    .filter(Boolean),
            ),
        ),
        lastResultNpcId:
            typeof current.lastResultNpcId === 'string'
                ? current.lastResultNpcId
                : '',
        lastResultWasDuplicate: current.lastResultWasDuplicate === true,
    };
    save.summon = progress;
    return progress;
}

export class SummonSystem {
    public static ensure(save: LocalSave): void {
        const progress = normalizeProgress(save);
        CompanionSystem.ensure(save);
        CharacterRegistry.companions().forEach((definition) => {
            const contentId =
                definition.summonUnlockContent ??
                `summon_${definition.npcId}`;
            const unlockedByContent = SaveManager.isUnlocked(
                save,
                contentId,
            );
            const unlockedByFlag =
                save.flags[`summon_${definition.npcId}_unlocked`] === true;
            if (
                (unlockedByContent || unlockedByFlag) &&
                progress.unlockedNpcIds.indexOf(definition.npcId) < 0
            ) {
                progress.unlockedNpcIds.push(definition.npcId);
            }
            if (unlockedByContent) {
                SaveManager.addFlag(
                    save,
                    `summon_${definition.npcId}_unlocked`,
                    true,
                );
            }
        });
        CompanionSystem.recruited(save).forEach((state) => {
            if (progress.unlockedNpcIds.indexOf(state.npcId) < 0) {
                progress.unlockedNpcIds.push(state.npcId);
            }
        });
    }

    public static unlock(save: LocalSave, npcId: string): boolean {
        const definition = CharacterRegistry.get(npcId);
        if (!definition?.recruitable) {
            return false;
        }

        this.ensure(save);
        const progress = save.summon;
        const contentId =
            definition.summonUnlockContent ?? `summon_${definition.npcId}`;
        if (!SaveManager.isUnlocked(save, contentId)) {
            save.unlockedContent.push(contentId);
        }
        if (progress.unlockedNpcIds.indexOf(npcId) < 0) {
            progress.unlockedNpcIds.push(npcId);
        }
        SaveManager.addFlag(save, `summon_${npcId}_unlocked`, true);
        TelemetryService.record(save, 'summon_pool_unlocked', {
            npcId,
            contentId,
        });
        return true;
    }

    public static isUnlocked(save: LocalSave, npcId: string): boolean {
        const definition = CharacterRegistry.get(npcId);
        if (!definition?.recruitable) {
            return false;
        }
        this.ensure(save);
        const contentId =
            definition.summonUnlockContent ?? `summon_${definition.npcId}`;
        const unlocked =
            SaveManager.isUnlocked(save, contentId) ||
            save.summon.unlockedNpcIds.indexOf(npcId) >= 0 ||
            save.flags[`summon_${npcId}_unlocked`] === true;
        if (!unlocked) {
            return false;
        }
        return !(definition.forbiddenFlags ?? []).some(
            (flag) => save.flags[flag] === true,
        );
    }

    public static pool(save: LocalSave): CharacterDefinition[] {
        this.ensure(save);
        return CharacterRegistry.companions().filter((definition) =>
            this.isUnlocked(save, definition.npcId),
        );
    }

    public static currentPoolUnlockAdUnavailableReason(
        save: LocalSave,
    ): string | null {
        const missing = this.currentEligibleDefinitions(save).filter(
            (definition) => !this.isUnlocked(save, definition.npcId),
        );
        if (!missing.length) {
            return '当前剧情前置已满足的卡池都已解锁。';
        }
        if (SaveManager.hasClaimedAd(save, 'summon_current_pools_ad_v1')) {
            return '当前版本卡池解锁广告已领取。';
        }
        return null;
    }

    public static claimCurrentPoolUnlockAd(
        save: LocalSave,
    ): SummonPoolAdResult {
        const unavailable = this.currentPoolUnlockAdUnavailableReason(save);
        if (unavailable) {
            return {
                success: false,
                message: unavailable,
                unlockedNpcIds: [],
            };
        }

        const unlockedNpcIds = this.currentEligibleDefinitions(save)
            .filter((definition) => !this.isUnlocked(save, definition.npcId))
            .map((definition) => definition.npcId);
        unlockedNpcIds.forEach((npcId) => this.unlock(save, npcId));
        SaveManager.claimAd(save, 'summon_current_pools_ad_v1');
        TelemetryService.record(save, 'summon_pools_ad_unlocked', {
            count: unlockedNpcIds.length,
            npcIds: unlockedNpcIds.join(','),
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'summon_current_pools_unlock',
            outcome: 'success',
            rewardGranted: true,
            count: unlockedNpcIds.length,
        });
        SaveManager.save(save);
        const names = unlockedNpcIds
            .map((npcId) => CharacterRegistry.get(npcId)?.name ?? npcId)
            .join('、');
        return {
            success: true,
            message: `当前卡池已全部解锁：${names || '暂无新增卡池'}。`,
            unlockedNpcIds,
        };
    }

    public static updateRewardUnavailableReason(save: LocalSave): string | null {
        return SaveManager.hasClaimedAd(save, 'update_reward_2026-10-09-v3')
            ? '更新奖励已经领取。'
            : null;
    }

    public static claimUpdateReward(save: LocalSave): UpdateRewardResult {
        const unavailable = this.updateRewardUnavailableReason(save);
        if (unavailable) {
            return { success: false, message: unavailable };
        }
        save.summon.freeTenDraws += 1;
        SaveManager.claimAd(save, 'update_reward_2026-10-09-v3');
        TelemetryService.record(save, 'update_reward_claimed', {
            reward: 'free_ten_draw',
            count: 1,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: '更新奖励已到账：免费十连抽 ×1，可在招募页使用。',
        };
    }

    public static draw(
        save: LocalSave,
        count: 1 | 10 = 1,
        useFreeTicket = false,
    ): SummonResult {
        this.ensure(save);
        const normalizedCount = count === 10 ? 10 : 1;
        const standardCost =
            normalizedCount === 10
                ? SUMMON_TEN_COST
                : SUMMON_SINGLE_COST;
        const usedFreeTicket =
            normalizedCount === 10 && useFreeTicket && save.summon.freeTenDraws > 0;
        const cost = usedFreeTicket ? 0 : standardCost;
        const pool = this.pool(save);
        if (!pool.length) {
            return this.failure(
                save,
                '暂无开放的伙伴招募池。先推进主线，取得新的潮契资格。',
                cost,
            );
        }
        if (!EconomySystem.spendLingShi(save, cost, 'companion_summon')) {
            return this.failure(
                save,
                `灵石不足，需要 ${cost} 灵石。`,
                cost,
            );
        }
        if (usedFreeTicket) {
            save.summon.freeTenDraws -= 1;
        }

        const results: SummonDrawResult[] = [];
        let pityTriggeredCount = 0;
        let beginnerGuaranteeCount = 0;
        for (let index = 0; index < normalizedCount; index += 1) {
            const currentPool = this.pool(save);
            const freshPool = currentPool.filter((definition) => {
                const state = CompanionSystem.getState(save, definition.npcId);
                return !state?.recruited;
            });
            const beginnerGuarantee =
                freshPool.length > 0 &&
                save.summon.totalDraws < SUMMON_BEGINNER_GUARANTEE_DRAWS;
            const pityTriggered =
                !beginnerGuarantee &&
                freshPool.length > 0 &&
                save.summon.pityCount >= SUMMON_PITY_LIMIT - 1;
            const characterContract =
                beginnerGuarantee ||
                pityTriggered ||
                Math.random() < getCharacterRate(currentPool);
            if (!characterContract) {
                save.summon.pityCount = Math.min(
                    SUMMON_PITY_LIMIT - 1,
                    Math.max(0, save.summon.pityCount) + 1,
                );
                save.summon.totalDraws += 1;
                save.summon.lastResultNpcId = '';
                save.summon.lastResultWasDuplicate = false;
                results.push({
                    type: 'memory',
                    npcId: '',
                    name: '同契记忆',
                    isNew: false,
                    duplicateCount: 0,
                    pityTriggered: false,
                });
                continue;
            }
            const gender = beginnerGuarantee || pityTriggered
                ? null
                : pickGender(currentPool);
            const genderPool = gender
                ? currentPool.filter(
                      (definition) => definition.gender === gender,
                  )
                : currentPool;
            const definition = beginnerGuarantee
                ? freshPool[Math.floor(Math.random() * freshPool.length)]
                : pityTriggered
                    ? freshPool[Math.floor(Math.random() * freshPool.length)]
                    : this.pickWeighted(save, genderPool);

            if (!definition) {
                continue;
            }

            const state = CompanionSystem.getState(save, definition.npcId);
            const isNew = !state?.recruited;
            let duplicateCount = state?.duplicateCount ?? 0;
            if (isNew) {
                CompanionSystem.recruit(
                    save,
                    definition.npcId,
                    'summon_draw',
                );
                save.summon.pityCount = 0;
            } else {
                duplicateCount = CompanionSystem.registerDuplicate(
                    save,
                    definition.npcId,
                );
                RelationshipSystem.addFavor(
                    save,
                    definition.npcId,
                    DUPLICATE_FAVOR,
                );
                save.summon.pityCount =
                    freshPool.length > 0
                        ? Math.min(
                              SUMMON_PITY_LIMIT,
                              save.summon.pityCount + 1,
                          )
                        : 0;
            }
            if (pityTriggered) {
                pityTriggeredCount += 1;
            }
            if (beginnerGuarantee) {
                beginnerGuaranteeCount += 1;
            }
            save.summon.totalDraws += 1;
            save.summon.lastResultNpcId = definition.npcId;
            save.summon.lastResultWasDuplicate = !isNew;
            results.push({
                type: 'companion',
                npcId: definition.npcId,
                name: definition.name,
                isNew,
                duplicateCount,
                pityTriggered,
                beginnerGuarantee,
            });
        }

        save.summon.totalLingShiSpent += cost;
        const freshPoolCount = this.pool(save).filter((definition) => {
            const state = CompanionSystem.getState(save, definition.npcId);
            return !state?.recruited;
        }).length;
        TelemetryService.record(save, 'summon_draw', {
            count: normalizedCount,
            cost,
            resultCount: results.length,
            newCount: results.filter((result) => result.isNew).length,
            duplicateCount: results.filter((result) => !result.isNew).length,
            pityTriggeredCount,
            beginnerGuaranteeCount,
        });
        SaveManager.save(save);

        const names = results
            .map((result) =>
                result.type === 'memory'
                    ? '同契记忆'
                    : result.isNew
                    ? `新伙伴「${result.name}」`
                    : `重复契印「${result.name}」·好感+${DUPLICATE_FAVOR}`,
            )
            .join('；');
        const pityText = pityTriggeredCount
            ? `触发保底 ${pityTriggeredCount} 次`
            : `保底进度 ${save.summon.pityCount}/${SUMMON_PITY_LIMIT}`;
        const beginnerText = beginnerGuaranteeCount
            ? `新手招募已优先回应 ${beginnerGuaranteeCount} 次`
            : '';
        return {
            success: true,
            message:
                `${usedFreeTicket ? '免费十连使用成功。' : ''}` +
                `引契完成：${names || '潮纹没有回应'}。` +
                `${beginnerText ? `${beginnerText}；` : ''}${pityText}`,
            cost,
            results,
            balance: EconomySystem.getLingShi(save),
            pityCount: save.summon.pityCount,
            poolCount: this.pool(save).length,
            freshPoolCount,
            usedFreeTicket,
        };
    }

    private static pickWeighted(
        save: LocalSave,
        pool: CharacterDefinition[],
    ): CharacterDefinition | null {
        if (!pool.length) {
            return null;
        }
        const weighted = pool.map((definition) => {
            const state = CompanionSystem.getState(save, definition.npcId);
            return {
                definition,
                weight: state?.recruited
                    ? OWNED_PARTNER_WEIGHT
                    : FRESH_PARTNER_WEIGHT,
            };
        });
        const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = Math.random() * total;
        for (const entry of weighted) {
            roll -= entry.weight;
            if (roll <= 0) {
                return entry.definition;
            }
        }
        return weighted[weighted.length - 1].definition;
    }

    private static currentEligibleDefinitions(
        save: LocalSave,
    ): CharacterDefinition[] {
        this.ensure(save);
        return CharacterRegistry.companions().filter((definition) => {
            const requiredFlags = definition.requiredFlags ?? [];
            const requiredFlagsReady = requiredFlags.every(
                (flag) => save.flags[flag] === true,
            );
            const favorReady =
                save.relationships[definition.npcId]?.favor >=
                (definition.minFavor ?? 0);
            const forbidden = (definition.forbiddenFlags ?? []).some(
                (flag) => save.flags[flag] === true,
            );
            return (
                definition.recruitable &&
                requiredFlagsReady &&
                favorReady &&
                !forbidden
            );
        });
    }

    private static failure(
        save: LocalSave,
        message: string,
        cost: number,
    ): SummonResult {
        SaveManager.save(save);
        return {
            success: false,
            message,
            cost,
            results: [],
            balance: EconomySystem.getLingShi(save),
            pityCount: save.summon.pityCount,
            poolCount: this.pool(save).length,
            freshPoolCount: this.pool(save).filter((definition) => {
                const state = CompanionSystem.getState(save, definition.npcId);
                return !state?.recruited;
            }).length,
            usedFreeTicket: false,
        };
    }
}
