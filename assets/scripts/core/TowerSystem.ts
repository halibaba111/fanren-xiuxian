import {
    EquipmentForgeSystem,
    ForgeRecommendation,
} from './EquipmentForgeSystem';
import { EconomySystem } from './EconomySystem';
import {
    EQUIPMENT_TEMPLATES,
    firstClearEquipmentTemplateIds,
    ITEM_DEFINITIONS,
    TOWER_FLOORS,
    TowerFloorConfig,
    TowerItemReward,
} from './GameConfig';
import { SaveManager } from './SaveManager';
import { LocalSave } from './StoryTypes';
import { TelemetryService } from './TelemetryService';
import { getRealmRank, getRealmStageLabel } from './RealmProgression';

export interface TowerGateResult {
    allowed: boolean;
    message: string;
    spiritCost: number;
}

export interface TowerActionResult {
    success: boolean;
    message: string;
    floor?: number;
    enemyId?: string;
    firstClear?: boolean;
    lingShi?: number;
    material?: number;
    rewardEquipmentName?: string;
    rewardEquipmentTemplateId?: string;
    rewardEquipmentNames?: string[];
    rewardEquipmentTemplateIds?: string[];
    itemRewards?: TowerGrantedItem[];
    rewardFlags?: string[];
    forgeRecommendation?: ForgeRecommendation;
}

export interface TowerGrantedItem {
    itemId: string;
    count: number;
    name: string;
}

export interface TowerGrantedEquipment {
    id: string;
    templateId: string;
    name: string;
}

export interface TowerAdventure {
    id: string;
    title: string;
    description: string;
    options: Array<{
        id: string;
        label: string;
        description: string;
        type: 'material' | 'blessing' | 'herb';
        amount: number;
        flagId?: string;
        flagLabel?: string;
    }>;
}

const ADVENTURE_BY_FLOOR: Record<number, TowerAdventure> = {
    1: {
        id: 'tower_lamp_record',
        title: '缺页灯录',
        description: '灯台下压着一页被水浸透的巡查记录，末尾留着未熄的灯芯。',
        options: [
            {
                id: 'preserve_record',
                label: '拓下记录',
                description: '获得淬炼材料 ×2。',
                type: 'material',
                amount: 2,
            },
            {
                id: 'keep_lamp',
                label: '留住灯芯',
                description: '获得 1 层塔内祝佑，挑战灵力消耗 -1。',
                type: 'blessing',
                amount: 1,
            },
        ],
    },
    3: {
        id: 'tower_herb_margin',
        title: '药圃余温',
        description: '旧药篓中仍有可用的草叶，旁边刻着守园人没有写完的名字。',
        options: [
            {
                id: 'collect_herbs',
                label: '收集草叶',
                description: '获得回气草 ×3。',
                type: 'herb',
                amount: 3,
            },
            {
                id: 'mark_path',
                label: '标记归路',
                description: '获得 1 层塔内祝佑，挑战灵力消耗 -1。',
                type: 'blessing',
                amount: 1,
            },
        ],
    },
    5: {
        id: 'tower_six_lamp_note',
        title: '六灯注脚',
        description: '六盏残灯指向不同方向，每一盏都记录着一次被取消的巡查。',
        options: [
            {
                id: 'take_lens',
                label: '取下灯罩',
                description: '获得淬炼材料 ×3。',
                type: 'material',
                amount: 3,
            },
            {
                id: 'follow_light',
                label: '循光前行',
                description: '获得 1 层塔内祝佑，挑战灵力消耗 -1。',
                type: 'blessing',
                amount: 1,
            },
        ],
    },
    8: {
        id: 'tower_witness_seal',
        title: '无名见证',
        description: '一枚失主的门印嵌在石缝中，像是在等待有人替它说出名字。',
        options: [
            {
                id: 'restore_seal',
                label: '修复门印',
                description: '获得淬炼材料 ×4。',
                type: 'material',
                amount: 4,
            },
            {
                id: 'carry_oath',
                label: '承下誓言',
                description: '获得 1 层塔内祝佑，挑战灵力消耗 -1。',
                type: 'blessing',
                amount: 1,
            },
        ],
    },
    10: {
        id: 'tower_nameless_archive',
        title: '未署名的归档',
        description: '档案钥打开了最后一格柜门。里面只有两种记录方式，都会留下不同的内门回响。',
        options: [
            {
                id: 'record_name',
                label: '补全姓名',
                description: '获得淬炼材料 ×5，并将「留名」写入内门档案。',
                type: 'material',
                amount: 5,
                flagId: 'tower_archive_branch_record',
                flagLabel: '留名档案',
            },
            {
                id: 'seal_archive',
                label: '封存残页',
                description: '获得 2 层塔内祝佑，并保留「封存」的内门线索。',
                type: 'blessing',
                amount: 2,
                flagId: 'tower_archive_branch_seal',
                flagLabel: '封存档案',
            },
        ],
    },
};

export class TowerSystem {
    public static floors(): readonly TowerFloorConfig[] {
        return TOWER_FLOORS;
    }

    public static floor(floor: number): TowerFloorConfig | null {
        return TOWER_FLOORS.find((item) => item.floor === floor) ?? null;
    }

    public static currentSpiritCost(save: LocalSave, floor: number): number {
        const config = this.floor(floor);
        if (!config) {
            return 0;
        }
        return Math.max(
            1,
            config.spiritCost - (save.tower.blessing > 0 ? 1 : 0),
        );
    }

    public static canChallenge(save: LocalSave, floor: number): TowerGateResult {
        const config = this.floor(floor);
        if (!config) {
            return { allowed: false, message: '该塔层不存在。', spiritCost: 0 };
        }
        const spiritCost = this.currentSpiritCost(save, floor);
        if (save.tower.activeFloor !== null) {
            return {
                allowed: false,
                message: '当前已有未结算的爬塔挑战。',
                spiritCost,
            };
        }
        if (save.tower.activeAdventureId) {
            return {
                allowed: false,
                message: '请先处理当前塔中奇遇，再继续挑战。',
                spiritCost,
            };
        }
        if (
            floor <= save.tower.bestFloor ||
            save.tower.firstClearFloors.includes(floor)
        ) {
            return {
                allowed: false,
                message: '该层已通关，塔层不可重复挑战；装备请前往地图 PVE 挑战点。',
                spiritCost,
            };
        }
        if (floor > save.tower.bestFloor + 1) {
            return {
                allowed: false,
                message: `请先首次通关第 ${save.tower.bestFloor + 1} 层。`,
                spiritCost,
            };
        }
        if (
            getRealmRank(save.cultivation.realmId, save.cultivation.stage) <
            config.minStage
        ) {
            return {
                allowed: false,
                message: `需要达到${getRealmStageLabel('qi_refining', config.minStage)}方可挑战。`,
                spiritCost,
            };
        }
        if (!SaveManager.isChapterComplete(save, config.requiredChapter)) {
            return {
                allowed: false,
                message: `需先完成主线 ${config.requiredChapter}。`,
                spiritCost,
            };
        }
        if (
            config.trialRequired &&
            save.cultivationGoal.trialState !== 'cleared'
        ) {
            return {
                allowed: false,
                message: '需先通过凝境试炼。',
                spiritCost,
            };
        }
        if (save.cultivation.spirit < spiritCost) {
            return {
                allowed: false,
                message: `灵力不足，挑战需要 ${spiritCost} 点灵力。`,
                spiritCost,
            };
        }
        return { allowed: true, message: '可挑战。', spiritCost };
    }

    public static begin(save: LocalSave, floor: number): TowerActionResult {
        const gate = this.canChallenge(save, floor);
        const config = this.floor(floor);
        if (!gate.allowed || !config) {
            return { success: false, message: gate.message, floor };
        }
        save.cultivation.spirit -= gate.spiritCost;
        const blessingUsed = save.tower.blessing > 0;
        if (blessingUsed) {
            save.tower.blessing -= 1;
        }
        save.tower.activeFloor = floor;
        TelemetryService.record(save, 'tower.challenge_started', {
            floor,
            spiritCost: gate.spiritCost,
            blessingUsed,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `踏入无名塔第 ${floor} 层，消耗 ${gate.spiritCost} 点灵力${blessingUsed ? '（消耗 1 层塔内祝佑）' : ''}。`,
            floor,
            enemyId: config.enemyId,
        };
    }

    public static settle(save: LocalSave, victory: boolean): TowerActionResult {
        const floor = save.tower.activeFloor;
        if (floor === null) {
            return { success: false, message: '当前没有进行中的爬塔挑战。' };
        }
        const config = this.floor(floor);
        save.tower.activeFloor = null;
        if (!config) {
            SaveManager.save(save);
            return { success: false, message: '塔层配置已失效。', floor };
        }

        if (!victory) {
            TelemetryService.record(save, 'tower.challenge_failed', { floor });
            TelemetryService.record(save, 'tower_floor_result', {
                floor,
                firstClear: false,
                victory: false,
                lingShi: 0,
                material: 0,
            });
            SaveManager.save(save);
            return {
                success: false,
                message: `第 ${floor} 层挑战失败，已记录敌方意图；灵力消耗不返还。`,
                floor,
            };
        }

        const firstClear =
            save.tower.firstClearFloors.indexOf(floor) < 0 &&
            floor > save.tower.bestFloor;
        if (!firstClear) {
            TelemetryService.record(save, 'tower.challenge_blocked_duplicate', {
                floor,
            });
            SaveManager.save(save);
            return {
                success: false,
                message: `第 ${floor} 层已通关，塔层不可重复领取奖励；装备请前往地图 PVE 挑战点。`,
                floor,
                firstClear: false,
            };
        }
        let rewardEquipmentId = '';
        let equipmentRewards: TowerGrantedEquipment[] = [];
        let itemRewards: TowerGrantedItem[] = [];
        let rewardFlags: string[] = [];
        let forgeRecommendation: ForgeRecommendation | null = null;
        if (firstClear) {
            save.tower.firstClearFloors.push(floor);
            save.tower.firstClearFloors.sort((left, right) => left - right);
            save.tower.bestFloor = Math.max(save.tower.bestFloor, floor);
            save.tower.currentFloor = Math.min(10, floor + 1);
            EconomySystem.grantLingShi(
                save,
                config.lingShi,
                'tower_first_clear',
            );
            save.cultivation.spirit = Math.min(
                save.cultivation.spiritCap,
                save.cultivation.spirit + config.spiritRefund,
            );
            SaveManager.addInventory(save, 'tempering_material', config.material);
            itemRewards = this.grantItemRewards(save, config.itemRewards);
            rewardFlags = this.grantFlagRewards(save, config);
            equipmentRewards = this.grantFirstClearEquipmentRewards(
                save,
                config,
            );
            rewardEquipmentId = equipmentRewards[0]?.id ?? '';
            const adventure = ADVENTURE_BY_FLOOR[floor];
            if (adventure) {
                save.tower.activeAdventureId = adventure.id;
            }
            if (floor === 4) {
                forgeRecommendation = EquipmentForgeSystem.recommendOnce(
                    save,
                    'tower_floor_4',
                );
            }
            if (!forgeRecommendation && rewardEquipmentId) {
                forgeRecommendation = EquipmentForgeSystem.recommendOnce(
                    save,
                    'quality_equipment',
                    { equipmentId: rewardEquipmentId },
                );
            }
        }

        const equipmentName = equipmentRewards
            .map((reward) => reward.name)
            .join('、');
        const rewardEquipmentTemplateId =
            equipmentRewards[0]?.templateId ?? '';
        TelemetryService.record(save, 'tower.challenge_settled', {
            floor,
            firstClear,
            lingShi: firstClear ? config.lingShi : 0,
            material: config.material,
            rewardEquipmentTemplateId: rewardEquipmentTemplateId || 'none',
            rewardEquipmentTemplateIds: equipmentRewards
                .map((reward) => reward.templateId)
                .join(',') || 'none',
            rewardEquipmentCount: equipmentRewards.length,
            itemRewardCount: itemRewards.reduce(
                (total, reward) => total + reward.count,
                0,
            ),
            rewardFlagCount: rewardFlags.length,
            forgeRecommendation: forgeRecommendation?.trigger ?? 'none',
        });
        TelemetryService.record(save, 'tower_floor_result', {
            floor,
            firstClear,
            victory: true,
            spiritCost: config.spiritCost,
            lingShi: firstClear ? config.lingShi : 0,
            material: config.material,
            rewardEquipment: equipmentRewards.length > 0,
            rewardEquipmentTemplateId: rewardEquipmentTemplateId || 'none',
            rewardEquipmentTemplateIds: equipmentRewards
                .map((reward) => reward.templateId)
                .join(',') || 'none',
            rewardEquipmentCount: equipmentRewards.length,
            itemRewardCount: itemRewards.reduce(
                (total, reward) => total + reward.count,
                0,
            ),
            rewardFlagCount: rewardFlags.length,
            forgeRecommendation: forgeRecommendation?.trigger ?? 'none',
        });
        const rewardSuffix = [
            equipmentName,
            ...itemRewards.map((reward) =>
                `${reward.name} ×${reward.count}`,
            ),
            ...rewardFlags,
        ].filter(Boolean).join('、');
        SaveManager.save(save);
        return {
            success: true,
            message: `首次通关第 ${floor} 层，获得 ${config.lingShi} 灵石、淬炼材料 ×${config.material}${rewardSuffix ? `、${rewardSuffix}` : ''}。塔层不会重新开放，装备请前往地图 PVE 挑战点获取。`,
            floor,
            firstClear,
            lingShi: firstClear ? config.lingShi : 0,
            material: config.material,
            rewardEquipmentName: equipmentName || undefined,
            rewardEquipmentTemplateId: rewardEquipmentTemplateId || undefined,
            rewardEquipmentNames: equipmentRewards.length > 0
                ? equipmentRewards.map((reward) => reward.name)
                : undefined,
            rewardEquipmentTemplateIds: equipmentRewards.length > 0
                ? equipmentRewards.map((reward) => reward.templateId)
                : undefined,
            itemRewards: itemRewards.length > 0 ? itemRewards : undefined,
            rewardFlags: rewardFlags.length > 0 ? rewardFlags : undefined,
            forgeRecommendation: forgeRecommendation ?? undefined,
        };
    }

    public static activeAdventure(save: LocalSave): TowerAdventure | null {
        const id = save.tower.activeAdventureId;
        if (!id) {
            return null;
        }
        const floors = Object.keys(ADVENTURE_BY_FLOOR);
        for (let index = 0; index < floors.length; index += 1) {
            const adventure = ADVENTURE_BY_FLOOR[Number(floors[index])];
            if (adventure.id === id) {
                return adventure;
            }
        }
        return null;
    }

    public static resolveAdventure(
        save: LocalSave,
        optionId: string,
    ): TowerActionResult {
        const adventure = this.activeAdventure(save);
        if (!adventure) {
            return { success: false, message: '当前没有待处理的塔中奇遇。' };
        }
        const option = adventure.options.find((item) => item.id === optionId);
        if (!option) {
            return { success: false, message: '该奇遇选项不存在。' };
        }
        if (option.type === 'material') {
            SaveManager.addInventory(save, 'tempering_material', option.amount);
        } else if (option.type === 'herb') {
            SaveManager.addInventory(save, 'homegrown_herb', option.amount);
        } else {
            save.tower.blessing = Math.min(3, save.tower.blessing + option.amount);
        }
        if (option.flagId) {
            save.flags[option.flagId] = true;
        }
        save.tower.adventureHistory.push(`${adventure.id}:${option.id}`);
        save.tower.adventureHistory = Array.from(
            new Set(save.tower.adventureHistory),
        );
        save.tower.activeAdventureId = null;
        TelemetryService.record(save, 'tower.adventure_resolved', {
            adventureId: adventure.id,
            optionId,
            amount: option.amount,
            branch: option.flagId ?? 'none',
        });
        SaveManager.save(save);
        const rewardMessage = option.type === 'blessing'
            ? `获得塔内祝佑，下一次挑战灵力消耗 -1（库存 ${save.tower.blessing} 层）。`
            : option.description;
        const branchMessage = option.flagLabel
            ? `已记录「${option.flagLabel}」。`
            : '';
        return {
            success: true,
            message: `${rewardMessage}${branchMessage ? ` ${branchMessage}` : ''}`,
        };
    }

    public static firstClearLingShiTotal(): number {
        return TOWER_FLOORS.reduce((total, floor) => total + floor.lingShi, 0);
    }

    public static firstClearRewardSummary(config: TowerFloorConfig): string {
        const rewards = [
            `灵石 ${config.lingShi}`,
            `淬炼砂 ×${config.material}`,
        ];
        firstClearEquipmentTemplateIds(config).forEach((templateId) => {
            const template = EQUIPMENT_TEMPLATES[templateId];
            if (template) {
                rewards.push(template.name);
            }
        });
        (config.itemRewards ?? []).forEach((reward) => {
            const item = ITEM_DEFINITIONS[reward.itemId];
            rewards.push(`${item?.name ?? reward.itemId} ×${reward.count}`);
        });
        (config.flagRewards ?? []).forEach((reward) => {
            rewards.push(reward.label);
        });
        return rewards.join('、');
    }

    public static archiveBranchSummary(save: LocalSave): string {
        if (save.flags.tower_archive_branch_record === true) {
            return '档案分支：留名档案';
        }
        if (save.flags.tower_archive_branch_seal === true) {
            return '档案分支：封存档案';
        }
        return '';
    }

    private static grantItemRewards(
        save: LocalSave,
        rewards: readonly TowerItemReward[] | undefined,
    ): TowerGrantedItem[] {
        return (rewards ?? [])
            .filter(
                (reward) =>
                    reward.itemId &&
                    Number.isFinite(reward.count) &&
                    reward.count > 0,
            )
            .map((reward) => {
                const count = Math.floor(reward.count);
                SaveManager.addInventory(save, reward.itemId, count);
                return {
                    itemId: reward.itemId,
                    count,
                    name: ITEM_DEFINITIONS[reward.itemId]?.name ?? reward.itemId,
                };
            });
    }

    private static grantFirstClearEquipmentRewards(
        save: LocalSave,
        config: TowerFloorConfig,
    ): TowerGrantedEquipment[] {
        const rewards: TowerGrantedEquipment[] = [];
        firstClearEquipmentTemplateIds(config).forEach((templateId) => {
            const equipment = EquipmentForgeSystem.createEquipment(
                save,
                templateId,
            );
            if (!equipment) {
                return;
            }
            save.equipment.push(equipment);
            rewards.push({
                id: equipment.id,
                templateId: equipment.templateId,
                name: equipment.name,
            });
        });
        const expectedBonusIds = config.bonusRewardTemplateIds ?? [];
        const allBonusGranted =
            expectedBonusIds.length > 0 &&
            expectedBonusIds.every((templateId) =>
                rewards.some((reward) => reward.templateId === templateId),
            );
        if (config.bonusRewardGrantFlag && allBonusGranted) {
            save.flags[config.bonusRewardGrantFlag] = true;
        }
        return rewards;
    }

    private static grantFlagRewards(
        save: LocalSave,
        config: TowerFloorConfig,
    ): string[] {
        return (config.flagRewards ?? [])
            .filter((reward) => Boolean(reward.flagId))
            .map((reward) => {
                save.flags[reward.flagId] = true;
                return reward.label;
            });
    }

}
