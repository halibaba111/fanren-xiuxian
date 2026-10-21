import { EconomySystem } from './EconomySystem';
import { SaveManager } from './SaveManager';
import { LocalSave } from './StoryTypes';
import { TelemetryService } from './TelemetryService';
import { getRealmRank } from './RealmProgression';

export interface CommissionConfig {
    id: string;
    title: string;
    description: string;
    enemyId: string;
    spiritCost: number;
    lingShi: number;
    material: number;
    herbs: number;
}

export interface CommissionResult {
    success: boolean;
    message: string;
    commissionId?: string;
    enemyId?: string;
}

const REFRESH_COST = 6;
const HERB_DELIVERY_COST = 2;
const HERB_DELIVERY_MATERIAL_REWARD = 1;

export const COMMISSIONS: readonly CommissionConfig[] = [
    {
        id: 'commission_investigation',
        title: '残卷寻踪',
        description: '查明藏经楼残卷为何会在夜里自行翻页。',
        enemyId: 'commission_investigation',
        spiritCost: 8,
        lingShi: 9,
        material: 1,
        herbs: 1,
    },
    {
        id: 'commission_escort',
        title: '山道护送',
        description: '护送药篓穿过被雨雾遮住的后山山道。',
        enemyId: 'commission_escort',
        spiritCost: 10,
        lingShi: 12,
        material: 1,
        herbs: 2,
    },
    {
        id: 'commission_clearing',
        title: '荒园清障',
        description: '清除荒园里会汲取灵力的病根。',
        enemyId: 'commission_clearing',
        spiritCost: 12,
        lingShi: 16,
        material: 2,
        herbs: 2,
    },
] as const;

function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

export class CommissionSystem {
    public static list(save: LocalSave): readonly CommissionConfig[] {
        this.ensureAvailable(save);
        return COMMISSIONS.filter(
            (commission) =>
                save.commissions.availableIds.indexOf(commission.id) >= 0,
        );
    }

    public static commission(id: string): CommissionConfig | null {
        return COMMISSIONS.find((item) => item.id === id) ?? null;
    }

    public static accessMessage(save: LocalSave): string | null {
        if (
            getRealmRank(save.cultivation.realmId, save.cultivation.stage) < 5
        ) {
            return '炼气五层后开放外院委托。';
        }
        if (!SaveManager.isChapterComplete(save, 'qi_05')) {
            return '完成第五章主线后，外院才会委托你处理后续事务。';
        }
        return null;
    }

    public static refresh(save: LocalSave): CommissionResult {
        const access = this.accessMessage(save);
        if (access) {
            return { success: false, message: access };
        }
        if (save.commissions.activeCommissionId) {
            return {
                success: false,
                message: '请先结算当前委托，再刷新新的委托。',
            };
        }
        EconomySystem.resetDailyLimits(save);
        const requiresCost = save.economy.commissionRefreshCount > 0;
        if (
            requiresCost &&
            !EconomySystem.spendLingShi(
                save,
                REFRESH_COST,
                'commission_refresh',
            )
        ) {
            return {
                success: false,
                message: `灵石不足，刷新委托需要 ${REFRESH_COST} 灵石。`,
            };
        }
        save.economy.commissionRefreshCount += 1;
        save.commissions.refreshCount += 1;
        save.commissions.availableIds = COMMISSIONS.map((item) => item.id);
        TelemetryService.record(save, 'commission.refreshed', {
            paid: requiresCost,
            refreshCount: save.commissions.refreshCount,
        });
        TelemetryService.record(save, 'commission_result', {
            type: 'refresh',
            success: true,
            paid: requiresCost,
            refreshCount: save.commissions.refreshCount,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: requiresCost
                ? `委托已刷新，消耗 ${REFRESH_COST} 灵石。`
                : '今日首次刷新免费，委托已更新。',
        };
    }

    public static begin(
        save: LocalSave,
        commissionId: string,
    ): CommissionResult {
        const access = this.accessMessage(save);
        if (access) {
            return { success: false, message: access };
        }
        this.ensureAvailable(save);
        if (save.commissions.activeCommissionId) {
            return {
                success: false,
                message: '已有进行中的委托，请先完成或结算。',
            };
        }
        const commission = this.commission(commissionId);
        if (
            !commission ||
            save.commissions.availableIds.indexOf(commissionId) < 0
        ) {
            return { success: false, message: '该委托当前不可接取。' };
        }
        if (save.cultivation.spirit < commission.spiritCost) {
            return {
                success: false,
                message: `灵力不足，委托需要 ${commission.spiritCost} 点灵力。`,
            };
        }
        save.cultivation.spirit -= commission.spiritCost;
        save.commissions.activeCommissionId = commission.id;
        TelemetryService.record(save, 'commission.started', {
            commissionId,
            spiritCost: commission.spiritCost,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `已接取「${commission.title}」。`,
            commissionId,
            enemyId: commission.enemyId,
        };
    }

    public static settle(save: LocalSave, victory: boolean): CommissionResult {
        const commissionId = save.commissions.activeCommissionId;
        if (!commissionId) {
            return { success: false, message: '当前没有进行中的委托。' };
        }
        const commission = this.commission(commissionId);
        save.commissions.activeCommissionId = null;
        if (!commission) {
            SaveManager.save(save);
            return { success: false, message: '委托配置已失效。' };
        }
        if (!victory) {
            TelemetryService.record(save, 'commission.failed', { commissionId });
            TelemetryService.record(save, 'commission_result', {
                type: 'battle',
                commissionId,
                success: false,
                rewardLingShi: 0,
            });
            SaveManager.save(save);
            return {
                success: false,
                message: `「${commission.title}」未完成，已记录敌方招式。`,
                commissionId,
            };
        }
        save.commissions.availableIds = save.commissions.availableIds.filter(
            (id) => id !== commissionId,
        );
        save.commissions.completedIds = unique([
            ...save.commissions.completedIds,
            commissionId,
        ]);
        EconomySystem.grantLingShi(
            save,
            commission.lingShi,
            'commission_reward',
        );
        SaveManager.addInventory(
            save,
            'tempering_material',
            commission.material,
        );
        SaveManager.addInventory(save, 'homegrown_herb', commission.herbs);
        TelemetryService.record(save, 'commission.completed', {
            commissionId,
            lingShi: commission.lingShi,
            material: commission.material,
        });
        TelemetryService.record(save, 'commission_result', {
            type: 'battle',
            commissionId,
            success: true,
            rewardLingShi: commission.lingShi,
            refreshCount: save.commissions.refreshCount,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `完成「${commission.title}」，获得 ${commission.lingShi} 灵石、淬炼材料 ×${commission.material}、回气草 ×${commission.herbs}。`,
            commissionId,
        };
    }

    public static deliverHerbs(save: LocalSave): CommissionResult {
        const access = this.accessMessage(save);
        if (access) {
            return { success: false, message: access };
        }
        if (save.commissions.activeCommissionId) {
            return {
                success: false,
                message: '请先结算当前委托，再处理药圃交付。',
            };
        }
        const herbs = Math.max(
            0,
            Math.floor(Number(save.inventory.homegrown_herb ?? 0)),
        );
        if (herbs < HERB_DELIVERY_COST) {
            return {
                success: false,
                message: `药圃交付需要回气草 ×${HERB_DELIVERY_COST}。`,
            };
        }
        SaveManager.addInventory(
            save,
            'homegrown_herb',
            -HERB_DELIVERY_COST,
        );
        SaveManager.addInventory(
            save,
            'tempering_material',
            HERB_DELIVERY_MATERIAL_REWARD,
        );
        save.commissions.herbDeliveryCount += 1;
        save.flags.garden_delivery_clues = save.commissions.herbDeliveryCount;
        TelemetryService.record(save, 'commission.herb_delivery_completed', {
            herbCost: HERB_DELIVERY_COST,
            materialReward: HERB_DELIVERY_MATERIAL_REWARD,
            deliveryCount: save.commissions.herbDeliveryCount,
        });
        TelemetryService.record(save, 'commission_result', {
            type: 'herb_delivery',
            success: true,
            rewardMaterial: HERB_DELIVERY_MATERIAL_REWARD,
            deliveryCount: save.commissions.herbDeliveryCount,
        });
        SaveManager.save(save);
        return {
            success: true,
            message:
                `交付回气草 ×${HERB_DELIVERY_COST}，获得淬炼材料 ×${HERB_DELIVERY_MATERIAL_REWARD}。` +
                '守园人留下了一条后山药圃线索。',
        };
    }

    private static ensureAvailable(save: LocalSave): void {
        if (this.accessMessage(save) || save.commissions.availableIds.length > 0) {
            return;
        }
        save.commissions.availableIds = COMMISSIONS.map((item) => item.id);
    }
}
