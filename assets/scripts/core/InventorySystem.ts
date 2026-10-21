import {
    EquipmentInstance,
    EquipmentQuality,
    EquipmentSlot,
    EquipmentStats,
    LocalSave,
} from './StoryTypes';
import {
    QUALITY_RANK,
    QUALITY_REFINE_CAP,
    QUALITY_SELL_BASE,
    QUALITY_SELL_CAP,
    REFINEMENT_RULES,
    SLOT_LABELS,
} from './GameConfig';
import { EconomySystem } from './EconomySystem';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';

export type EquipmentSortMode =
    | 'quality'
    | 'slot'
    | 'power'
    | 'refine'
    | 'latest';

export type EquipmentStatusFilter =
    | 'all'
    | 'equipped'
    | 'replaceable'
    | 'cultivable'
    | 'sellable'
    | 'locked'
    | 'new_affix';

export interface InventoryResult {
    success: boolean;
    message: string;
    consumed?: number;
    restored?: number;
    refundMaterials?: number;
    lingShiDelta?: number;
}

export interface EquipmentListOptions {
    slot?: EquipmentSlot | 'all';
    quality?: EquipmentQuality | 'all';
    status?: EquipmentStatusFilter;
    sort?: EquipmentSortMode;
    includeUnequipped?: boolean;
}

export interface EquipmentComparison {
    current: EquipmentInstance | null;
    scoreDelta: number;
    statDelta: EquipmentStats;
    recommended: boolean;
}

export type EquipmentRecommendationContext =
    | 'balanced'
    | 'break_charge'
    | 'resist_obscure'
    | 'recover_mana'
    | 'break_barrier';

export interface ContextualEquipmentRecommendation extends EquipmentComparison {
    context: EquipmentRecommendationContext;
    contextLabel: string;
    reason: string;
}

export interface EquipmentSaleEstimate {
    qualityBase: number;
    statValue: number;
    affixValue: number;
    uncappedPrice: number;
    price: number;
    cap: number;
    capped: boolean;
}

export interface ConsumableConfig {
    id: string;
    name: string;
    spiritRestore: number;
}

const CONSUMABLES: Record<string, ConsumableConfig> = {
    hui_qi_powder: {
        id: 'hui_qi_powder',
        name: '回气散',
        spiritRestore: 8,
    },
    homegrown_herb: {
        id: 'homegrown_herb',
        name: '回气草',
        spiritRestore: 5,
    },
};

function addStat(
    stats: EquipmentStats,
    key: keyof EquipmentStats,
    value: number,
): void {
    stats[key] = Math.max(0, Math.round(Number(stats[key] ?? 0) + value));
}

function effectiveBaseStats(equipment: EquipmentInstance): EquipmentStats {
    const baseRoll = Number.isFinite(Number(equipment.baseRoll))
        ? Math.max(0.5, Math.min(2, Number(equipment.baseRoll)))
        : 1;
    const multiplier =
        baseRoll * InventorySystem.refineMultiplier(equipment.refineLevel);
    const result: EquipmentStats = {};
    Object.keys(equipment.baseStats ?? {}).forEach((key) => {
        const statKey = key as keyof EquipmentStats;
        addStat(
            result,
            statKey,
            Math.round(Number(equipment.baseStats[statKey] ?? 0) * multiplier),
        );
    });
    if (!Object.keys(result).length && equipment.basePower) {
        addStat(result, 'attack', Math.round(equipment.basePower * multiplier));
    }
    return result;
}

function affixStats(equipment: EquipmentInstance): EquipmentStats {
    const result: EquipmentStats = {};
    equipment.affixes.forEach((affix) => {
        switch (affix.id) {
            case 'sharp_edge':
                addStat(result, 'attack', affix.value);
                break;
            case 'spirit_return':
                addStat(result, 'spirit', affix.value);
                break;
            case 'trace_light':
            case 'truth_light':
                addStat(result, 'insight', affix.value);
                break;
            case 'steady_mind':
                addStat(result, 'health', affix.value * 2);
                addStat(result, 'mind', affix.value * 2);
                break;
            default:
                break;
        }
    });
    return result;
}

function sumStats(target: EquipmentStats, source: EquipmentStats): EquipmentStats {
    const next: EquipmentStats = { ...target };
    Object.keys(source).forEach((key) => {
        const statKey = key as keyof EquipmentStats;
        addStat(next, statKey, Number(source[statKey] ?? 0));
    });
    return next;
}

export class InventorySystem {
    public static consumable(itemId: string): ConsumableConfig | null {
        return CONSUMABLES[itemId] ?? null;
    }

    public static refineMultiplier(refineLevel: number): number {
        if (refineLevel <= 0) {
            return 1;
        }
        return REFINEMENT_RULES[Math.min(refineLevel, REFINEMENT_RULES.length) - 1]
            ?.statMultiplier ?? 1;
    }

    public static refinementMaterialInvestment(refineLevel: number): number {
        return REFINEMENT_RULES
            .slice(0, Math.max(0, Math.floor(refineLevel)))
            .reduce((total, rule) => total + rule.materialCost, 0);
    }

    public static equipmentStats(equipment: EquipmentInstance): EquipmentStats {
        return sumStats(effectiveBaseStats(equipment), affixStats(equipment));
    }

    public static totalEquippedStats(save: LocalSave): EquipmentStats {
        return save.equipment
            .filter((equipment) => equipment.equipped)
            .reduce(
                (total, equipment) =>
                    sumStats(total, this.equipmentStats(equipment)),
                {} as EquipmentStats,
            );
    }

    public static listEquipment(
        save: LocalSave,
        options: EquipmentListOptions = {},
    ): EquipmentInstance[] {
        const slot = options.slot ?? 'all';
        const quality = options.quality ?? 'all';
        const status = options.status ?? 'all';
        const sort = options.sort ?? 'quality';
        const filtered = save.equipment.filter((equipment) => {
            const comparison = status === 'replaceable'
                ? this.compareEquipment(save, equipment.id)
                : null;
            const pending = save.forgePending?.equipmentId === equipment.id;
            const matchesStatus = status === 'all' ||
                (status === 'equipped' && equipment.equipped) ||
                (status === 'replaceable' &&
                    !equipment.equipped &&
                    comparison?.recommended === true) ||
                (status === 'cultivable' &&
                    !pending &&
                    equipment.refineLevel <
                        QUALITY_REFINE_CAP[equipment.quality]) ||
                (status === 'sellable' &&
                    !equipment.equipped &&
                    !equipment.locked &&
                    !pending) ||
                (status === 'locked' && equipment.locked) ||
                (status === 'new_affix' && pending);
            return matchesStatus &&
                (slot === 'all' || equipment.slot === slot) &&
                (quality === 'all' || equipment.quality === quality) &&
                (options.includeUnequipped !== false || equipment.equipped);
        });
        return [...filtered].sort((left, right) => {
            if (sort === 'quality') {
                const priority = (equipment: EquipmentInstance): number => {
                    if (equipment.equipped) {
                        return 0;
                    }
                    const comparison = this.compareEquipment(
                        save,
                        equipment.id,
                    );
                    return comparison?.current && comparison.recommended
                        ? 1
                        : 2;
                };
                const priorityDifference = priority(left) - priority(right);
                if (priorityDifference !== 0) {
                    return priorityDifference;
                }
                const qualityDifference =
                    QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality];
                if (qualityDifference !== 0) {
                    return qualityDifference;
                }
                if (left.refineLevel !== right.refineLevel) {
                    return right.refineLevel - left.refineLevel;
                }
                const scoreDifference =
                    this.equipmentScore(right) - this.equipmentScore(left);
                if (scoreDifference !== 0) {
                    return scoreDifference;
                }
                if (left.acquiredAt !== right.acquiredAt) {
                    return right.acquiredAt - left.acquiredAt;
                }
                if (left.locked !== right.locked) {
                    return left.locked ? -1 : 1;
                }
                return left.name.localeCompare(right.name);
            }
            if (sort === 'slot' && left.slot !== right.slot) {
                return SLOT_LABELS[left.slot].localeCompare(SLOT_LABELS[right.slot]);
            }
            if (sort === 'power') {
                const scoreDifference =
                    this.equipmentScore(right) - this.equipmentScore(left);
                if (scoreDifference !== 0) {
                    return scoreDifference;
                }
            }
            if (sort === 'refine' && left.refineLevel !== right.refineLevel) {
                return right.refineLevel - left.refineLevel;
            }
            if (sort === 'latest' && left.acquiredAt !== right.acquiredAt) {
                return right.acquiredAt - left.acquiredAt;
            }
            const qualityDifference =
                QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality];
            if (qualityDifference !== 0) {
                return qualityDifference;
            }
            if (left.refineLevel !== right.refineLevel) {
                return right.refineLevel - left.refineLevel;
            }
            if (left.equipped !== right.equipped) {
                return left.equipped ? -1 : 1;
            }
            if (left.locked !== right.locked) {
                return left.locked ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        });
    }

    public static equipmentScore(equipment: EquipmentInstance): number {
        const stats = this.equipmentStats(equipment);
        return Math.round(
            Number(stats.attack ?? 0) * 1.6 +
                Number(stats.defense ?? 0) +
                Number(stats.health ?? 0) * 0.35 +
                Number(stats.mana ?? 0) * 0.8 +
                Number(stats.spirit ?? 0) * 0.6 +
                Number(stats.insight ?? 0) * 0.3 +
                Number(stats.mind ?? 0) * 0.5,
        );
    }

    public static compareEquipment(
        save: LocalSave,
        equipmentId: string,
    ): EquipmentComparison | null {
        const selected = save.equipment.find((item) => item.id === equipmentId);
        if (!selected) {
            return null;
        }
        const current = save.equipment.find(
            (item) =>
                item.id !== selected.id &&
                item.slot === selected.slot &&
                item.equipped,
        ) ?? null;
        const selectedStats = this.equipmentStats(selected);
        const currentStats = current ? this.equipmentStats(current) : {};
        const statDelta: EquipmentStats = {};
        const keys = new Set([
            ...Object.keys(selectedStats),
            ...Object.keys(currentStats),
        ]);
        keys.forEach((key) => {
            const statKey = key as keyof EquipmentStats;
            const difference =
                Number(selectedStats[statKey] ?? 0) -
                Number(currentStats[statKey] ?? 0);
            if (difference !== 0) {
                statDelta[statKey] = difference;
            }
        });
        const scoreDelta =
            this.equipmentScore(selected) -
            (current ? this.equipmentScore(current) : 0);
        return {
            current,
            scoreDelta,
            statDelta,
            recommended: !current || scoreDelta > 0,
        };
    }

    public static contextualRecommendation(
        save: LocalSave,
        equipmentId: string,
        context: EquipmentRecommendationContext = 'balanced',
    ): ContextualEquipmentRecommendation | null {
        const comparison = this.compareEquipment(save, equipmentId);
        const selected = save.equipment.find((item) => item.id === equipmentId);
        if (!comparison || !selected) {
            return null;
        }
        const selectedScore = this.contextualScore(selected, context);
        const currentScore = comparison.current
            ? this.contextualScore(comparison.current, context)
            : 0;
        const scoreDelta = selectedScore - currentScore;
        const details = this.recommendationDetails(context);
        return {
            ...comparison,
            scoreDelta,
            recommended: !comparison.current || scoreDelta > 0,
            context,
            contextLabel: details.label,
            reason: details.reason,
        };
    }

    public static useConsumable(
        save: LocalSave,
        itemId: string,
        requestedCount = 1,
    ): InventoryResult {
        const item = this.consumable(itemId);
        if (!item) {
            return { success: false, message: '该物品不能在此处使用。' };
        }
        const missing = Math.max(
            0,
            save.cultivation.spiritCap - save.cultivation.spirit,
        );
        if (missing <= 0) {
            return { success: false, message: '灵力已满，无需使用回气物品。' };
        }
        const available = Math.max(0, Math.floor(Number(save.inventory[itemId] ?? 0)));
        const targetCount = Math.max(1, Math.floor(requestedCount));
        const usefulCount = Math.ceil(missing / item.spiritRestore);
        const count = Math.min(available, targetCount, usefulCount);
        if (count <= 0) {
            return { success: false, message: `${item.name}数量不足。` };
        }

        const restored = Math.min(missing, count * item.spiritRestore);
        const beforeSpirit = save.cultivation.spirit;
        const overflowAvoided = Math.max(
            0,
            Math.min(available, targetCount) * item.spiritRestore - restored,
        );
        SaveManager.addInventory(save, itemId, -count);
        save.cultivation.spirit += restored;
        TelemetryService.record(save, 'inventory.consumable_used', {
            itemId,
            count,
            restored,
        });
        TelemetryService.record(save, 'consumable_batch_used', {
            itemId,
            requestedCount: targetCount,
            actualCount: count,
            overflowAvoided,
            restored,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `使用${item.name} ×${count}，灵力：${beforeSpirit}/${save.cultivation.spiritCap} → ${save.cultivation.spirit}/${save.cultivation.spiritCap}，剩余 ${Math.max(0, Math.floor(Number(save.inventory[itemId] ?? 0)))}。`,
            consumed: count,
            restored,
        };
    }

    public static fillSpiritWithPowder(save: LocalSave): InventoryResult {
        const powder = this.consumable('hui_qi_powder');
        if (!powder) {
            return { success: false, message: '回气散配置缺失。' };
        }
        const missing = Math.max(
            0,
            save.cultivation.spiritCap - save.cultivation.spirit,
        );
        return this.useConsumable(
            save,
            powder.id,
            Math.ceil(missing / powder.spiritRestore),
        );
    }

    public static equip(save: LocalSave, equipmentId: string): InventoryResult {
        if (save.forgePending) {
            return {
                success: false,
                message: '新词条尚未处理，请先确认写入或保留原词条。',
            };
        }
        const selected = save.equipment.find((item) => item.id === equipmentId);
        if (!selected) {
            return { success: false, message: '未找到该装备。' };
        }
        if (selected.equipped) {
            return { success: true, message: `${selected.name}已装备。` };
        }
        const previous = save.equipment.find(
            (item) => item.slot === selected.slot && item.equipped,
        );
        let refundMaterials = 0;
        if (previous) {
            previous.equipped = false;
            const invested = this.refinementMaterialInvestment(previous.refineLevel);
            refundMaterials = Math.floor(invested * 0.8);
            if (refundMaterials > 0) {
                SaveManager.addInventory(
                    save,
                    'tempering_material',
                    refundMaterials,
                );
            }
            // A replacement performs a partial dismantle. Always reset the
            // old item so malformed legacy refinement levels cannot be
            // swapped repeatedly for a refund.
            previous.refineLevel = 0;
        }
        selected.equipped = true;
        TelemetryService.record(save, 'inventory.equipment_equipped', {
            equipmentId: selected.id,
            slot: selected.slot,
            refundedMaterials: refundMaterials,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: previous
                ? refundMaterials > 0
                    ? `已装备${selected.name}，拆解${previous.name}的温养并返还 ${refundMaterials} 个淬炼材料。`
                    : `已装备${selected.name}，卸下${previous.name}。`
                : `已装备${selected.name}。`,
            refundMaterials,
        };
    }

    public static toggleLock(save: LocalSave, equipmentId: string): InventoryResult {
        const equipment = save.equipment.find((item) => item.id === equipmentId);
        if (!equipment) {
            return { success: false, message: '未找到该装备。' };
        }
        if (save.forgePending?.equipmentId === equipmentId) {
            return {
                success: false,
                message: '该装备的新词条尚未处理，暂时不能变更锁定状态。',
            };
        }
        equipment.locked = !equipment.locked;
        TelemetryService.record(save, 'inventory.equipment_lock_toggled', {
            equipmentId,
            locked: equipment.locked,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: equipment.locked
                ? `${equipment.name}已锁定。`
                : `${equipment.name}已解除锁定。`,
        };
    }

    public static sellEquipment(save: LocalSave, equipmentId: string): InventoryResult {
        const index = save.equipment.findIndex((item) => item.id === equipmentId);
        if (index < 0) {
            return { success: false, message: '未找到该装备。' };
        }
        const equipment = save.equipment[index];
        if (equipment.equipped) {
            return { success: false, message: '已装备物品不能出售。' };
        }
        if (equipment.locked) {
            return { success: false, message: '已锁定物品不能出售。' };
        }
        if (save.forgePending?.equipmentId === equipmentId) {
            return {
                success: false,
                message: '该装备的新词条尚未处理，暂时不能出售。',
            };
        }
        const estimate = this.estimateEquipmentSale(equipment);
        save.equipment.splice(index, 1);
        EconomySystem.grantLingShi(save, estimate.price, 'equipment_sale');
        TelemetryService.record(save, 'inventory.equipment_sold', {
            equipmentId,
            price: estimate.price,
            capped: estimate.capped,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: estimate.capped
                ? `出售${equipment.name}，获得 ${estimate.price} 灵石（已达到该品质回收上限）。`
                : `出售${equipment.name}，获得 ${estimate.price} 灵石。`,
            lingShiDelta: estimate.price,
        };
    }

    public static estimateEquipmentSale(
        equipment: EquipmentInstance,
    ): EquipmentSaleEstimate {
        const effectiveStats = effectiveBaseStats(equipment);
        const statTotal = Object.keys(effectiveStats).reduce(
            (total, key) =>
                total +
                Number(effectiveStats[key as keyof EquipmentStats] ?? 0),
            0,
        );
        const qualityBase = QUALITY_SELL_BASE[equipment.quality];
        const statValue = Math.floor(statTotal / 4);
        const affixValue = Math.floor(
            equipment.affixes.reduce(
                (total, affix) => total + affix.value + affix.tier,
                0,
            ) / 3,
        );
        const uncappedPrice = Math.max(
            1,
            qualityBase + statValue + affixValue,
        );
        const cap = QUALITY_SELL_CAP[equipment.quality];
        const price = Math.min(uncappedPrice, cap);
        return {
            qualityBase,
            statValue,
            affixValue,
            uncappedPrice,
            price,
            cap,
            capped: uncappedPrice > cap,
        };
    }

    public static formatStats(equipment: EquipmentInstance): string {
        const stats = this.equipmentStats(equipment);
        const labels = this.statLabels();
        const values = Object.keys(stats)
            .filter((key) => Number(stats[key as keyof EquipmentStats] ?? 0) > 0)
            .map((key) => `${labels[key] ?? key}+${stats[key as keyof EquipmentStats]}`);
        return values.join(' ') || '无额外属性';
    }

    public static formatComparison(comparison: EquipmentComparison): string {
        if (!comparison.current) {
            return '该部位尚未装备，可直接装配。';
        }
        const labels = this.statLabels();
        const differences = Object.keys(comparison.statDelta)
            .map((key) => {
                const value = Number(
                    comparison.statDelta[key as keyof EquipmentStats] ?? 0,
                );
                return `${labels[key] ?? key}${value >= 0 ? '+' : ''}${value}`;
            });
        const scoreText =
            comparison.scoreDelta >= 0
                ? `综合 +${comparison.scoreDelta}`
                : `综合 ${comparison.scoreDelta}`;
        return `对比${comparison.current.name}：${differences.join(' ') || '属性相同'} · ${scoreText} · ${comparison.recommended ? '推荐替换' : '不建议替换'}`;
    }

    public static formatContextualRecommendation(
        recommendation: ContextualEquipmentRecommendation,
    ): string {
        if (!recommendation.current) {
            return `情境建议（${recommendation.contextLabel}）：该部位尚未装备，可直接装配；${recommendation.reason}`;
        }
        const scoreText = recommendation.scoreDelta >= 0
            ? `情境 +${recommendation.scoreDelta}`
            : `情境 ${recommendation.scoreDelta}`;
        return `情境建议（${recommendation.contextLabel}）：${scoreText}，${recommendation.recommended ? '推荐替换' : '暂不建议替换'}；${recommendation.reason}`;
    }

    private static contextualScore(
        equipment: EquipmentInstance,
        context: EquipmentRecommendationContext,
    ): number {
        const stats = this.equipmentStats(equipment);
        const attack = Number(stats.attack ?? 0);
        const defense = Number(stats.defense ?? 0);
        const health = Number(stats.health ?? 0);
        const mana = Number(stats.mana ?? 0);
        const spirit = Number(stats.spirit ?? 0);
        const insight = Number(stats.insight ?? 0);
        const mind = Number(stats.mind ?? 0);
        switch (context) {
            case 'break_charge':
                return Math.round(
                    attack * 1.15 +
                        defense * 2 +
                        health * 0.8 +
                        mana * 0.45 +
                        mind * 0.75,
                );
            case 'resist_obscure':
                return Math.round(
                    attack * 0.8 +
                        defense * 0.7 +
                        health * 0.3 +
                        mana * 0.9 +
                        insight * 2.1 +
                        mind * 2,
                );
            case 'recover_mana':
                return Math.round(
                    attack * 0.85 +
                        defense * 0.7 +
                        health * 0.25 +
                        mana * 2 +
                        spirit * 1.6 +
                        insight * 0.65 +
                        mind * 0.4,
                );
            case 'break_barrier':
                return Math.round(
                    attack * 2 +
                        defense * 0.5 +
                        health * 0.2 +
                        mana * 0.35 +
                        insight * 0.8,
                );
            default:
                return this.equipmentScore(equipment);
        }
    }

    private static recommendationDetails(
        context: EquipmentRecommendationContext,
    ): { label: string; reason: string } {
        switch (context) {
            case 'break_charge':
                return {
                    label: '应对蓄势与破甲',
                    reason: '优先保留防御、气血与心境，确保能承受关键回合。',
                };
            case 'resist_obscure':
                return {
                    label: '识破迷障',
                    reason: '优先洞察与心境，减少迷障对破势节奏的干扰。',
                };
            case 'recover_mana':
                return {
                    label: '维持灵力循环',
                    reason: '优先灵力上限与回气，避免被汲灵后无法洞察或护体。',
                };
            case 'break_barrier':
                return {
                    label: '突破结界',
                    reason: '优先攻击与洞察，缩短结界反复吸收伤害的回合数。',
                };
            default:
                return {
                    label: '综合推进',
                    reason: '按当前阶段的攻、防、气血与灵力综合评估。',
                };
        }
    }

    private static statLabels(): Record<string, string> {
        return {
            attack: '攻',
            defense: '防',
            health: '气血',
            mana: '灵力',
            spirit: '回气',
            insight: '洞察',
            mind: '心境',
        };
    }
}
