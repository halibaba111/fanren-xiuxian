import {
    EquipmentAffix,
    EquipmentInstance,
    EquipmentQuality,
    ForgePendingResult,
    LocalSave,
} from './StoryTypes';
import {
    EQUIPMENT_TEMPLATES,
    QUALITY_AFFIX_LIMIT,
    QUALITY_BASE_ROLL_RANGE,
    QUALITY_REFINE_CAP,
    REFINEMENT_RULES,
    REROLL_BASE_COST,
    REROLL_COST_CAP,
} from './GameConfig';
import { EconomySystem } from './EconomySystem';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';

const AFFIX_POOL: readonly Omit<EquipmentAffix, 'tier'>[] = [
    {
        id: 'sharp_edge',
        label: '锋锐',
        value: 4,
        description: '提高基础攻击与破势伤害。',
    },
    {
        id: 'spirit_return',
        label: '回气',
        value: 3,
        description: '提高战斗中回气效率。',
    },
    {
        id: 'trace_light',
        label: '寻痕',
        value: 2,
        description: '提高洞察，便于识破敌方意图。',
    },
    {
        id: 'steady_mind',
        label: '定心',
        value: 3,
        description: '提高气血与心境，可抵抗迷障。',
    },
    {
        id: 'truth_light',
        label: '照伪',
        value: 5,
        description: '提高洞察，削弱迷障造成的压制。',
    },
] as const;

export interface ForgeResult {
    success: boolean;
    message: string;
    affix?: EquipmentAffix;
    coreAffix?: EquipmentAffix;
    coreAffixMode?: 'unlocked' | 'enhanced';
    previousAffix?: EquipmentAffix;
    replaceIndex?: number;
    pending?: boolean;
    cost: number;
    materialCost?: number;
    refineLevel?: number;
}

export type ForgeRecommendationTrigger =
    | 'quality_equipment'
    | 'tower_floor_4'
    | 'battle_defeat';

export interface ForgeRecommendation {
    trigger: ForgeRecommendationTrigger;
    equipmentId: string;
    action: 'warm' | 'reroll';
    message: string;
}

interface ForgeRecommendationOptions {
    equipmentId?: string;
    failureTags?: readonly string[];
}

export class EquipmentForgeSystem {
    public static readonly TEMPERING_MATERIAL_ID = 'tempering_material';
    public static readonly TEMPERING_MATERIAL_COST = 1;
    public static readonly REWARDED_MATERIAL_COUNT = 3;

    public static temperingMaterialCount(save: LocalSave): number {
        return Math.max(
            0,
            Math.floor(Number(save.inventory[this.TEMPERING_MATERIAL_ID] ?? 0)),
        );
    }

    public static grantRewardedMaterials(save: LocalSave): number {
        SaveManager.addInventory(
            save,
            this.TEMPERING_MATERIAL_ID,
            this.REWARDED_MATERIAL_COUNT,
        );
        TelemetryService.record(save, 'forge.rewarded_materials_granted', {
            count: this.REWARDED_MATERIAL_COUNT,
        });
        SaveManager.save(save);
        return this.REWARDED_MATERIAL_COUNT;
    }

    public static createEquipment(
        save: LocalSave,
        templateId: string,
        equipped = false,
    ): EquipmentInstance | null {
        const template = EQUIPMENT_TEMPLATES[templateId];
        if (!template) {
            return null;
        }
        let serial = 1;
        let id = `${templateId}_${serial}`;
        while (save.equipment.some((item) => item.id === id)) {
            serial += 1;
            id = `${templateId}_${serial}`;
        }
        return {
            id,
            templateId,
            name: template.name,
            slot: template.slot,
            level: 1,
            equipped,
            affixes: [],
            baseRoll: this.createBaseRoll(
                templateId,
                template.quality,
                serial,
            ),
            basePower: Number(template.baseStats.attack ?? 0) || undefined,
            quality: template.quality,
            locked: false,
            baseStats: { ...template.baseStats },
            refineLevel: 0,
            rerollCount: 0,
            coreAffixMilestoneClaimed: false,
            acquiredAt: Date.now(),
        };
    }

    private static createBaseRoll(
        templateId: string,
        quality: EquipmentQuality,
        serial: number,
    ): number {
        const [minimum, maximum] = QUALITY_BASE_ROLL_RANGE[quality];
        let seed = serial * 97;
        for (let index = 0; index < templateId.length; index += 1) {
            seed = (seed * 31 + templateId.charCodeAt(index)) % 1000003;
        }
        const normalized = (seed % 1000) / 999;
        return Math.round(
            (minimum + (maximum - minimum) * normalized) * 100,
        ) / 100;
    }

    public static ensureStarterEquipment(save: LocalSave): void {
        const hasSword = Number(save.inventory.old_iron_sword ?? 0) > 0;
        const existing = save.equipment.some(
            (item) => item.templateId === 'old_iron_sword',
        );
        if (!hasSword || existing) {
            return;
        }
        const sword = this.createEquipment(save, 'old_iron_sword', true);
        if (sword) {
            save.equipment.push(sword);
            SaveManager.save(save);
        }
    }

    public static warm(save: LocalSave, equipmentId: string): ForgeResult {
        this.ensureStarterEquipment(save);
        const equipment = save.equipment.find((item) => item.id === equipmentId);
        const rule = equipment
            ? REFINEMENT_RULES.find(
                (candidate) => candidate.fromLevel === equipment.refineLevel,
            )
            : undefined;
        if (!equipment) {
            return { success: false, message: '未找到可温养装备。', cost: 0 };
        }
        if (!SaveManager.isUnlocked(save, 'forge_system')) {
            return {
                success: false,
                message: '完成第二章后才可使用温养台。',
                cost: 0,
            };
        }
        const refineCap = QUALITY_REFINE_CAP[equipment.quality];
        if (refineCap <= 0) {
            return {
                success: false,
                message: `${equipment.name}属于后续开放品质，当前阶段不可继续温养。`,
                cost: 0,
            };
        }
        if (equipment.refineLevel >= refineCap) {
            return {
                success: false,
                message: `${equipment.name}当前品质的温养上限为 +${refineCap}。`,
                cost: 0,
            };
        }
        if (!rule) {
            return {
                success: false,
                message: `${equipment.name}已温养至上限。`,
                cost: 0,
            };
        }
        const freeFirstWarm =
            equipment.refineLevel === 0 && save.flags.free_warm_used !== true;
        const lingShiCost = freeFirstWarm ? 0 : rule.lingShiCost;
        const materialCost = freeFirstWarm ? 0 : rule.materialCost;
        if (this.temperingMaterialCount(save) < materialCost) {
            return {
                success: false,
                message: `淬炼材料不足，需要 ${materialCost} 个。`,
                cost: lingShiCost,
                materialCost,
            };
        }
        if (!EconomySystem.spendLingShi(save, lingShiCost, 'forge_warm')) {
            return {
                success: false,
                message: `灵石不足，需要 ${lingShiCost}。`,
                cost: lingShiCost,
                materialCost,
            };
        }

        SaveManager.addInventory(
            save,
            this.TEMPERING_MATERIAL_ID,
            -materialCost,
        );
        equipment.refineLevel += 1;
        const coreAffix = equipment.refineLevel === 3 &&
            !equipment.coreAffixMilestoneClaimed
            ? this.grantCoreAffixMilestone(save, equipment)
            : null;
        if (freeFirstWarm) {
            save.flags.free_warm_used = true;
        }
        TelemetryService.record(save, 'forge.equipment_warmed', {
            equipmentId,
            refineLevel: equipment.refineLevel,
            lingShiCost,
            materialCost,
            freeFirstWarm,
            coreAffixGranted: Boolean(coreAffix),
            coreAffixMode: coreAffix?.mode ?? 'none',
        });
        TelemetryService.record(save, 'forge_action', {
            action: 'warm',
            quality: equipment.quality,
            refineLevel: equipment.refineLevel,
            lingShiCost,
            materialCost,
            confirmed: true,
            coreAffixGranted: Boolean(coreAffix),
        });
        SaveManager.save(save);
        const baseMessage = freeFirstWarm
            ? `${equipment.name}首次温养免费，已提升至 +${equipment.refineLevel}。`
            : `${equipment.name}温养至 +${equipment.refineLevel}，基础属性稳定提升。`;
        const milestoneMessage = coreAffix
            ? coreAffix.mode === 'unlocked'
                ? ` +3 核心词条已觉醒：${coreAffix.affix.label} ${coreAffix.affix.tier}阶。`
                : ` +3 核心词条已强化：${coreAffix.affix.label}提升至 ${coreAffix.affix.tier}阶。`
            : '';
        return {
            success: true,
            message: `${baseMessage}${milestoneMessage}`,
            cost: lingShiCost,
            materialCost,
            refineLevel: equipment.refineLevel,
            coreAffix: coreAffix?.affix,
            coreAffixMode: coreAffix?.mode,
        };
    }

    /**
     * Emits one actionable forge hint per acquisition, tower, or defeat trigger.
     * The caller owns persistence so recommendation generation can participate in
     * the surrounding battle or tower settlement transaction.
     */
    public static recommendOnce(
        save: LocalSave,
        trigger: ForgeRecommendationTrigger,
        options: ForgeRecommendationOptions = {},
    ): ForgeRecommendation | null {
        const flagKey = `forge_recommendation_${trigger}`;
        if (
            save.flags[flagKey] === true ||
            save.forgePending ||
            !SaveManager.isUnlocked(save, 'forge_system')
        ) {
            return null;
        }

        const equipment = this.recommendationEquipment(save, trigger, options);
        if (!equipment) {
            return null;
        }
        const canWarm =
            QUALITY_REFINE_CAP[equipment.quality] > equipment.refineLevel;
        const canReroll =
            !equipment.locked && QUALITY_AFFIX_LIMIT[equipment.quality] > 0;
        if (!canWarm && !canReroll) {
            return null;
        }

        const action: ForgeRecommendation['action'] = canWarm
            ? 'warm'
            : 'reroll';
        const recommendation: ForgeRecommendation = {
            trigger,
            equipmentId: equipment.id,
            action,
            message: this.recommendationMessage(
                equipment,
                trigger,
                action,
                options.failureTags ?? [],
            ),
        };
        save.flags[flagKey] = true;
        TelemetryService.record(save, 'forge.recommendation_shown', {
            trigger,
            equipmentId: equipment.id,
            quality: equipment.quality,
            action,
            failureTags: (options.failureTags ?? []).join('|') || 'none',
        });
        return recommendation;
    }

    public static startReroll(
        save: LocalSave,
        equipmentId: string,
        replaceIndex = -1,
    ): ForgeResult {
        this.ensureStarterEquipment(save);
        const equipment = save.equipment.find((item) => item.id === equipmentId);
        if (!equipment) {
            return { success: false, message: '未找到可重淬装备。', cost: 0 };
        }
        if (equipment.locked) {
            return {
                success: false,
                message: '该装备已锁定，请先解除锁定再重淬。',
                cost: 0,
            };
        }
        if (save.forgePending) {
            return {
                success: false,
                message: '新词条尚未处理，请先选择替换或保留。',
                cost: 0,
            };
        }
        if (!SaveManager.isUnlocked(save, 'forge_system')) {
            return {
                success: false,
                message: '完成第二章后才可使用重淬台。',
                cost: 0,
            };
        }
        const affixLimit = QUALITY_AFFIX_LIMIT[equipment.quality];
        if (affixLimit <= 0) {
            return {
                success: false,
                message: '凡品装备无法承载词条，建议作为过渡装备出售或替换。',
                cost: 0,
            };
        }
        if (equipment.affixes.length >= affixLimit) {
            if (
                replaceIndex < 0 ||
                replaceIndex >= equipment.affixes.length
            ) {
                return {
                    success: false,
                    message: '该品质词条已满，请先选择要替换的词条。',
                    cost: 0,
                };
            }
        } else {
            replaceIndex = -1;
        }

        const cost = Math.min(
            REROLL_COST_CAP,
            REROLL_BASE_COST + equipment.rerollCount * 2,
        );
        if (this.temperingMaterialCount(save) < this.TEMPERING_MATERIAL_COST) {
            return {
                success: false,
                message: `淬炼材料不足，需要 ${this.TEMPERING_MATERIAL_COST} 个。`,
                cost,
                materialCost: this.TEMPERING_MATERIAL_COST,
            };
        }
        if (!EconomySystem.spendLingShi(save, cost, 'forge_reroll')) {
            return {
                success: false,
                message: `灵石不足，本次重淬需要 ${cost}。`,
                cost,
                materialCost: this.TEMPERING_MATERIAL_COST,
            };
        }

        SaveManager.addInventory(
            save,
            this.TEMPERING_MATERIAL_ID,
            -this.TEMPERING_MATERIAL_COST,
        );
        const affix = this.rollAffix(save, equipment, replaceIndex);
        const previousAffix = replaceIndex >= 0
            ? { ...equipment.affixes[replaceIndex] }
            : undefined;
        const pending: ForgePendingResult = {
            equipmentId: equipment.id,
            replaceIndex,
            affix,
            previousAffix,
            mode: 'reroll',
            cost,
        };
        save.forgePending = pending;
        save.forgeAttempts += 1;
        equipment.rerollCount += 1;
        TelemetryService.record(save, 'forge.reroll_started', {
            equipmentId,
            cost,
            replaceIndex,
            rerollCount: equipment.rerollCount,
        });
        TelemetryService.record(save, 'forge_action', {
            action: 'reroll',
            quality: equipment.quality,
            lingShiCost: cost,
            materialCost: this.TEMPERING_MATERIAL_COST,
            confirmed: false,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `${equipment.name}生成了${affix.label} ${affix.tier}阶，请选择写入或保留原词条。`,
            affix,
            previousAffix,
            replaceIndex,
            pending: true,
            cost,
            materialCost: this.TEMPERING_MATERIAL_COST,
        };
    }

    /**
     * Compatibility alias for existing UI code. New UI should call startReroll
     * with an explicit replacement index once the affix bar is full.
     */
    public static temper(save: LocalSave, equipmentId: string): ForgeResult {
        return this.startReroll(save, equipmentId);
    }

    public static applyPending(
        save: LocalSave,
        accept: boolean,
    ): ForgeResult {
        const pending = save.forgePending;
        if (!pending) {
            return {
                success: false,
                message: '当前没有待处理的重淬结果。',
                cost: 0,
            };
        }
        const equipment = save.equipment.find(
            (item) => item.id === pending.equipmentId,
        );
        if (!equipment) {
            save.forgePending = null;
            SaveManager.save(save);
            return {
                success: false,
                message: '原装备不存在，已清理待处理结果。',
                cost: 0,
            };
        }

        if (accept) {
            if (
                pending.replaceIndex >= 0 &&
                pending.replaceIndex < equipment.affixes.length
            ) {
                equipment.affixes.splice(
                    pending.replaceIndex,
                    1,
                    pending.affix,
                );
            } else if (
                pending.replaceIndex < 0 &&
                equipment.affixes.length < QUALITY_AFFIX_LIMIT[equipment.quality]
            ) {
                equipment.affixes.push(pending.affix);
            } else {
                save.forgePending = null;
                SaveManager.save(save);
                return {
                    success: false,
                    message: '词条位置已失效，本次重淬结果未写入。',
                    cost: 0,
                };
            }
        }

        save.forgePending = null;
        TelemetryService.record(save, 'forge.reroll_resolved', {
            equipmentId: equipment.id,
            accepted: accept,
        });
        TelemetryService.record(save, 'forge_action', {
            action: 'reroll',
            quality: equipment.quality,
            lingShiCost: 0,
            materialCost: 0,
            confirmed: accept,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: accept
                ? `已将${pending.affix.label} ${pending.affix.tier}阶写入${equipment.name}。`
                : `已保留${equipment.name}的原词条。`,
            affix: pending.affix,
            previousAffix: pending.previousAffix,
            replaceIndex: pending.replaceIndex,
            pending: false,
            cost: 0,
        };
    }

    private static rollAffix(
        save: LocalSave,
        equipment: EquipmentInstance,
        replaceIndex: number,
    ): EquipmentAffix {
        const currentIds = equipment.affixes
            .filter((_, index) => index !== replaceIndex)
            .map((affix) => affix.id);
        const availablePool = (save.flags.artifact_awakened === true
            ? AFFIX_POOL
            : AFFIX_POOL.filter((affix) => affix.id !== 'truth_light'))
            .filter((affix) => currentIds.indexOf(affix.id) < 0);
        const pool = availablePool.length ? availablePool : AFFIX_POOL;
        const seed =
            save.forgeAttempts + equipment.rerollCount + equipment.refineLevel;
        const template = pool[seed % pool.length];
        const tier = 1 + (seed % 3);
        return {
            ...template,
            tier,
            value: Math.max(1, Math.round(template.value * (1 + 0.25 * (tier - 1)))),
        };
    }

    private static recommendationEquipment(
        save: LocalSave,
        trigger: ForgeRecommendationTrigger,
        options: ForgeRecommendationOptions,
    ): EquipmentInstance | null {
        const isActionable = (equipment: EquipmentInstance): boolean =>
            QUALITY_REFINE_CAP[equipment.quality] > equipment.refineLevel ||
            (!equipment.locked && QUALITY_AFFIX_LIMIT[equipment.quality] > 0);
        const requested = options.equipmentId
            ? save.equipment.find((item) => item.id === options.equipmentId)
            : undefined;
        if (requested && isActionable(requested)) {
            return requested;
        }

        const preferredSlots = this.recommendationSlots(
            trigger,
            options.failureTags ?? [],
        );
        const qualityScore: Record<EquipmentQuality, number> = {
            white: 0,
            green: 1,
            blue: 2,
            purple: 3,
            gold: 4,
            red: 5,
        };
        const candidates = save.equipment.filter(isActionable);
        candidates.sort((left, right) => {
            const score = (equipment: EquipmentInstance): number =>
                (equipment.equipped ? 100 : 0) +
                (preferredSlots.indexOf(equipment.slot) >= 0 ? 160 : 0) +
                qualityScore[equipment.quality] * 5 +
                equipment.refineLevel;
            const scoreDelta = score(right) - score(left);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }
            return right.acquiredAt - left.acquiredAt;
        });
        return candidates[0] ?? null;
    }

    private static recommendationSlots(
        trigger: ForgeRecommendationTrigger,
        failureTags: readonly string[],
    ): EquipmentInstance['slot'][] {
        if (trigger === 'tower_floor_4') {
            return ['armor', 'head', 'weapon'];
        }
        if (trigger === 'quality_equipment') {
            return ['weapon', 'artifact', 'armor', 'head', 'ring', 'boots'];
        }
        if (
            failureTags.indexOf('charge_unanswered') >= 0 ||
            failureTags.indexOf('guard_unused') >= 0
        ) {
            return ['armor', 'head', 'artifact'];
        }
        if (
            failureTags.indexOf('mana_starved') >= 0 ||
            failureTags.indexOf('obscured') >= 0
        ) {
            return ['artifact', 'head', 'ring'];
        }
        if (failureTags.indexOf('low_output') >= 0) {
            return ['weapon', 'artifact'];
        }
        return ['weapon', 'armor', 'artifact', 'head', 'ring', 'boots'];
    }

    private static recommendationMessage(
        equipment: EquipmentInstance,
        trigger: ForgeRecommendationTrigger,
        action: ForgeRecommendation['action'],
        failureTags: readonly string[],
    ): string {
        const actionText = action === 'warm'
            ? `先温养至 +${equipment.refineLevel + 1}`
            : '重淬当前词条';
        if (trigger === 'quality_equipment') {
            return `新获得的【${equipment.name}】可作为培养对象，建议${actionText}后再继续推进。`;
        }
        if (trigger === 'tower_floor_4') {
            return `第 4 层开始检验蓄势应对，建议处理【${equipment.name}】并${actionText}，提高下一段容错。`;
        }
        if (
            failureTags.indexOf('charge_unanswered') >= 0 ||
            failureTags.indexOf('guard_unused') >= 0
        ) {
            return `本次被蓄势压制，建议处理【${equipment.name}】并${actionText}，补足防御或护体容错。`;
        }
        if (
            failureTags.indexOf('mana_starved') >= 0 ||
            failureTags.indexOf('obscured') >= 0
        ) {
            return `本次战斗法力或洞察节奏受限，建议处理【${equipment.name}】并${actionText}，寻找回气、定心或洞察词条。`;
        }
        if (failureTags.indexOf('low_output') >= 0) {
            return `本次输出不足，建议处理【${equipment.name}】并${actionText}，为攻伐和破势补足基础伤害。`;
        }
        return `本次战斗消耗偏高，建议处理【${equipment.name}】并${actionText}，再调整后续挑战策略。`;
    }

    private static grantCoreAffixMilestone(
        save: LocalSave,
        equipment: EquipmentInstance,
    ): { affix: EquipmentAffix; mode: 'unlocked' | 'enhanced' } | null {
        equipment.coreAffixMilestoneClaimed = true;
        const affixLimit = QUALITY_AFFIX_LIMIT[equipment.quality];
        if (affixLimit <= 0) {
            return null;
        }
        if (equipment.affixes.length < affixLimit) {
            const affix = this.rollAffix(save, equipment, -1);
            equipment.affixes.push(affix);
            return { affix, mode: 'unlocked' };
        }

        const target = [...equipment.affixes].sort((left, right) => {
            if (left.tier !== right.tier) {
                return left.tier - right.tier;
            }
            if (left.value !== right.value) {
                return left.value - right.value;
            }
            return left.id.localeCompare(right.id);
        })[0];
        if (!target) {
            return null;
        }
        target.tier = Math.min(3, target.tier + 1);
        target.value = Math.max(
            target.value + 1,
            Math.round(target.value * 1.25),
        );
        return {
            affix: { ...target },
            mode: 'enhanced',
        };
    }
}
