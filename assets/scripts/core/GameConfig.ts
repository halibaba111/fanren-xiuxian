import {
    EquipmentQuality,
    EquipmentSlot,
    EquipmentStats,
} from './StoryTypes';

export interface BattleRules {
    insightCost: number;
    guardCost: number;
    guardCooldown: number;
    guardShieldDuration: number;
    insightAttackBonus: number;
    playerHpBase: number;
    playerHpBodyFactor: number;
    playerAttackBase: number;
    playerAttackStageFactor: number;
    playerDefenseBodyFactor: number;
    playerManaBase: number;
    playerManaInsightFactor: number;
    playerRecoveryBase: number;
    playerRecoveryInsightFactor: number;
    guardShieldBase: number;
    guardShieldDefenseFactor: number;
    guardShieldInsightFactor: number;
    defenseMitigationFactor: number;
    obscureMindThreshold: number;
    fatigueStartRound: number;
    fatigueInterval: number;
    fatigueStep: number;
    fatigueCap: number;
}

export const BATTLE_RULES: BattleRules = {
    insightCost: 4,
    guardCost: 3,
    guardCooldown: 2,
    guardShieldDuration: 2,
    insightAttackBonus: 0.55,
    playerHpBase: 100,
    playerHpBodyFactor: 1.2,
    playerAttackBase: 15,
    playerAttackStageFactor: 4,
    playerDefenseBodyFactor: 0.5,
    playerManaBase: 8,
    playerManaInsightFactor: 12,
    playerRecoveryBase: 4,
    playerRecoveryInsightFactor: 12,
    guardShieldBase: 12,
    guardShieldDefenseFactor: 0.65,
    guardShieldInsightFactor: 0.12,
    defenseMitigationFactor: 1,
    obscureMindThreshold: 58,
    fatigueStartRound: 6,
    fatigueInterval: 2,
    fatigueStep: 0.1,
    fatigueCap: 0.4,
};

export interface RefinementRule {
    fromLevel: number;
    lingShiCost: number;
    materialCost: number;
    statMultiplier: number;
}

export const REFINEMENT_RULES: readonly RefinementRule[] = [
    { fromLevel: 0, lingShiCost: 6, materialCost: 1, statMultiplier: 1.08 },
    { fromLevel: 1, lingShiCost: 12, materialCost: 1, statMultiplier: 1.17 },
    { fromLevel: 2, lingShiCost: 20, materialCost: 2, statMultiplier: 1.29 },
    { fromLevel: 3, lingShiCost: 20, materialCost: 2, statMultiplier: 1.4 },
    { fromLevel: 4, lingShiCost: 20, materialCost: 3, statMultiplier: 1.52 },
] as const;

export const QUALITY_LABELS: Record<EquipmentQuality, string> = {
    white: '朴品',
    green: '良品',
    blue: '精品',
    purple: '珍品',
    gold: '极品',
    red: '遗品',
};

export const QUALITY_RANK: Record<EquipmentQuality, number> = {
    white: 0,
    green: 1,
    blue: 2,
    purple: 3,
    gold: 4,
    red: 5,
};

export const QUALITY_BASE_ROLL_RANGE: Record<
    EquipmentQuality,
    readonly [number, number]
> = {
    white: [0.85, 0.95],
    green: [0.95, 1.05],
    blue: [1.05, 1.15],
    purple: [1.15, 1.28],
    gold: [1.28, 1.42],
    red: [1.42, 1.52],
};

export const QUALITY_COLORS: Record<EquipmentQuality, string> = {
    white: '#d6d9d4',
    green: '#73d89a',
    blue: '#72b9ff',
    purple: '#d192ff',
    gold: '#f1c85a',
    red: '#ef7773',
};

export const SLOT_LABELS: Record<EquipmentSlot, string> = {
    weapon: '武器',
    artifact: '法器',
    armor: '护身',
    head: '头冠',
    ring: '戒指',
    boots: '行履',
};

export const QUALITY_AFFIX_LIMIT: Record<EquipmentQuality, number> = {
    white: 0,
    green: 1,
    blue: 2,
    purple: 2,
    gold: 3,
    red: 3,
};

export const QUALITY_REFINE_CAP: Record<EquipmentQuality, number> = {
    white: 1,
    green: 2,
    blue: 3,
    purple: 4,
    gold: 5,
    red: 0,
};

export const REROLL_BASE_COST = 8;
export const REROLL_COST_CAP = 16;

export const QUALITY_SELL_BASE: Record<EquipmentQuality, number> = {
    white: 2,
    green: 4,
    blue: 7,
    purple: 12,
    gold: 28,
    red: 70,
};

export const QUALITY_SELL_CAP: Record<EquipmentQuality, number> = {
    white: 9,
    green: 16,
    blue: 30,
    purple: 54,
    gold: 92,
    red: 140,
};

export const EQUIPMENT_TEMPLATES: Record<
    string,
    {
        name: string;
        slot: EquipmentSlot;
        quality: EquipmentQuality;
        baseStats: EquipmentStats;
    }
> = {
    old_iron_sword: {
        name: '旧铁剑',
        slot: 'weapon',
        quality: 'green',
        baseStats: { attack: 12 },
    },
    tower_lamp_blade: {
        name: '灯台短刃',
        slot: 'weapon',
        quality: 'green',
        baseStats: { attack: 14 },
    },
    tower_wet_blade: {
        name: '湿页残刃',
        slot: 'weapon',
        quality: 'blue',
        baseStats: { attack: 18 },
    },
    tower_echo_talisman: {
        name: '回声灯符',
        slot: 'artifact',
        quality: 'blue',
        baseStats: { mana: 2, insight: 4 },
    },
    tower_guard_cloak: {
        name: '录庭护衣',
        slot: 'armor',
        quality: 'blue',
        baseStats: { defense: 12, health: 8 },
    },
    tower_ash_crown: {
        name: '档案遮面',
        slot: 'head',
        quality: 'blue',
        baseStats: { defense: 5, insight: 6 },
    },
    tower_name_talisman: {
        name: '留名印符',
        slot: 'artifact',
        quality: 'blue',
        baseStats: { mana: 1, insight: 5, mind: 3 },
    },
    tower_lamp_ring: {
        name: '六灯定踪环',
        slot: 'ring',
        quality: 'purple',
        baseStats: { mana: 3, spirit: 6 },
    },
    tower_six_lamp_ring: {
        name: '六灯回响环',
        slot: 'ring',
        quality: 'blue',
        baseStats: { mana: 2, spirit: 3, insight: 2 },
    },
    tower_record_cloak: {
        name: '录痕庭衣',
        slot: 'armor',
        quality: 'blue',
        baseStats: { defense: 15, health: 10, mana: 1 },
    },
    tower_blackroot_blade: {
        name: '黑根巡刃',
        slot: 'weapon',
        quality: 'blue',
        baseStats: { attack: 21, insight: 2 },
    },
    tower_archive_blade: {
        name: '主档巡刃',
        slot: 'weapon',
        quality: 'purple',
        baseStats: { attack: 26, mana: 2, insight: 3 },
    },
    tower_rain_boots: {
        name: '湿痕行履',
        slot: 'boots',
        quality: 'blue',
        baseStats: { health: 16, defense: 3 },
    },
    trial_nameless_seal: {
        name: '无名门印',
        slot: 'artifact',
        quality: 'purple',
        baseStats: { attack: 5, mana: 3, insight: 8 },
    },
};

export type ItemCategory = 'consumable' | 'material' | 'quest';

export interface ItemDefinition {
    name: string;
    category: ItemCategory;
    description: string;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
    tempering_material: {
        name: '淬炼砂',
        category: 'material',
        description: '用于温养装备与重淬词条。',
    },
    hui_qi_powder: {
        name: '回气散',
        category: 'consumable',
        description: '使用后恢复 8 点灵力。',
    },
    homegrown_herb: {
        name: '回气草',
        category: 'consumable',
        description: '可直接恢复灵力、制散、出售或交付委托。',
    },
    condensation_trial_clue: {
        name: '凝境试炼线索',
        category: 'quest',
        description: '无名塔第八层留下的灯录残页，是进入凝境试炼的凭证。',
    },
    archive_key: {
        name: '档案钥',
        category: 'quest',
        description: '无名门关的归档钥匙，会保留你在塔中的分支选择。',
    },
    gray_badge: {
        name: '灰色入山牌',
        category: 'quest',
        description: '外院入山时领到的空白灰牌，记录你最初的入门身份。',
    },
    qi_gathering_manual: {
        name: '引气手册',
        category: 'quest',
        description: '外院通用的引气课本，是后续修行记录的起点。',
    },
    nameless_ledger_fragment: {
        name: '无名账页残片',
        category: 'quest',
        description: '被潮气浸透的旧账页，保留着被抹去姓名的线索。',
    },
    lamp_copper_shard: {
        name: '铜灯碎片',
        category: 'quest',
        description: '缺口铜灯掉落的旧铜片，可与主线调查记录相互印证。',
    },
    herb_garden_note: {
        name: '药圃手记',
        category: 'quest',
        description: '药圃旧主留下的照料记录，关联外院药圃支线。',
    },
    nameless_stone: {
        name: '无名石',
        category: 'quest',
        description: '刻痕未尽的石片，保留着一段尚未归档的姓名记录。',
    },
    name_token: {
        name: '姓名牌',
        category: 'quest',
        description: '从封锁线中取回的名牌，是调查无名者去向的旁证。',
    },
    black_root_sample: {
        name: '黑根样本',
        category: 'quest',
        description: '药圃病根留下的样本，关联后续病影与潮影调查。',
    },
    awakened_copper_lamp: {
        name: '苏醒的铜灯',
        category: 'quest',
        description: '已经回应过真相的缺口铜灯，会保留主线选择的回响。',
    },
    tempering_stone: {
        name: '淬炼石样本',
        category: 'quest',
        description: '雨账残页夹带的旧石样本，作为归档线索保留，不消耗当前淬炼砂。',
    },
};

export interface EnemyProfile {
    id: string;
    name: string;
    maxHp: number;
    attack: number;
    intents: Array<
        'attack' | 'charge' | 'armor_break' | 'mana_drain' | 'obscure' | 'barrier'
    >;
}

export const ENEMY_PROFILES: Record<string, EnemyProfile> = {
    stage_qi01_01_wooden_puppet: {
        id: 'stage_qi01_01_wooden_puppet',
        name: '木傀考官',
        maxHp: 155,
        attack: 17,
        intents: ['attack', 'charge', 'attack'],
    },
    stage_qi02_01_nameless_guard: {
        id: 'stage_qi02_01_nameless_guard',
        name: '无面纸傀',
        maxHp: 190,
        attack: 20,
        intents: ['attack', 'mana_drain', 'attack'],
    },
    stage_qi03_memory_shell: {
        id: 'stage_qi03_memory_shell',
        name: '记忆壳',
        maxHp: 220,
        attack: 23,
        intents: ['barrier', 'attack', 'barrier'],
    },
    stage_qi04_record_warden: {
        id: 'stage_qi04_record_warden',
        name: '录痕守卫',
        maxHp: 245,
        attack: 25,
        intents: ['armor_break', 'attack', 'armor_break'],
    },
    stage_qi05_black_root: {
        id: 'stage_qi05_black_root',
        name: '黑根病影',
        maxHp: 270,
        attack: 27,
        intents: ['obscure', 'charge', 'attack', 'obscure'],
    },
    tower_lamp_platform: {
        id: 'tower_lamp_platform',
        name: '灯影试台',
        maxHp: 220,
        attack: 24,
        intents: ['attack', 'charge', 'attack'],
    },
    tower_wet_corridor: {
        id: 'tower_wet_corridor',
        name: '湿页回廊守卫',
        maxHp: 270,
        attack: 27,
        intents: ['mana_drain', 'attack', 'mana_drain'],
    },
    tower_herb_guard: {
        id: 'tower_herb_guard',
        name: '药根守傀',
        maxHp: 315,
        attack: 30,
        intents: ['attack', 'armor_break', 'attack'],
    },
    tower_name_token: {
        id: 'tower_name_token',
        name: '无声姓名牌',
        maxHp: 365,
        attack: 34,
        intents: ['barrier', 'charge', 'attack', 'barrier'],
    },
    tower_six_lamp_shell: {
        id: 'tower_six_lamp_shell',
        name: '六灯记忆壳',
        maxHp: 420,
        attack: 38,
        intents: ['attack', 'mana_drain', 'charge', 'attack'],
    },
    tower_record_court: {
        id: 'tower_record_court',
        name: '录痕庭守关',
        maxHp: 480,
        attack: 42,
        intents: ['barrier', 'obscure', 'attack', 'barrier'],
    },
    tower_black_root: {
        id: 'tower_black_root',
        name: '黑根回声室',
        maxHp: 545,
        attack: 47,
        intents: ['armor_break', 'charge', 'attack'],
    },
    tower_patrol_blade: {
        id: 'tower_patrol_blade',
        name: '六灯巡刃',
        maxHp: 620,
        attack: 53,
        intents: ['obscure', 'charge', 'attack', 'obscure'],
    },
    tower_main_record: {
        id: 'tower_main_record',
        name: '无编号主档',
        maxHp: 710,
        attack: 60,
        intents: ['barrier', 'charge', 'attack', 'barrier'],
    },
    tower_nameless_gate: {
        id: 'tower_nameless_gate',
        name: '无名门关',
        maxHp: 820,
        attack: 68,
        intents: ['armor_break', 'charge', 'attack', 'armor_break'],
    },
    condensation_trial: {
        id: 'condensation_trial',
        name: '凝境试炼',
        maxHp: 330,
        attack: 31,
        intents: ['charge', 'obscure', 'attack', 'charge'],
    },
    condensation_watch_lamp: {
        id: 'condensation_watch_lamp',
        name: '凝境试炼·观灯',
        maxHp: 210,
        attack: 23,
        intents: ['charge', 'attack', 'barrier'],
    },
    condensation_guard_trace: {
        id: 'condensation_guard_trace',
        name: '凝境试炼·守痕',
        maxHp: 250,
        attack: 26,
        intents: ['armor_break', 'charge', 'attack'],
    },
    condensation_leave_name: {
        id: 'condensation_leave_name',
        name: '凝境试炼·留名',
        maxHp: 300,
        attack: 29,
        intents: ['barrier', 'charge', 'attack', 'barrier'],
    },
    commission_investigation: {
        id: 'commission_investigation',
        name: '残卷影卫',
        maxHp: 225,
        attack: 23,
        intents: ['obscure', 'attack', 'charge'],
    },
    commission_escort: {
        id: 'commission_escort',
        name: '山道伏灵',
        maxHp: 245,
        attack: 24,
        intents: ['armor_break', 'charge', 'attack'],
    },
    commission_clearing: {
        id: 'commission_clearing',
        name: '荒园病根',
        maxHp: 265,
        attack: 26,
        intents: ['barrier', 'charge', 'attack'],
    },
};

export interface TowerFloorConfig {
    floor: number;
    title: string;
    spiritCost: number;
    lingShi: number;
    spiritRefund: number;
    material: number;
    enemyId: string;
    /**
     * Whether this floor grants equipment on its one-time first clear.
     * Resource and clue floors explicitly set this to false.
     */
    equipmentReward?: boolean;
    rewardTemplateId?: string;
    bonusRewardTemplateIds?: readonly string[];
    bonusRewardGrantFlag?: string;
    itemRewards?: readonly TowerItemReward[];
    flagRewards?: readonly TowerFlagReward[];
    minStage: number;
    requiredChapter: string;
    trialRequired?: boolean;
}

export function firstClearEquipmentTemplateIds(
    config: TowerFloorConfig,
): string[] {
    if (config.equipmentReward === false) {
        return [];
    }
    return Array.from(
        new Set(
            [config.rewardTemplateId, ...(config.bonusRewardTemplateIds ?? [])]
                .filter(
                    (templateId): templateId is string =>
                        typeof templateId === 'string' && templateId.length > 0,
                ),
        ),
    );
}

export interface TowerItemReward {
    itemId: string;
    count: number;
}

export interface TowerFlagReward {
    flagId: string;
    label: string;
}

export const TOWER_FLOORS: readonly TowerFloorConfig[] = [
    {
        floor: 1,
        title: '灯影试台',
        spiritCost: 8,
        lingShi: 16,
        spiritRefund: 4,
        material: 1,
        enemyId: 'tower_lamp_platform',
        equipmentReward: true,
        rewardTemplateId: 'tower_lamp_blade',
        minStage: 2,
        requiredChapter: 'qi_02',
    },
    {
        floor: 2,
        title: '湿页回廊',
        spiritCost: 9,
        lingShi: 22,
        spiritRefund: 4,
        material: 1,
        enemyId: 'tower_wet_corridor',
        equipmentReward: false,
        rewardTemplateId: 'tower_guard_cloak',
        itemRewards: [{ itemId: 'hui_qi_powder', count: 1 }],
        minStage: 2,
        requiredChapter: 'qi_02',
    },
    {
        floor: 3,
        title: '药根守傀',
        spiritCost: 10,
        lingShi: 30,
        spiritRefund: 5,
        material: 2,
        enemyId: 'tower_herb_guard',
        equipmentReward: false,
        rewardTemplateId: 'tower_echo_talisman',
        minStage: 2,
        requiredChapter: 'qi_02',
    },
    {
        floor: 4,
        title: '无声姓名牌',
        spiritCost: 11,
        lingShi: 42,
        spiritRefund: 6,
        material: 2,
        enemyId: 'tower_name_token',
        equipmentReward: true,
        rewardTemplateId: 'tower_ash_crown',
        bonusRewardTemplateIds: ['tower_name_talisman'],
        bonusRewardGrantFlag: 'tower_floor_4_bonus_reward_granted',
        minStage: 3,
        requiredChapter: 'qi_03',
    },
    {
        floor: 5,
        title: '六灯记忆壳',
        spiritCost: 12,
        lingShi: 56,
        spiritRefund: 6,
        material: 3,
        enemyId: 'tower_six_lamp_shell',
        equipmentReward: true,
        rewardTemplateId: 'tower_six_lamp_ring',
        minStage: 3,
        requiredChapter: 'qi_03',
    },
    {
        floor: 6,
        title: '录痕庭守关',
        spiritCost: 13,
        lingShi: 72,
        spiritRefund: 7,
        material: 3,
        enemyId: 'tower_record_court',
        equipmentReward: false,
        rewardTemplateId: 'tower_record_cloak',
        itemRewards: [{ itemId: 'tempering_material', count: 1 }],
        minStage: 4,
        requiredChapter: 'qi_04',
    },
    {
        floor: 7,
        title: '黑根回声室',
        spiritCost: 14,
        lingShi: 90,
        spiritRefund: 8,
        material: 4,
        enemyId: 'tower_black_root',
        equipmentReward: false,
        rewardTemplateId: 'tower_blackroot_blade',
        minStage: 4,
        requiredChapter: 'qi_04',
    },
    {
        floor: 8,
        title: '六灯巡刃台',
        spiritCost: 15,
        lingShi: 112,
        spiritRefund: 9,
        material: 4,
        enemyId: 'tower_patrol_blade',
        equipmentReward: true,
        rewardTemplateId: 'tower_wet_blade',
        itemRewards: [{ itemId: 'condensation_trial_clue', count: 1 }],
        minStage: 5,
        requiredChapter: 'qi_05',
    },
    {
        floor: 9,
        title: '无编号主档',
        spiritCost: 16,
        lingShi: 138,
        spiritRefund: 10,
        material: 5,
        enemyId: 'tower_main_record',
        equipmentReward: false,
        rewardTemplateId: 'tower_archive_blade',
        minStage: 6,
        requiredChapter: 'qi_05',
        trialRequired: true,
    },
    {
        floor: 10,
        title: '无名门关',
        spiritCost: 18,
        lingShi: 170,
        spiritRefund: 12,
        material: 6,
        enemyId: 'tower_nameless_gate',
        equipmentReward: true,
        rewardTemplateId: 'trial_nameless_seal',
        itemRewards: [{ itemId: 'archive_key', count: 1 }],
        minStage: 6,
        requiredChapter: 'qi_05',
        trialRequired: true,
    },
];
