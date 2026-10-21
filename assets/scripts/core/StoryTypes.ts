export type StoryScalar = number | string | boolean;
export type EventTriggerMode = 'auto' | 'confirm' | 'manual';

export type SpiritualElement = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type SpiritualRootGrade = 'mixed' | 'true' | 'earth' | 'heaven';

export type CompanionRole =
    | 'healer'
    | 'investigator'
    | 'duelist'
    | 'artificer'
    | 'registrar'
    | 'tide_runner';

export type RelationshipType =
    | 'romance'
    | 'family'
    | 'rival'
    | 'mentor'
    | 'companion'
    | 'antagonist';

export type CharacterGender = 'male' | 'female';

export interface CharacterDefinition {
    npcId: string;
    name: string;
    role: string;
    faction: string;
    gender?: CharacterGender;
    relationshipType: RelationshipType;
    romanceable: boolean;
    recruitable: boolean;
    publicGoal: string;
    privateGoal: string;
    boundary: string;
    independentAction: string;
    supportRole?: CompanionRole;
    supportDescription?: string;
    recruitChapter?: string;
    summonUnlockContent?: string;
    requiredFlags?: string[];
    forbiddenFlags?: string[];
    minFavor?: number;
    portrait?: string;
}

export interface CompanionState {
    npcId: string;
    recruited: boolean;
    active: boolean;
    recruitChapter: string;
    recruitSceneId: string;
    supportLevel: number;
    duplicateCount: number;
}

export interface SummonProgress {
    totalDraws: number;
    pityCount: number;
    totalLingShiSpent: number;
    freeTenDraws: number;
    unlockedNpcIds: string[];
    lastResultNpcId: string;
    lastResultWasDuplicate: boolean;
}

export interface SpiritualRootCandidate {
    id: string;
    seed: number;
    grade: SpiritualRootGrade;
    grade_label: string;
    primary: SpiritualElement;
    secondary: SpiritualElement | null;
    scores: Record<SpiritualElement, number>;
    cultivation_rate: number;
    trait: string;
    trait_label: string;
    combat_description: string;
}

export interface StoryEffect {
    op:
        | 'add'
        | 'add_favor'
        | 'unlock_summon'
        | 'recruit'
        | 'set_companion_active'
        | 'set_flag';
    key: string;
    value: StoryScalar;
}

export interface StoryItem {
    id: string;
    count: number;
}

export interface StoryOption {
    id: string;
    text: string;
    next: string;
    effects?: StoryEffect[];
}

export interface StoryCondition {
    flag: string;
    equals?: StoryScalar;
    min?: number;
}

export interface StoryBranch {
    conditions: StoryCondition[];
    next: string;
}

export interface StoryNode {
    type: string;
    next?: string;
    text?: string;
    speaker?: string;
    portrait?: string;
    position?: string;
    prompt?: string;
    options?: StoryOption[];
    branches?: StoryBranch[];
    fallback?: string;
    stage_id?: string;
    win_next?: string;
    lose_next?: string;
    ad_type?: string;
    ad_placement?: string;
    ad_reward_text?: string;
    revive_next?: string;
    dialogue_before?: string;
    dialogue_after?: string;
    reward?: Record<string, unknown>;
    items?: StoryItem[];
    settlement_id?: string;
    ad_double?: {
        enabled: boolean;
        include: string[];
        exclude?: string[];
    };
    flag?: string;
    value?: StoryScalar;
    chapter_id?: string;
    unlock?: string[];
    enemy_art?: string;
    enemy_bundle?: string;
    item_art?: string;
    item_bundle?: string;
    [key: string]: unknown;
}

export interface ChapterData {
    chapter_id: string;
    title: string;
    realm: string;
    start_node: string;
    background?: string;
    background_bundle?: string;
    bgm?: string;
    required_power?: number;
    flags_on_start?: string[];
    nodes: Record<string, StoryNode>;
}

export interface ChapterProgress {
    nodeId: string;
    complete: boolean;
}

export interface MapPosition {
    x: number;
    y: number;
}

export interface CultivationProgress {
    realmId: string;
    realmLabel: string;
    stage: number;
    cultivation: number;
    cultivationCap: number;
    spirit: number;
    spiritCap: number;
    body: number;
    mind: number;
    insight: number;
    fate: number;
    days: number;
}

export type HerbPlotStage = 0 | 1 | 2 | 3;

export interface HerbPlotProgress {
    stage: HerbPlotStage;
    tended: number;
    harvestCount: number;
    insightCharge: number;
    tutorialSeen: boolean;
}

export type EquipmentQuality =
    | 'white'
    | 'green'
    | 'blue'
    | 'purple'
    | 'gold'
    | 'red';

export type EquipmentSlot =
    | 'weapon'
    | 'artifact'
    | 'armor'
    | 'head'
    | 'ring'
    | 'boots';

export type EquipmentStatKey =
    | 'attack'
    | 'defense'
    | 'health'
    | 'mana'
    | 'spirit'
    | 'insight'
    | 'mind';

export type EquipmentStats = Partial<Record<EquipmentStatKey, number>>;

export interface EquipmentAffix {
    id: string;
    label: string;
    tier: number;
    value: number;
    description: string;
}

export interface ForgePendingResult {
    equipmentId: string;
    replaceIndex: number;
    affix: EquipmentAffix;
    previousAffix?: EquipmentAffix;
    mode?: 'reroll';
    cost?: number;
}

export interface EquipmentInstance {
    id: string;
    templateId: string;
    name: string;
    slot: EquipmentSlot;
    level: number;
    equipped: boolean;
    affixes: EquipmentAffix[];
    baseRoll?: number;
    basePower?: number;
    quality: EquipmentQuality;
    locked: boolean;
    baseStats: EquipmentStats;
    refineLevel: number;
    rerollCount: number;
    coreAffixMilestoneClaimed: boolean;
    acquiredAt: number;
}

export interface TowerProgress {
    currentFloor: number;
    bestFloor: number;
    firstClearFloors: number[];
    activeFloor: number | null;
    activeAdventureId: string | null;
    adventureHistory: string[];
    blessing: number;
}

export interface CondensationTrialStats {
    attempts: number;
    failedAttempts: number;
    clearedSegments: number;
    totalRounds: number;
    totalDamageTaken: number;
}

export interface CultivationGoalState {
    capKey: string;
    capNoticeSeen: boolean;
    goalPanelSeen: boolean;
    trialState: 'locked' | 'available' | 'cleared';
    trialPhase: number;
    lastFailedTrialPhase: number;
    lastFailedTrialSpiritCost: number;
    trialStats: CondensationTrialStats;
}

export interface EconomyProgress {
    dayKey: string;
    cultivationAdCount: number;
    forgeMaterialAdClaimed: boolean;
    commissionRewardAdCount: number;
    commissionRefreshCount: number;
    marketPurchaseCounts: Record<string, number>;
}

export interface CommissionProgress {
    availableIds: string[];
    activeCommissionId: string | null;
    completedIds: string[];
    refreshCount: number;
    herbDeliveryCount: number;
}

export interface TelemetryEvent {
    name: string;
    timestamp: number;
    payload: Record<string, string | number | boolean>;
}

export interface RelationshipState {
    npcId: string;
    name: string;
    favor: number;
    level: number;
    levelLabel: string;
    unlockedScenes: string[];
    relationshipType?: RelationshipType;
    romanceable?: boolean;
    recruited?: boolean;
}

export interface LocalSave {
    version: number;
    chapterId: string;
    nodeId: string;
    flags: Record<string, StoryScalar>;
    inventory: Record<string, number>;
    claimedSettlements: string[];
    settlementItems: Record<string, Record<string, number>>;
    chapterComplete: boolean;
    spiritual_root_candidates: SpiritualRootCandidate[];
    spiritual_root: SpiritualRootCandidate | null;
    root_roll_locked: boolean;
    spiritual_root_rerolls: number;
    chapterProgress: Record<string, ChapterProgress>;
    completedChapters: string[];
    unlockedContent: string[];
    claimedAds: string[];
    announcementSeenVersion: string;
    tutorialOfferSeen: boolean;
    tutorialEnabled: boolean;
    tutorialStep: string;
    tutorialComplete: boolean;
    tutorialSkipped: boolean;
    tutorialChapter1GuideDone: boolean;
    tutorialChapter2GuideDone: boolean;
    tutorialBattleBriefSeen: boolean;
    starterCompanionGranted: boolean;
    eventTriggerMode: EventTriggerMode;
    pendingEventId: string;
    currentMapId: string;
    mapPositions: Record<string, MapPosition>;
    cultivation: CultivationProgress;
    herbPlot: HerbPlotProgress;
    equipment: EquipmentInstance[];
    relationships: Record<string, RelationshipState>;
    companions: Record<string, CompanionState>;
    summon: SummonProgress;
    forgeAttempts: number;
    forgePending: ForgePendingResult | null;
    tower: TowerProgress;
    cultivationGoal: CultivationGoalState;
    economy: EconomyProgress;
    commissions: CommissionProgress;
    telemetry: TelemetryEvent[];
}
