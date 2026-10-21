import { LocalSave } from './StoryTypes';
import { InventorySystem } from './InventorySystem';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';
import type { BattleState } from './BattleSystem';
import {
    getNextCultivationCap,
    getNextRealm,
    getRealmDefinition,
    getRealmRank,
    getRealmStageLabel,
    getRealmStoryHook,
    REALM_DEFINITIONS,
    RealmStoryStatus,
} from './RealmProgression';

export interface CultivationResult {
    cultivationGained: number;
    spiritRecovered: number;
    canBreakthrough: boolean;
    atCap: boolean;
    newlyCapped: boolean;
}

export interface CultivationGoalCondition {
    id: string;
    label: string;
    complete: boolean;
}

export interface CultivationGoal {
    atCap: boolean;
    capKey: string;
    title: string;
    description: string;
    conditions: CultivationGoalCondition[];
    canStartTrial: boolean;
    canBreakthrough: boolean;
    storyStatus: RealmStoryStatus;
    storyHook: string;
}

export interface TrialSegment {
    phase: number;
    title: string;
    description: string;
    enemyId: string;
}

export interface TrialProgressResult {
    success: boolean;
    cleared: boolean;
    message: string;
    nextSegment: TrialSegment | null;
}

export interface TrialFailureAdResult {
    success: boolean;
    message: string;
    mode: 'refund' | 'preserve';
    refundedSpirit: number;
}

export const CONDENSATION_TRIAL_SPIRIT_COST = 8;

const CONDENSATION_TRIAL_SEGMENTS: readonly TrialSegment[] = [
    {
        phase: 1,
        title: '凝境试炼·观灯',
        description: '先辨明敌方蓄势。洞察后以攻击打断重击。',
        enemyId: 'condensation_watch_lamp',
    },
    {
        phase: 2,
        title: '凝境试炼·守痕',
        description: '面对破甲与重击，合理保留灵力施放护体。',
        enemyId: 'condensation_guard_trace',
    },
    {
        phase: 3,
        title: '凝境试炼·留名',
        description: '在结界、迷障与汲灵之间维持输出与回气节奏。',
        enemyId: 'condensation_leave_name',
    },
] as const;

export class ProgressionSystem {
    public static realmRank(save: LocalSave): number {
        return getRealmRank(save.cultivation.realmId, save.cultivation.stage);
    }

    public static realmDefinitions() {
        return REALM_DEFINITIONS;
    }

    public static nextRealm(save: LocalSave) {
        return getNextRealm(save.cultivation.realmId);
    }

    public static storyHook(save: LocalSave): string {
        return getRealmStoryHook(save.cultivation.realmId);
    }

    public static cultivate(save: LocalSave): CultivationResult {
        const progress = save.cultivation;
        if (this.isAtCap(save)) {
            this.ensureCapGoal(save);
            SaveManager.save(save);
            return {
                cultivationGained: 0,
                spiritRecovered: 0,
                canBreakthrough: this.canBreakthrough(save),
                atCap: true,
                newlyCapped: false,
            };
        }

        const rootRate = save.spiritual_root?.cultivation_rate ?? 1;
        const mindBonus = Math.max(0, progress.mind - 50) / 100;
        const gain = Math.max(8, Math.round(12 * rootRate * (1 + mindBonus)));
        const recovered = Math.max(6, Math.round(8 * rootRate));
        const beforeCultivation = progress.cultivation;

        progress.days += 1;
        progress.cultivation = Math.min(
            progress.cultivationCap,
            progress.cultivation + gain,
        );
        progress.spirit = Math.min(
            progress.spiritCap,
            progress.spirit + recovered,
        );
        save.flags.cultivation_days = progress.days;
        const newlyCapped = beforeCultivation < progress.cultivationCap &&
            progress.cultivation >= progress.cultivationCap;
        if (newlyCapped) {
            this.ensureCapGoal(save);
            TelemetryService.record(save, 'cultivation_cap_reached', {
                realm: progress.realmId,
                stage: progress.stage,
                cultivation: progress.cultivation,
                source: 'cultivate',
            });
        }
        TelemetryService.record(save, 'progression.cultivated', {
            gained: progress.cultivation - beforeCultivation,
            newlyCapped,
            stage: progress.stage,
        });
        SaveManager.save(save);

        return {
            cultivationGained: progress.cultivation - beforeCultivation,
            spiritRecovered: recovered,
            canBreakthrough: this.canBreakthrough(save),
            atCap: this.isAtCap(save),
            newlyCapped,
        };
    }

    public static getGoal(save: LocalSave): CultivationGoal {
        const progress = save.cultivation;
        const atCap = this.isAtCap(save);
        const capKey = this.capKey(save);
        const realm = getRealmDefinition(progress.realmId);
        const nextRealm = getNextRealm(progress.realmId);
        const storyHook = getRealmStoryHook(progress.realmId);
        const isFiveLayerGate =
            progress.realmId === 'qi_refining' && progress.stage === 5;
        if (!atCap) {
            return {
                atCap: false,
                capKey,
                title: '当前修炼目标',
                description: `修为达到 ${progress.cultivationCap} 后可尝试突破。`,
                conditions: [
                    {
                        id: 'cultivation_cap',
                        label: `修为 ${progress.cultivation}/${progress.cultivationCap}`,
                        complete: false,
                    },
                ],
                canStartTrial: false,
                canBreakthrough: false,
                storyStatus: realm.storyStatus,
                storyHook,
            };
        }

        if (!isFiveLayerGate) {
            const isFinalRealm =
                progress.stage >= realm.maxStage && !nextRealm;
            const nextTarget = nextRealm
                ? getRealmStageLabel(nextRealm.id, 1)
                : '';
            return {
                atCap: true,
                capKey,
                title: isFinalRealm ? `${realm.label}圆满` : '修为圆满',
                description: isFinalRealm
                    ? '当前境界系统已到达预览终点，飞升后的世界与终局剧情敬请期待。'
                    : `经脉已满，可直接尝试突破${nextTarget ? `至${nextTarget}` : ''}。` +
                        (nextRealm?.storyStatus === 'coming_soon'
                            ? ` ${nextRealm.storyHook}`
                            : ''),
                conditions: [
                    {
                        id: 'cultivation_cap',
                        label: `修为 ${progress.cultivationCap}/${progress.cultivationCap}`,
                        complete: true,
                    },
                ],
                canStartTrial: false,
                canBreakthrough: !isFinalRealm,
                storyStatus: realm.storyStatus,
                storyHook: isFinalRealm
                    ? (nextRealm?.storyHook ?? '飞升后的世界与终局剧情敬请期待。')
                    : (nextRealm?.storyHook ?? storyHook),
            };
        }

        const mainlineComplete = SaveManager.isChapterComplete(save, 'qi_05');
        const towerComplete = save.tower.bestFloor >= 8;
        const hasTrialClue = this.hasCondensationTrialClue(save);
        const trialCleared = save.cultivationGoal.trialState === 'cleared';
        const trialPhase = Math.max(0, Math.min(
            CONDENSATION_TRIAL_SEGMENTS.length,
            save.cultivationGoal.trialPhase,
        ));
        const canStartTrial =
            mainlineComplete &&
            towerComplete &&
            hasTrialClue &&
            !trialCleared;
        return {
            atCap: true,
            capKey,
            title: '炼气圆满考验',
            description:
                `五层圆满后需完成主线、无名塔试炼并战胜凝境试炼，` +
                `方可踏入炼气六层；每段试炼消耗 ${CONDENSATION_TRIAL_SPIRIT_COST} 点灵力。`,
            conditions: [
                {
                    id: 'cultivation_cap',
                    label: `修为 ${progress.cultivationCap}/${progress.cultivationCap}`,
                    complete: true,
                },
                {
                    id: 'qi05_mainline',
                    label: '完成第五章主线',
                    complete: mainlineComplete,
                },
                {
                    id: 'tower_floor_8',
                    label: '首次通关无名塔第 8 层',
                    complete: towerComplete,
                },
                {
                    id: 'condensation_trial_clue',
                    label: '取得凝境试炼线索（第 8 层首通）',
                    complete: hasTrialClue,
                },
                {
                    id: 'condensation_trial',
                    label: `通过凝境试炼（${trialCleared ? 3 : trialPhase}/3 段）`,
                    complete: trialCleared,
                },
            ],
            canStartTrial,
            canBreakthrough: trialCleared,
            storyStatus: realm.storyStatus,
            storyHook,
        };
    }

    public static initializeGoalState(save: LocalSave): CultivationGoal {
        if (!this.isAtCap(save)) {
            return this.getGoal(save);
        }
        const beforeKey = save.cultivationGoal.capKey;
        const beforeTrialState = save.cultivationGoal.trialState;
        const beforeTrialPhase = save.cultivationGoal.trialPhase;
        this.ensureCapGoal(save);
        if (
            beforeKey !== save.cultivationGoal.capKey ||
            beforeTrialState !== save.cultivationGoal.trialState ||
            beforeTrialPhase !== save.cultivationGoal.trialPhase
        ) {
            SaveManager.save(save);
        }
        return this.getGoal(save);
    }

    public static acknowledgeCapNotice(save: LocalSave): void {
        this.ensureCapGoal(save);
        const openedNow = !save.cultivationGoal.goalPanelSeen;
        save.cultivationGoal.capNoticeSeen = true;
        save.cultivationGoal.goalPanelSeen = true;
        if (openedNow) {
            TelemetryService.record(save, 'next_goal_opened', {
                capKey: save.cultivationGoal.capKey,
                stage: save.cultivation.stage,
                entry: 'cultivation_goal',
            });
        }
        SaveManager.save(save);
    }

    public static canStartTrial(save: LocalSave): boolean {
        return this.getGoal(save).canStartTrial;
    }

    public static currentTrialSegment(save: LocalSave): TrialSegment | null {
        if (!this.canStartTrial(save)) {
            return null;
        }
        const phase = Math.max(
            0,
            Math.min(
                CONDENSATION_TRIAL_SEGMENTS.length - 1,
                save.cultivationGoal.trialPhase,
            ),
        );
        return CONDENSATION_TRIAL_SEGMENTS[phase] ?? null;
    }

    public static trialStartUnavailableReason(save: LocalSave): string | null {
        const segment = this.currentTrialSegment(save);
        if (!segment) {
            return '凝境试炼还没满足条件。';
        }
        if (save.cultivation.spirit < CONDENSATION_TRIAL_SPIRIT_COST) {
            return `灵力不足，每段凝境试炼需要 ${CONDENSATION_TRIAL_SPIRIT_COST} 点灵力。`;
        }
        return null;
    }

    public static startCondensationTrial(save: LocalSave): TrialSegment | null {
        this.ensureCapGoal(save);
        const unavailable = this.trialStartUnavailableReason(save);
        if (unavailable) {
            return null;
        }
        const segment = this.currentTrialSegment(save);
        if (!segment) {
            return null;
        }
        save.cultivation.spirit -= CONDENSATION_TRIAL_SPIRIT_COST;
        save.cultivationGoal.trialStats.attempts += 1;
        TelemetryService.record(save, 'progression.condensation_trial_started', {
            phase: segment.phase,
            attempts: save.cultivationGoal.trialStats.attempts,
            spiritCost: CONDENSATION_TRIAL_SPIRIT_COST,
        });
        const equipped = save.equipment.filter((item) => item.equipped);
        TelemetryService.record(save, 'breakthrough_trial_started', {
            phase: segment.phase,
            attempts: save.cultivationGoal.trialStats.attempts,
            equippedCount: equipped.length,
            topRefine: equipped.reduce(
                (highest, item) => Math.max(highest, item.refineLevel),
                0,
            ),
            battlePower: this.battlePower(save),
        });
        SaveManager.save(save);
        return segment;
    }

    public static resolveCondensationTrial(
        save: LocalSave,
        victory: boolean,
        battle: BattleState | null,
    ): TrialProgressResult {
        const segment = this.currentTrialSegment(save);
        if (!segment) {
            return {
                success: false,
                cleared: save.cultivationGoal.trialState === 'cleared',
                message: '凝境试炼当前不可进入，请先检查突破条件。',
                nextSegment: null,
            };
        }

        if (!victory) {
            save.cultivationGoal.lastFailedTrialPhase = segment.phase;
            save.cultivationGoal.lastFailedTrialSpiritCost =
                CONDENSATION_TRIAL_SPIRIT_COST;
            save.cultivationGoal.trialPhase = 0;
            save.cultivationGoal.trialState = 'available';
            save.cultivationGoal.trialStats.failedAttempts += 1;
            save.cultivationGoal.trialStats.totalRounds += Math.max(
                0,
                (battle?.round ?? 1) - 1,
            );
            save.cultivationGoal.trialStats.totalDamageTaken +=
                battle?.metrics.damageTaken ?? 0;
            TelemetryService.record(save, 'progression.condensation_trial_failed', {
                phase: segment.phase,
                round: battle?.round ?? 0,
                damageTaken: battle?.metrics.damageTaken ?? 0,
            });
            SaveManager.save(save);
            return {
                success: false,
                cleared: false,
                message: `凝境试炼止步于「${segment.title.replace('凝境试炼·', '')}」，需从观灯重新开始。`,
                nextSegment: CONDENSATION_TRIAL_SEGMENTS[0],
            };
        }

        save.cultivationGoal.lastFailedTrialPhase = 0;
        save.cultivationGoal.lastFailedTrialSpiritCost = 0;
        const nextPhase = segment.phase;
        save.cultivationGoal.trialPhase = nextPhase;
        save.cultivationGoal.trialStats.clearedSegments = Math.max(
            save.cultivationGoal.trialStats.clearedSegments,
            segment.phase,
        );
        save.cultivationGoal.trialStats.totalRounds += Math.max(
            0,
            (battle?.round ?? 1) - 1,
        );
        save.cultivationGoal.trialStats.totalDamageTaken +=
            battle?.metrics.damageTaken ?? 0;
        if (nextPhase >= CONDENSATION_TRIAL_SEGMENTS.length) {
            save.cultivationGoal.trialState = 'cleared';
            SaveManager.addInventory(save, 'tempering_material', 3);
            save.flags.inner_court_preview = true;
            TelemetryService.record(save, 'progression.condensation_trial_cleared', {
                stage: save.cultivation.stage,
                rounds: battle?.round ?? 0,
                materialReward: 3,
            });
            SaveManager.save(save);
            return {
                success: true,
                cleared: true,
                message: '凝境试炼三段皆过，获得淬炼材料 ×3；内门门印已显现，可以尝试突破。',
                nextSegment: null,
            };
        }

        const nextSegment = CONDENSATION_TRIAL_SEGMENTS[nextPhase];
        TelemetryService.record(save, 'progression.condensation_trial_phase_cleared', {
            phase: segment.phase,
            rounds: battle?.round ?? 0,
        });
        SaveManager.save(save);
        return {
            success: true,
            cleared: false,
            message: `已通过第 ${segment.phase}/3 段，下一段「${nextSegment.title.replace('凝境试炼·', '')}」已开启。`,
            nextSegment,
        };
    }

    public static breakthroughFailureAdUnavailableReason(
        save: LocalSave,
    ): string | null {
        if (save.cultivationGoal.lastFailedTrialPhase <= 0) {
            return '当前没有可挽回的突破失败试炼。';
        }
        const adId = this.breakthroughFailureAdId(save);
        return SaveManager.hasClaimedAd(save, adId)
            ? '本次突破失败广告奖励已经领取。'
            : null;
    }

    public static claimBreakthroughFailureAd(
        save: LocalSave,
        mode: 'refund' | 'preserve',
    ): TrialFailureAdResult {
        const unavailable = this.breakthroughFailureAdUnavailableReason(save);
        if (unavailable) {
            return {
                success: false,
                message: unavailable,
                mode,
                refundedSpirit: 0,
            };
        }

        const failedPhase = save.cultivationGoal.lastFailedTrialPhase;
        const spiritCost = Math.max(
            0,
            save.cultivationGoal.lastFailedTrialSpiritCost,
        );
        const adId = this.breakthroughFailureAdId(save);
        let refundedSpirit = 0;
        if (mode === 'refund') {
            refundedSpirit = spiritCost;
            save.cultivation.spirit = Math.min(
                save.cultivation.spiritCap,
                save.cultivation.spirit + refundedSpirit,
            );
        } else {
            save.cultivationGoal.trialPhase = Math.max(0, failedPhase - 1);
            save.cultivationGoal.trialState = 'available';
            save.cultivationGoal.trialStats.clearedSegments = Math.max(
                0,
                Math.min(
                    3,
                    Math.max(
                        save.cultivationGoal.trialStats.clearedSegments,
                        failedPhase - 1,
                    ),
                ),
            );
        }

        SaveManager.claimAd(save, adId);
        TelemetryService.record(save, 'breakthrough.failure_ad_claimed', {
            mode,
            failedPhase,
            spiritCost,
            refundedSpirit,
        });
        TelemetryService.record(save, 'ad_result', {
            placement:
                mode === 'refund'
                    ? 'breakthrough_failure_refund'
                    : 'breakthrough_failure_preserve',
            outcome: 'success',
            rewardGranted: true,
            failedPhase,
            refundedSpirit,
        });
        save.cultivationGoal.lastFailedTrialPhase = 0;
        save.cultivationGoal.lastFailedTrialSpiritCost = 0;
        SaveManager.save(save);
        return {
            success: true,
            message:
                mode === 'refund'
                    ? `已返还本次试炼消耗灵力的 100%，灵力 +${refundedSpirit}。`
                    : `已保留第 ${Math.max(1, failedPhase - 1)}/3 段试炼进度，下次从第 ${failedPhase} 段继续。`,
            mode,
            refundedSpirit,
        };
    }

    private static breakthroughFailureAdId(save: LocalSave): string {
        return [
            'breakthrough_failure',
            save.cultivationGoal.capKey,
            save.cultivationGoal.trialStats.attempts,
        ].join(':');
    }

    public static canBreakthrough(save: LocalSave): boolean {
        return this.getGoal(save).canBreakthrough;
    }

    public static breakthrough(save: LocalSave): boolean {
        const progress = save.cultivation;
        if (!this.isAtCap(save) || !this.canBreakthrough(save)) {
            return false;
        }

        const realm = getRealmDefinition(progress.realmId);
        if (!realm) {
            return false;
        }

        const currentRealmId = progress.realmId;
        const currentStage = progress.stage;
        const nextRealm = currentStage < realm.maxStage
            ? realm
            : getNextRealm(currentRealmId);
        if (!nextRealm) {
            return false;
        }

        progress.cultivation = 0;
        if (progress.stage < realm.maxStage) {
            progress.stage += 1;
        } else {
            progress.realmId = nextRealm.id;
            progress.realmLabel = nextRealm.label;
            progress.stage = 1;
        }
        const crossedRealm = currentRealmId !== progress.realmId;
        const nextRank = getRealmRank(progress.realmId, progress.stage);
        progress.cultivationCap = getNextCultivationCap(
            progress.cultivationCap,
            nextRank,
            crossedRealm,
            progress.realmId,
        );
        progress.spiritCap += nextRealm.spiritCapGrowth;
        progress.spirit = progress.spiritCap;
        progress.body += nextRealm.bodyGrowth;
        progress.mind += nextRealm.mindGrowth;
        progress.insight += nextRealm.insightGrowth;
        progress.fate += nextRealm.fateGrowth;
        progress.realmLabel = getRealmDefinition(progress.realmId).label;
        save.cultivationGoal.capKey = '';
        save.cultivationGoal.capNoticeSeen = false;
        save.cultivationGoal.goalPanelSeen = false;
        save.cultivationGoal.trialState = 'locked';
        save.cultivationGoal.trialPhase = 0;
        save.cultivationGoal.trialStats = {
            attempts: 0,
            failedAttempts: 0,
            clearedSegments: 0,
            totalRounds: 0,
            totalDamageTaken: 0,
        };
        TelemetryService.record(save, 'progression.breakthrough', {
            stage: progress.stage,
            realm: progress.realmId,
            rank: getRealmRank(progress.realmId, progress.stage),
            crossedRealm,
        });
        SaveManager.save(save);
        return true;
    }

    public static battlePower(save: LocalSave): number {
        const equipment = InventorySystem.totalEquippedStats(save);
        const progress = save.cultivation;
        const affixPower = save.equipment
            .filter((item) => item.equipped)
            .reduce(
                (sum, item) =>
                    sum + item.affixes.reduce(
                        (affixSum, affix) =>
                            affixSum + affix.value + affix.tier,
                        0,
                    ),
                0,
            );
        return Math.round(
            getRealmRank(progress.realmId, progress.stage) * 14 +
            progress.body * 0.45 +
            progress.spiritCap * 0.2 +
            progress.insight * 0.3 +
            Number(equipment.attack ?? 0) * 1.6 +
            Number(equipment.defense ?? 0) +
            Number(equipment.health ?? 0) * 0.35 +
            progress.mind * 0.1 +
            Number(equipment.mind ?? 0) * 0.5 +
            affixPower,
        );
    }

    private static isAtCap(save: LocalSave): boolean {
        return save.cultivation.cultivation >= save.cultivation.cultivationCap;
    }

    private static capKey(save: LocalSave): string {
        const progress = save.cultivation;
        return `${progress.realmId}_${progress.stage}_${progress.cultivationCap}`;
    }

    private static ensureCapGoal(save: LocalSave): void {
        const key = this.capKey(save);
        if (save.cultivationGoal.capKey !== key) {
            save.cultivationGoal.capKey = key;
            save.cultivationGoal.capNoticeSeen = false;
            save.cultivationGoal.goalPanelSeen = false;
            save.cultivationGoal.trialState = 'locked';
            save.cultivationGoal.trialPhase = 0;
            save.cultivationGoal.trialStats = {
                attempts: 0,
                failedAttempts: 0,
                clearedSegments: 0,
                totalRounds: 0,
                totalDamageTaken: 0,
            };
        }
        if (this.canStartTrialRequirements(save)) {
            save.cultivationGoal.trialState =
                save.cultivationGoal.trialState === 'cleared'
                    ? 'cleared'
                    : 'available';
        }
    }

    private static canStartTrialRequirements(save: LocalSave): boolean {
        return save.cultivation.realmId === 'qi_refining' &&
            save.cultivation.stage === 5 &&
            this.isAtCap(save) &&
            SaveManager.isChapterComplete(save, 'qi_05') &&
            save.tower.bestFloor >= 8 &&
            this.hasCondensationTrialClue(save);
    }

    private static hasCondensationTrialClue(save: LocalSave): boolean {
        return Number(save.inventory.condensation_trial_clue ?? 0) > 0;
    }
}
