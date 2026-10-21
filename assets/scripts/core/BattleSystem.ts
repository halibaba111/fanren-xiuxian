import { BATTLE_RULES, ENEMY_PROFILES, EnemyProfile } from './GameConfig';
import { CompanionSystem } from './CompanionSystem';
import { getRealmRank } from './RealmProgression';
import { InventorySystem } from './InventorySystem';
import { LocalSave } from './StoryTypes';
import { TelemetryService } from './TelemetryService';

export type EnemyIntent =
    | 'attack'
    | 'charge'
    | 'armor_break'
    | 'mana_drain'
    | 'obscure'
    | 'barrier';

export type BattleAction = 'attack' | 'insight' | 'guard' | 'recover';

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

export interface BattleMetrics {
    actionCounts: Record<BattleAction, number>;
    damageTaken: number;
    shieldAbsorbed: number;
    chargeDamageTaken: number;
    manaDrained: number;
    obscureApplied: number;
    obscureResisted: number;
}

export interface BattleActionRecord {
    round: number;
    action: BattleAction;
    enemyIntent: EnemyIntent;
    playerDamage: number;
    enemyDamage: number;
    playerHpAfter: number;
    playerManaAfter: number;
    enemyHpAfter: number;
    outcome: BattleOutcome;
}

export interface BattleState {
    profileId: string;
    tutorialBattle: boolean;
    enemyName: string;
    round: number;
    outcome: BattleOutcome;
    playerHp: number;
    playerMaxHp: number;
    playerMana: number;
    playerMaxMana: number;
    playerInsight: number;
    temporaryInsight: number;
    playerMind: number;
    playerAttack: number;
    playerDefense: number;
    playerRecovery: number;
    playerShield: number;
    shieldTurns: number;
    guardCooldown: number;
    weakPointReady: boolean;
    obscuredTurns: number;
    enemyHp: number;
    enemyMaxHp: number;
    enemyAttack: number;
    activeCompanionCount: number;
    enemyHpMultiplier: number;
    enemyAttackMultiplier: number;
    enemyBarrier: number;
    enemyIntentIndex: number;
    enemyIntents: EnemyIntent[];
    log: string[];
    actionHistory: BattleActionRecord[];
    metrics: BattleMetrics;
}

export interface BattleActionResult {
    accepted: boolean;
    message: string;
    playerDamage: number;
    enemyDamage: number;
    outcome: BattleOutcome;
}

function cloneProfile(profile: EnemyProfile): EnemyProfile {
    return {
        ...profile,
        intents: [...profile.intents],
    };
}

function fallbackProfileId(profileId: string): string {
    if (profileId.indexOf('qi06') >= 0) {
        return 'tower_record_court';
    }
    if (profileId.indexOf('qi05') >= 0) {
        return 'stage_qi05_black_root';
    }
    if (profileId.indexOf('qi04') >= 0) {
        return 'stage_qi04_record_warden';
    }
    if (profileId.indexOf('qi03') >= 0) {
        return 'stage_qi03_memory_shell';
    }
    if (profileId.indexOf('qi02') >= 0) {
        return 'stage_qi02_01_nameless_guard';
    }
    return 'stage_qi01_01_wooden_puppet';
}

function enemyProfile(profileId: string): EnemyProfile {
    return cloneProfile(
        ENEMY_PROFILES[profileId] ??
            ENEMY_PROFILES[fallbackProfileId(profileId)],
    );
}

function capLog(lines: string[], text: string): string[] {
    return [...lines, text].slice(-30);
}

interface PartyDifficultyAdjustment {
    hpMultiplier: number;
    attackMultiplier: number;
}

const PARTY_DIFFICULTY_ADJUSTMENTS: readonly PartyDifficultyAdjustment[] = [
    { hpMultiplier: 1, attackMultiplier: 1 },
    { hpMultiplier: 1.2, attackMultiplier: 1.1 },
    { hpMultiplier: 1.4, attackMultiplier: 1.2 },
    { hpMultiplier: 1.6, attackMultiplier: 1.3 },
];

function partyDifficultyAdjustment(
    activeCompanionCount: number,
): PartyDifficultyAdjustment {
    const count = Math.max(
        0,
        Math.min(3, Math.floor(Number(activeCompanionCount) || 0)),
    );
    return PARTY_DIFFICULTY_ADJUSTMENTS[count];
}

function createMetrics(): BattleMetrics {
    return {
        actionCounts: {
            attack: 0,
            insight: 0,
            guard: 0,
            recover: 0,
        },
        damageTaken: 0,
        shieldAbsorbed: 0,
        chargeDamageTaken: 0,
        manaDrained: 0,
        obscureApplied: 0,
        obscureResisted: 0,
    };
}

export class BattleSystem {
    public static create(
        save: LocalSave,
        profileId: string,
        temporaryInsight = 0,
    ): BattleState {
        const profile = enemyProfile(profileId);
        const tutorialBattle = profileId.indexOf('qi01_01') >= 0;
        const activeCompanionCount = CompanionSystem.active(save).length;
        const difficulty = partyDifficultyAdjustment(activeCompanionCount);
        const enemyMaxHp = Math.max(
            1,
            Math.ceil(profile.maxHp * difficulty.hpMultiplier),
        );
        const enemyAttack = Math.max(
            1,
            Math.ceil(profile.attack * difficulty.attackMultiplier),
        );
        const equipment = InventorySystem.totalEquippedStats(save);
        const cultivation = save.cultivation;
        const gardenInsight = Math.max(0, Math.floor(temporaryInsight));
        const playerInsight =
            cultivation.insight + Number(equipment.insight ?? 0) + gardenInsight;
        const playerMind =
            cultivation.mind + Number(equipment.mind ?? 0);
        const playerMaxHp = Math.floor(
            BATTLE_RULES.playerHpBase +
                cultivation.body * BATTLE_RULES.playerHpBodyFactor +
                Number(equipment.health ?? 0),
        );
        const playerAttack = Math.max(
            10,
            Math.floor(
                BATTLE_RULES.playerAttackBase +
                    getRealmRank(cultivation.realmId, cultivation.stage) *
                        BATTLE_RULES.playerAttackStageFactor +
                    Number(equipment.attack ?? 0),
            ),
        );
        const playerDefense = Math.max(
            0,
            Math.floor(
                cultivation.body * BATTLE_RULES.playerDefenseBodyFactor +
                    Number(equipment.defense ?? 0),
            ),
        );
        const playerMaxMana = Math.max(
            BATTLE_RULES.playerManaBase,
            Math.floor(
                BATTLE_RULES.playerManaBase +
                    Math.floor(
                        playerInsight /
                            BATTLE_RULES.playerManaInsightFactor,
                    ) +
                    Number(equipment.mana ?? 0),
            ),
        );
        const playerRecovery = Math.max(
            BATTLE_RULES.playerRecoveryBase,
            Math.floor(
                BATTLE_RULES.playerRecoveryBase +
                    Math.floor(
                        playerInsight /
                            BATTLE_RULES.playerRecoveryInsightFactor,
                    ) +
                    Number(equipment.spirit ?? 0),
            ),
        );
        return {
            profileId,
            tutorialBattle,
            enemyName: profile.name,
            round: 1,
            outcome: 'ongoing',
            playerHp: playerMaxHp,
            playerMaxHp,
            playerMana: playerMaxMana,
            playerMaxMana,
            playerInsight,
            temporaryInsight: gardenInsight,
            playerMind,
            playerAttack,
            playerDefense,
            playerRecovery,
            playerShield: 0,
            shieldTurns: 0,
            guardCooldown: 0,
            weakPointReady: false,
            obscuredTurns: 0,
            enemyHp: enemyMaxHp,
            enemyMaxHp,
            enemyAttack,
            activeCompanionCount,
            enemyHpMultiplier: difficulty.hpMultiplier,
            enemyAttackMultiplier: difficulty.attackMultiplier,
            enemyBarrier: 0,
            enemyIntentIndex: 0,
            enemyIntents: [...profile.intents],
            log: [
                `${profile.name}现身，正在蓄势。`,
                ...(tutorialBattle
                    ? [
                          '这是练习战：先看敌方意图；蓄势时可护体，结界时先洞察，灵力少了用回气。前三回合伤害会减轻。',
                      ]
                    : []),
                ...(activeCompanionCount > 0
                    ? [
                          `队伍中有 ${activeCompanionCount} 名伙伴，敌方已适配强度：气血 ×${difficulty.hpMultiplier.toFixed(1)}，攻击 ×${difficulty.attackMultiplier.toFixed(1)}。`,
                      ]
                    : []),
                ...(gardenInsight > 0
                    ? [`药圃余香流转，洞察临时 +${gardenInsight}。`]
                    : []),
            ],
            actionHistory: [],
            metrics: createMetrics(),
        };
    }

    public static currentIntent(state: BattleState): EnemyIntent {
        return state.enemyIntents[
            state.enemyIntentIndex % state.enemyIntents.length
        ] ?? 'attack';
    }

    public static intentLabel(intent: EnemyIntent): string {
        switch (intent) {
            case 'charge':
                return '蓄势重击';
            case 'armor_break':
                return '破甲';
            case 'mana_drain':
                return '汲灵';
            case 'obscure':
                return '迷障';
            case 'barrier':
                return '结界';
            default:
                return '普通攻势';
        }
    }

    public static act(
        state: BattleState,
        action: BattleAction,
    ): BattleActionResult {
        if (state.outcome !== 'ongoing') {
            return this.reject(state, '本场战斗已结束。');
        }

        let playerDamage = 0;
        let skipEnemyTurn = false;
        const intent = this.currentIntent(state);
        const actionRound = state.round;

        if (action === 'attack') {
            state.metrics.actionCounts.attack += 1;
            const bonus = state.weakPointReady
                ? state.obscuredTurns > 0
                    ? 0.25
                    : BATTLE_RULES.insightAttackBonus
                : 0;
            playerDamage = Math.max(
                1,
                Math.round(state.playerAttack * (1 + bonus)),
            );
            playerDamage = this.damageEnemy(state, playerDamage);
            if (state.weakPointReady) {
                state.weakPointReady = false;
                state.log = capLog(
                    state.log,
                    `破势命中，造成 ${playerDamage} 点伤害。`,
                );
            } else {
                state.log = capLog(
                    state.log,
                    `普通攻击造成 ${playerDamage} 点伤害。`,
                );
            }
            if (
                intent === 'charge' &&
                playerDamage >= Math.ceil(state.enemyMaxHp * 0.14) &&
                state.outcome === 'ongoing'
            ) {
                skipEnemyTurn = true;
                state.enemyIntentIndex += 1;
                state.log = capLog(state.log, '打断蓄势，敌方重击被迫中止。');
            }
            state.obscuredTurns = Math.max(0, state.obscuredTurns - 1);
        } else if (action === 'insight') {
            if (state.playerMana < BATTLE_RULES.insightCost) {
                return this.reject(
                    state,
                    `灵力不足，洞察需要 ${BATTLE_RULES.insightCost} 点灵力。`,
                );
            }
            state.metrics.actionCounts.insight += 1;
            state.playerMana -= BATTLE_RULES.insightCost;
            if (state.obscuredTurns > 0) {
                state.obscuredTurns = 0;
                state.weakPointReady = false;
                state.log = capLog(state.log, '洞察驱散迷障，下一回合可重新寻找破绽。');
            } else {
                state.weakPointReady = true;
                state.log = capLog(
                    state.log,
                    `洞察敌方${this.intentLabel(intent)}，下一次攻击可破势。`,
                );
            }
        } else if (action === 'guard') {
            if (state.guardCooldown > 0) {
                return this.reject(
                    state,
                    `护体术冷却中，还需 ${state.guardCooldown} 回合。`,
                );
            }
            if (state.playerMana < BATTLE_RULES.guardCost) {
                return this.reject(
                    state,
                    `灵力不足，护体需要 ${BATTLE_RULES.guardCost} 点灵力。`,
                );
            }
            state.metrics.actionCounts.guard += 1;
            state.playerMana -= BATTLE_RULES.guardCost;
            state.playerShield = Math.max(
                state.playerShield,
                Math.floor(
                    BATTLE_RULES.guardShieldBase +
                        Math.floor(
                            state.playerDefense *
                                BATTLE_RULES.guardShieldDefenseFactor,
                        ) +
                        Math.floor(
                            state.playerInsight *
                                BATTLE_RULES.guardShieldInsightFactor,
                        ),
                ),
            );
            state.shieldTurns = BATTLE_RULES.guardShieldDuration;
            state.guardCooldown = BATTLE_RULES.guardCooldown + 1;
            state.log = capLog(
                state.log,
                `护体术展开，获得 ${state.playerShield} 点护盾，最多持续 ${state.shieldTurns} 次敌方行动。`,
            );
        } else {
            state.metrics.actionCounts.recover += 1;
            const recovered = Math.min(
                state.playerMaxMana - state.playerMana,
                state.playerRecovery,
            );
            state.playerMana += recovered;
            state.log = capLog(state.log, `运转回气，灵力恢复 ${recovered}。`);
        }

        if (state.enemyHp <= 0) {
            state.outcome = 'victory';
            state.log = capLog(state.log, `${state.enemyName}溃散。`);
            const result = {
                accepted: true,
                message: '战斗胜利。',
                playerDamage,
                enemyDamage: 0,
                outcome: state.outcome,
            };
            this.recordAction(
                state,
                actionRound,
                action,
                intent,
                result.playerDamage,
                result.enemyDamage,
            );
            return result;
        }

        if (skipEnemyTurn) {
            state.round += 1;
            if (this.advanceTurnState(state)) {
                state.log = capLog(state.log, '护体术散去。');
            }
        }
        const enemyDamage = skipEnemyTurn ? 0 : this.enemyTurn(state);
        const result = {
            accepted: true,
            message: state.playerHp <= 0 ? '战斗失败。' : '行动完成。',
            playerDamage,
            enemyDamage,
            outcome: state.outcome,
        };
        this.recordAction(
            state,
            actionRound,
            action,
            intent,
            result.playerDamage,
            result.enemyDamage,
        );
        return result;
    }

    public static replayLines(state: BattleState): string[] {
        if (!state.actionHistory.length) {
            return ['本场战斗尚未执行行动。'];
        }
        return state.actionHistory.map((record) => {
            const playerText = record.playerDamage > 0
                ? `造成 ${record.playerDamage} 伤害`
                : '未直接造成伤害';
            const enemyText = record.enemyDamage > 0
                ? `承受 ${record.enemyDamage} 伤害`
                : '未承受直接伤害';
            return `第 ${record.round} 回合 · ${this.actionLabel(record.action)} · 敌方${this.intentLabel(record.enemyIntent)} · ${playerText} · ${enemyText} · 敌气血 ${record.enemyHpAfter} / ${state.enemyMaxHp}`;
        });
    }

    public static failureTags(state: BattleState): string[] {
        if (state.outcome !== 'defeat') {
            return [];
        }
        const tags: string[] = [];
        if (state.metrics.chargeDamageTaken >= Math.max(10, state.playerMaxHp * 0.12)) {
            tags.push('charge_unanswered');
        }
        if (state.metrics.actionCounts.guard === 0) {
            tags.push('guard_unused');
        }
        if (state.metrics.manaDrained >= BATTLE_RULES.insightCost) {
            tags.push('mana_starved');
        }
        if (state.metrics.obscureApplied > state.metrics.obscureResisted) {
            tags.push('obscured');
        }
        if (state.metrics.actionCounts.attack <= 2) {
            tags.push('low_output');
        }
        return tags.length ? tags : ['attrition'];
    }

    public static failureAdvice(state: BattleState): string[] {
        const advice: string[] = [];
        if (
            state.metrics.chargeDamageTaken >=
            Math.max(10, Math.round(state.playerMaxHp * 0.12))
        ) {
            advice.push('敌方蓄势时可以先护体；灵力足时也可洞察后攻击，打断这次重击。');
        }
        if (
            state.metrics.actionCounts.guard === 0 &&
            state.enemyIntents.some(
                (intent) => intent === 'charge' || intent === 'armor_break',
            )
        ) {
            advice.push('防御偏低，面对破甲或重击时应预留灵力施放护体。');
        }
        if (
            state.metrics.actionCounts.attack <= 2 &&
            state.round >= 4
        ) {
            advice.push('本次有效输出偏少，洞察后应尽快衔接攻击，不要连续空耗回合。');
        }
        if (
            state.metrics.manaDrained >= BATTLE_RULES.insightCost ||
            state.metrics.actionCounts.recover >= 2
        ) {
            advice.push('灵力偏少，可装备法器或戒指并使用回气散后再挑战。');
        }
        if (
            state.metrics.obscureApplied > state.metrics.obscureResisted
        ) {
            advice.push('迷障会打断洞察节奏，可提升心境或重淬出定心词条后再战。');
        }
        if (!advice.length) {
            advice.push('观察下一回合意图，在结界和迷障阶段留出回气回合。');
        }
        return advice.slice(0, 2);
    }

    public static recordResult(save: LocalSave, state: BattleState): void {
        TelemetryService.record(save, 'battle_result', {
            profileId: state.profileId,
            outcome: state.outcome,
            rounds: Math.max(0, state.round - 1),
            actionCount: state.actionHistory.length,
            actionSequence: state.actionHistory
                .map((record) => record.action)
                .join(',') || 'none',
            failureTags: this.failureTags(state).join(',') || 'none',
            temporaryInsight: state.temporaryInsight,
            damageTaken: state.metrics.damageTaken,
            playerMaxHp: state.playerMaxHp,
            playerHpEnd: state.playerHp,
            playerMaxMana: state.playerMaxMana,
            playerManaEnd: state.playerMana,
            playerAttack: state.playerAttack,
            playerDefense: state.playerDefense,
            playerInsight: state.playerInsight,
            playerMind: state.playerMind,
            playerRecovery: state.playerRecovery,
            enemyMaxHp: state.enemyMaxHp,
            enemyAttack: state.enemyAttack,
            activeCompanionCount: state.activeCompanionCount,
            enemyHpMultiplier: state.enemyHpMultiplier,
            enemyAttackMultiplier: state.enemyAttackMultiplier,
            shieldAbsorbed: state.metrics.shieldAbsorbed,
            manaDrained: state.metrics.manaDrained,
            obscureResisted: state.metrics.obscureResisted,
        });
    }

    private static actionLabel(action: BattleAction): string {
        switch (action) {
            case 'insight':
                return '洞察';
            case 'guard':
                return '护体';
            case 'recover':
                return '回气';
            default:
                return '攻伐';
        }
    }

    private static recordAction(
        state: BattleState,
        round: number,
        action: BattleAction,
        enemyIntent: EnemyIntent,
        playerDamage: number,
        enemyDamage: number,
    ): void {
        state.actionHistory = [
            ...state.actionHistory,
            {
                round,
                action,
                enemyIntent,
                playerDamage,
                enemyDamage,
                playerHpAfter: state.playerHp,
                playerManaAfter: state.playerMana,
                enemyHpAfter: state.enemyHp,
                outcome: state.outcome,
            },
        ].slice(-30);
    }

    private static reject(state: BattleState, message: string): BattleActionResult {
        return {
            accepted: false,
            message,
            playerDamage: 0,
            enemyDamage: 0,
            outcome: state.outcome,
        };
    }

    private static damageEnemy(state: BattleState, rawDamage: number): number {
        let damage = rawDamage;
        if (state.enemyBarrier > 0) {
            const absorbed = Math.min(state.enemyBarrier, damage);
            state.enemyBarrier -= absorbed;
            damage -= absorbed;
            if (absorbed > 0) {
                state.log = capLog(state.log, `敌方结界吸收 ${absorbed} 点伤害。`);
            }
        }
        state.enemyHp = Math.max(0, state.enemyHp - damage);
        return damage;
    }

    private static enemyTurn(state: BattleState): number {
        const intent = this.currentIntent(state);
        let rawDamage = state.enemyAttack;
        let defense = state.playerDefense;
        let note = '';
        const fatigue = this.fatigueMultiplier(state.round);

        if (intent === 'charge') {
            rawDamage = Math.round(rawDamage * 1.7);
            note = '蓄势重击';
        } else if (intent === 'armor_break') {
            rawDamage = Math.round(rawDamage * 1.05);
            defense = Math.round(defense * 0.5);
            note = '破甲';
        } else if (intent === 'mana_drain') {
            rawDamage = Math.round(rawDamage * 0.82);
            const drained = Math.min(3, state.playerMana);
            state.playerMana -= drained;
            state.metrics.manaDrained += drained;
            note = '汲灵';
        } else if (intent === 'obscure') {
            rawDamage = Math.round(rawDamage * 0.72);
            state.metrics.obscureApplied += 1;
            if (state.playerMind >= BATTLE_RULES.obscureMindThreshold) {
                state.metrics.obscureResisted += 1;
                state.obscuredTurns = 0;
                note = '迷障（心境抵抗）';
            } else {
                state.obscuredTurns = 1;
                note = '迷障';
            }
        } else if (intent === 'barrier') {
            state.enemyBarrier = Math.max(
                state.enemyBarrier,
                Math.round(state.enemyMaxHp * 0.12),
            );
            state.enemyIntentIndex += 1;
            state.round += 1;
            const shieldExpired = this.advanceTurnState(state);
            state.log = capLog(
                state.log,
                `${state.enemyName}展开结界，吸收 ${state.enemyBarrier} 点伤害。` +
                    (shieldExpired ? '护体术同时散去。' : ''),
            );
            return 0;
        }

        const mitigated = Math.max(
            1,
            Math.ceil(
                rawDamage *
                    fatigue *
                    (100 /
                        (100 +
                            Math.max(0, defense) *
                                BATTLE_RULES.defenseMitigationFactor)),
            ),
        );
        const shieldAbsorb = Math.min(state.playerShield, mitigated);
        state.playerShield -= shieldAbsorb;
        const shieldConsumed = shieldAbsorb > 0;
        if (shieldConsumed) {
            state.playerShield = 0;
            state.shieldTurns = 0;
        }
        const tutorialProtected =
            state.tutorialBattle &&
            state.round <= 3 &&
            mitigated - shieldAbsorb > 4;
        const protectedHealthDamage = tutorialProtected
            ? Math.min(4, mitigated - shieldAbsorb)
            : mitigated - shieldAbsorb;
        state.playerHp = Math.max(0, state.playerHp - protectedHealthDamage);
        state.metrics.damageTaken += protectedHealthDamage;
        state.metrics.shieldAbsorbed += shieldAbsorb;
        if (intent === 'charge') {
            state.metrics.chargeDamageTaken += protectedHealthDamage;
        }
        state.enemyIntentIndex += 1;
        state.round += 1;
        const shieldExpired = this.advanceTurnState(state);
        state.log = capLog(
            state.log,
            `${state.enemyName}${note || '攻击'}造成 ${protectedHealthDamage} 点伤害${shieldAbsorb ? `（护盾吸收 ${shieldAbsorb}）` : ''}。` +
                (tutorialProtected ? '（练习战减伤）' : '') +
                (shieldConsumed || shieldExpired ? '护体术散去。' : ''),
        );

        if (state.playerHp <= 0) {
            state.outcome = 'defeat';
            state.log = capLog(state.log, '气海受创，战斗失败。');
        }
        return protectedHealthDamage;
    }

    private static fatigueMultiplier(round: number): number {
        if (round < BATTLE_RULES.fatigueStartRound) {
            return 1;
        }
        const steps = Math.floor(
            (round - BATTLE_RULES.fatigueStartRound) /
                BATTLE_RULES.fatigueInterval,
        ) + 1;
        return 1 + Math.min(
            BATTLE_RULES.fatigueCap,
            steps * BATTLE_RULES.fatigueStep,
        );
    }

    private static advanceTurnState(state: BattleState): boolean {
        state.guardCooldown = Math.max(0, state.guardCooldown - 1);
        if (state.playerShield <= 0) {
            const hadShield = state.shieldTurns > 0;
            state.playerShield = 0;
            state.shieldTurns = 0;
            return hadShield;
        }

        state.shieldTurns = Math.max(0, state.shieldTurns - 1);
        if (state.shieldTurns > 0) {
            return false;
        }
        state.playerShield = 0;
        return true;
    }
}
