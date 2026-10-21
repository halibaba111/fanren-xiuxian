import { LocalSave } from './StoryTypes';
import { SaveManager } from './SaveManager';
import { TelemetryService } from './TelemetryService';

export interface EconomyResult {
    success: boolean;
    message: string;
    lingShiDelta?: number;
    itemId?: string;
    itemCount?: number;
}

export interface MarketOffer {
    id: string;
    name: string;
    cost: number;
    itemId: string;
    count: number;
    limitPerRound: number;
    description: string;
}

const CULTIVATION_AD_LIMIT = 3;
const CULTIVATION_AD_GAIN = 15;
const CULTIVATION_AD_SPIRIT = 20;
const COMMISSION_REWARD_AD_LIMIT = 3;
const GARDEN_START_COST = 4;
const GARDEN_TEND_SPIRIT_COST = 3;
const HERBS_PER_HARVEST = 2;
const GARDEN_AD_BONUS_HERBS = 1;
const HERBS_PER_POWDER = 2;
const HERB_SELL_PRICE = 2;
const HARVEST_MATERIAL_INTERVAL = 4;

export const MARKET_OFFERS: readonly MarketOffer[] = [
    {
        id: 'market_hui_qi_powder',
        name: '回气散',
        cost: 10,
        itemId: 'hui_qi_powder',
        count: 1,
        limitPerRound: 3,
        description: '战斗外恢复 8 点灵力。',
    },
    {
        id: 'market_tempering_material',
        name: '淬炼材料',
        cost: 14,
        itemId: 'tempering_material',
        count: 1,
        limitPerRound: 2,
        description: '温养或重淬装备的基础材料。',
    },
] as const;

function todayKey(now = new Date()): string {
    const year = now.getFullYear();
    const monthValue = now.getMonth() + 1;
    const dateValue = now.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : String(monthValue);
    const date = dateValue < 10 ? `0${dateValue}` : String(dateValue);
    return `${year}-${month}-${date}`;
}

export class EconomySystem {
    public static getLingShi(save: LocalSave): number {
        return Math.max(0, Math.floor(Number(save.flags.ling_shi ?? 0)));
    }

    public static canAfford(save: LocalSave, amount: number): boolean {
        return this.getLingShi(save) >= Math.max(0, Math.floor(amount));
    }

    public static grantLingShi(
        save: LocalSave,
        amount: number,
        source = 'unknown',
    ): number {
        const granted = Math.max(0, Math.floor(amount));
        save.flags.ling_shi = this.getLingShi(save) + granted;
        if (granted > 0) {
            TelemetryService.record(save, 'currency_flow', {
                direction: 'in',
                source,
                amount: granted,
                balance: this.getLingShi(save),
            });
        }
        return granted;
    }

    public static spendLingShi(
        save: LocalSave,
        amount: number,
        target = 'unknown',
    ): boolean {
        const cost = Math.max(0, Math.floor(amount));
        if (!this.canAfford(save, cost)) {
            return false;
        }
        save.flags.ling_shi = this.getLingShi(save) - cost;
        if (cost > 0) {
            TelemetryService.record(save, 'currency_flow', {
                direction: 'out',
                target,
                amount: cost,
                balance: this.getLingShi(save),
            });
        }
        return true;
    }

    public static marketRoundKey(save: LocalSave): string {
        const chapterCount = save.completedChapters.length;
        const towerSegment = Math.floor(save.tower.bestFloor / 3);
        return [
            save.cultivation.realmId,
            save.cultivation.stage,
            chapterCount,
            towerSegment,
        ].join(':');
    }

    public static marketPurchasedCount(
        save: LocalSave,
        offerId: string,
    ): number {
        const key = `${this.marketRoundKey(save)}:${offerId}`;
        return Math.max(
            0,
            Math.floor(Number(save.economy.marketPurchaseCounts[key] ?? 0)),
        );
    }

    public static marketRemaining(
        save: LocalSave,
        offerId: string,
    ): number {
        const offer = MARKET_OFFERS.find((item) => item.id === offerId);
        if (!offer) {
            return 0;
        }
        return Math.max(
            0,
            offer.limitPerRound - this.marketPurchasedCount(save, offerId),
        );
    }

    public static resetDailyLimits(save: LocalSave, now = new Date()): void {
        const key = todayKey(now);
        if (save.economy.dayKey === key) {
            return;
        }
        save.economy.dayKey = key;
        save.economy.cultivationAdCount = 0;
        save.economy.forgeMaterialAdClaimed = false;
        save.economy.commissionRewardAdCount = 0;
        save.economy.commissionRefreshCount = 0;
    }

    public static cultivationAdRemaining(save: LocalSave): number {
        this.resetDailyLimits(save);
        return Math.max(
            0,
            CULTIVATION_AD_LIMIT - save.economy.cultivationAdCount,
        );
    }

    public static cultivationAdUnavailableReason(save: LocalSave): string | null {
        this.resetDailyLimits(save);
        if (save.cultivation.cultivation >= save.cultivation.cultivationCap) {
            return '修为已圆满，静修助益不会继续累加。请完成当前突破目标。';
        }
        if (save.economy.cultivationAdCount >= CULTIVATION_AD_LIMIT) {
            return '今日静修助益已用完，明日可再次领取。';
        }
        return null;
    }

    public static claimCultivationAd(save: LocalSave): EconomyResult {
        const unavailable = this.cultivationAdUnavailableReason(save);
        if (unavailable) {
            return {
                success: false,
                message: unavailable,
            };
        }
        const cultivation = save.cultivation;
        const before = cultivation.cultivation;
        cultivation.cultivation = Math.min(
            cultivation.cultivationCap,
            cultivation.cultivation + CULTIVATION_AD_GAIN,
        );
        cultivation.spirit = Math.min(
            cultivation.spiritCap,
            cultivation.spirit + CULTIVATION_AD_SPIRIT,
        );
        save.economy.cultivationAdCount += 1;
        TelemetryService.record(save, 'economy.cultivation_ad_claimed', {
            gainedCultivation: cultivation.cultivation - before,
            remaining: CULTIVATION_AD_LIMIT - save.economy.cultivationAdCount,
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'cultivation_support',
            outcome: 'success',
            rewardGranted: true,
            remaining: CULTIVATION_AD_LIMIT - save.economy.cultivationAdCount,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `静修助益生效：修为 +${cultivation.cultivation - before}，灵力 +${CULTIVATION_AD_SPIRIT}。`,
        };
    }

    public static forgeMaterialAdUnavailableReason(save: LocalSave): string | null {
        this.resetDailyLimits(save);
        return save.economy.forgeMaterialAdClaimed
            ? '今日淬炼材料助益已领取。'
            : null;
    }

    public static claimForgeMaterialAd(save: LocalSave): EconomyResult {
        const unavailable = this.forgeMaterialAdUnavailableReason(save);
        if (unavailable) {
            return {
                success: false,
                message: unavailable,
            };
        }
        SaveManager.addInventory(save, 'tempering_material', 3);
        save.economy.forgeMaterialAdClaimed = true;
        TelemetryService.record(save, 'economy.forge_material_ad_claimed', {
            count: 3,
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'forge_material_daily',
            outcome: 'success',
            rewardGranted: true,
            remaining: 0,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: '获得淬炼材料 ×3。',
            itemId: 'tempering_material',
            itemCount: 3,
        };
    }

    public static commissionRewardAdRemaining(save: LocalSave): number {
        this.resetDailyLimits(save);
        return Math.max(
            0,
            COMMISSION_REWARD_AD_LIMIT - save.economy.commissionRewardAdCount,
        );
    }

    public static commissionRewardAdUnavailableReason(
        save: LocalSave,
        commissionId: string,
    ): string | null {
        this.resetDailyLimits(save);
        if (
            SaveManager.hasClaimedAd(
                save,
                `commission_reward_double:${commissionId}`,
            )
        ) {
            return '这份委托的奖励已经翻倍。';
        }
        if (save.economy.commissionRewardAdCount >= COMMISSION_REWARD_AD_LIMIT) {
            return '今日委托奖励翻倍次数已用完，明日可再次领取。';
        }
        return null;
    }

    public static claimCommissionRewardAd(
        save: LocalSave,
        commissionId: string,
        lingShi: number,
        material: number,
        herbs: number,
    ): EconomyResult {
        const unavailable = this.commissionRewardAdUnavailableReason(
            save,
            commissionId,
        );
        if (unavailable) {
            return { success: false, message: unavailable };
        }

        const adId = `commission_reward_double:${commissionId}`;
        const grantedLingShi = Math.max(0, Math.floor(lingShi));
        const grantedMaterial = Math.max(0, Math.floor(material));
        const grantedHerbs = Math.max(0, Math.floor(herbs));
        EconomySystem.grantLingShi(
            save,
            grantedLingShi,
            'commission_reward_ad_double',
        );
        SaveManager.addInventory(
            save,
            'tempering_material',
            grantedMaterial,
        );
        SaveManager.addInventory(save, 'homegrown_herb', grantedHerbs);
        save.economy.commissionRewardAdCount += 1;
        SaveManager.claimAd(save, adId);
        TelemetryService.record(save, 'economy.commission_reward_ad_claimed', {
            commissionId,
            lingShi: grantedLingShi,
            material: grantedMaterial,
            herbs: grantedHerbs,
            remaining:
                COMMISSION_REWARD_AD_LIMIT -
                save.economy.commissionRewardAdCount,
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'commission_reward_double',
            outcome: 'success',
            rewardGranted: true,
            commissionId,
        });
        SaveManager.save(save);
        return {
            success: true,
            message:
                `结算翻倍成功：额外获得 ${grantedLingShi} 灵石、` +
                `淬炼材料 ×${grantedMaterial}、回气草 ×${grantedHerbs}。` +
                `今日剩余 ${COMMISSION_REWARD_AD_LIMIT - save.economy.commissionRewardAdCount} 次。`,
        };
    }

    public static buyMarketItem(
        save: LocalSave,
        offerId: string,
        quantity = 1,
    ): EconomyResult {
        const offer = MARKET_OFFERS.find((item) => item.id === offerId);
        const count = Math.max(1, Math.floor(quantity));
        if (!offer) {
            return { success: false, message: '坊市中没有该物品。' };
        }
        const remaining = this.marketRemaining(save, offerId);
        if (remaining <= 0) {
            return {
                success: false,
                message: `${offer.name}本轮已售罄，推进修行阶段后会补货。`,
            };
        }
        if (count > remaining) {
            return {
                success: false,
                message: `${offer.name}本轮还可购买 ${remaining} 件。`,
            };
        }
        const cost = offer.cost * count;
        if (!this.spendLingShi(save, cost, `market:${offerId}`)) {
            return {
                success: false,
                message: `灵石不足，需要 ${cost} 灵石。`,
            };
        }
        SaveManager.addInventory(save, offer.itemId, offer.count * count);
        const purchaseKey = `${this.marketRoundKey(save)}:${offerId}`;
        save.economy.marketPurchaseCounts[purchaseKey] =
            this.marketPurchasedCount(save, offerId) + count;
        TelemetryService.record(save, 'economy.market_purchase', {
            offerId,
            quantity: count,
            cost,
            remaining: this.marketRemaining(save, offerId),
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `购入${offer.name} ×${offer.count * count}。`,
            lingShiDelta: -cost,
            itemId: offer.itemId,
            itemCount: offer.count * count,
        };
    }

    public static tendHerbPlot(save: LocalSave): EconomyResult {
        const plot = save.herbPlot;
        if (plot.stage === 0) {
            if (!this.spendLingShi(save, GARDEN_START_COST, 'garden_seed')) {
                return {
                    success: false,
                    message: `开垦药圃需要 ${GARDEN_START_COST} 灵石。`,
                };
            }
            plot.stage = 1;
            plot.tended += 1;
            TelemetryService.record(save, 'economy.garden_started', {
                cost: GARDEN_START_COST,
            });
            SaveManager.save(save);
            return {
                success: true,
                message: '药圃已开垦，继续照料可催熟回气草。',
                lingShiDelta: -GARDEN_START_COST,
            };
        }

        if (plot.stage === 1 || plot.stage === 2) {
            if (save.cultivation.spirit < GARDEN_TEND_SPIRIT_COST) {
                return {
                    success: false,
                    message: `灵力不足，照料药圃需要 ${GARDEN_TEND_SPIRIT_COST} 点灵力。`,
                };
            }
            save.cultivation.spirit -= GARDEN_TEND_SPIRIT_COST;
            plot.stage = (plot.stage + 1) as 2 | 3;
            plot.tended += 1;
            const grantedInsight = plot.stage === 2;
            if (grantedInsight) {
                plot.insightCharge = 1;
            }
            TelemetryService.record(save, 'economy.garden_tended', {
                stage: plot.stage,
                spiritCost: GARDEN_TEND_SPIRIT_COST,
                grantedInsight,
            });
            SaveManager.save(save);
            return {
                success: true,
                message: plot.stage === 3
                    ? '回气草已经成熟，可以采收。'
                    : '药圃生机渐盛，下一场战斗洞察 +1；再照料一次即可成熟。',
            };
        }

        SaveManager.addInventory(save, 'homegrown_herb', HERBS_PER_HARVEST);
        plot.stage = 0;
        plot.tended += 1;
        plot.harvestCount += 1;
        const bonusMaterial =
            plot.harvestCount % HARVEST_MATERIAL_INTERVAL === 0 ? 1 : 0;
        if (bonusMaterial > 0) {
            SaveManager.addInventory(save, 'tempering_material', bonusMaterial);
        }
        TelemetryService.record(save, 'economy.garden_harvested', {
            herbs: HERBS_PER_HARVEST,
            bonusMaterial,
            harvestCount: plot.harvestCount,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: bonusMaterial > 0
                ? `采得回气草 ×${HERBS_PER_HARVEST}，并发现淬炼材料 ×${bonusMaterial}。`
                : `采得回气草 ×${HERBS_PER_HARVEST}。`,
            itemId: 'homegrown_herb',
            itemCount: HERBS_PER_HARVEST,
        };
    }

    public static gardenAdUnavailableReason(save: LocalSave): string | null {
        return save.herbPlot.stage === 0
            ? '药圃还没有播种，先完成一次播种。'
            : null;
    }

    public static claimGardenAd(save: LocalSave): EconomyResult {
        const unavailable = this.gardenAdUnavailableReason(save);
        if (unavailable) {
            return { success: false, message: unavailable };
        }

        const plot = save.herbPlot;
        const previousStage = plot.stage;
        const herbs = HERBS_PER_HARVEST + GARDEN_AD_BONUS_HERBS;
        SaveManager.addInventory(save, 'homegrown_herb', herbs);
        plot.stage = 0;
        plot.tended += 1;
        plot.harvestCount += 1;
        const bonusMaterial =
            plot.harvestCount % HARVEST_MATERIAL_INTERVAL === 0 ? 1 : 0;
        if (bonusMaterial > 0) {
            SaveManager.addInventory(save, 'tempering_material', bonusMaterial);
        }
        TelemetryService.record(save, 'economy.garden_ad_completed', {
            previousStage,
            herbs,
            bonusHerb: GARDEN_AD_BONUS_HERBS,
            bonusMaterial,
            harvestCount: plot.harvestCount,
        });
        TelemetryService.record(save, 'ad_result', {
            placement: 'garden_instant_care',
            outcome: 'success',
            rewardGranted: true,
            herbs,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: bonusMaterial > 0
                ? `广告照料完成，直接收获回气草 ×${herbs}，并发现淬炼材料 ×${bonusMaterial}。`
                : `广告照料完成，直接收获回气草 ×${herbs}（额外 +${GARDEN_AD_BONUS_HERBS}）。`,
            itemId: 'homegrown_herb',
            itemCount: herbs,
        };
    }

    public static consumeGardenInsight(save: LocalSave): number {
        const granted = Math.max(
            0,
            Math.min(1, Math.floor(Number(save.herbPlot.insightCharge ?? 0))),
        );
        if (granted <= 0) {
            return 0;
        }
        save.herbPlot.insightCharge = 0;
        TelemetryService.record(save, 'economy.garden_insight_consumed', {
            amount: granted,
        });
        SaveManager.save(save);
        return granted;
    }

    public static craftHuiQiPowder(
        save: LocalSave,
        requestedCount = 1,
    ): EconomyResult {
        const available = Math.max(0, Number(save.inventory.homegrown_herb ?? 0));
        const count = Math.max(
            0,
            Math.min(
                Math.floor(requestedCount),
                Math.floor(available / HERBS_PER_POWDER),
            ),
        );
        if (count <= 0) {
            return {
                success: false,
                message: `回气散需要 ${HERBS_PER_POWDER} 株回气草。`,
            };
        }
        SaveManager.addInventory(
            save,
            'homegrown_herb',
            -count * HERBS_PER_POWDER,
        );
        SaveManager.addInventory(save, 'hui_qi_powder', count);
        TelemetryService.record(save, 'economy.powder_crafted', {
            count,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `制成回气散 ×${count}。`,
            itemId: 'hui_qi_powder',
            itemCount: count,
        };
    }

    public static sellHerbs(save: LocalSave, requestedCount = 1): EconomyResult {
        const available = Math.max(0, Number(save.inventory.homegrown_herb ?? 0));
        const count = Math.max(
            0,
            Math.min(Math.floor(requestedCount), available),
        );
        if (count <= 0) {
            return { success: false, message: '没有可出售的回气草。' };
        }
        const gained = count * HERB_SELL_PRICE;
        SaveManager.addInventory(save, 'homegrown_herb', -count);
        this.grantLingShi(save, gained, 'herb_sale');
        TelemetryService.record(save, 'economy.herb_sold', {
            count,
            gained,
        });
        SaveManager.save(save);
        return {
            success: true,
            message: `出售回气草 ×${count}，获得 ${gained} 灵石。`,
            lingShiDelta: gained,
        };
    }
}
