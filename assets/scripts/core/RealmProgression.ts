export type RealmStoryStatus = 'available' | 'coming_soon';

export interface RealmDefinition {
    id: string;
    label: string;
    maxStage: number;
    storyStatus: RealmStoryStatus;
    storyHook: string;
    stageCapGrowth: number;
    realmCapGrowth: number;
    bodyGrowth: number;
    mindGrowth: number;
    insightGrowth: number;
    fateGrowth: number;
    spiritCapGrowth: number;
}

/**
 * The progression ladder is intentionally data-driven. Story content can be
 * attached to a realm later without changing save or combat calculations.
 */
export const REALM_DEFINITIONS: readonly RealmDefinition[] = [
    {
        id: 'qi_refining',
        label: '炼气',
        maxStage: 9,
        storyStatus: 'available',
        storyHook: '',
        stageCapGrowth: 1.28,
        realmCapGrowth: 1.5,
        bodyGrowth: 4,
        mindGrowth: 3,
        insightGrowth: 2,
        fateGrowth: 1,
        spiritCapGrowth: 12,
    },
    {
        id: 'foundation',
        label: '筑基',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '筑基篇剧情尚未接入，后续山门与潮眼故事敬请期待。',
        stageCapGrowth: 1.3,
        realmCapGrowth: 1.58,
        bodyGrowth: 7,
        mindGrowth: 5,
        insightGrowth: 4,
        fateGrowth: 2,
        spiritCapGrowth: 20,
    },
    {
        id: 'gold_core',
        label: '金丹',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '金丹篇剧情尚未接入，后续宗门与道途选择敬请期待。',
        stageCapGrowth: 1.32,
        realmCapGrowth: 1.66,
        bodyGrowth: 10,
        mindGrowth: 7,
        insightGrowth: 6,
        fateGrowth: 3,
        spiritCapGrowth: 30,
    },
    {
        id: 'nascent_soul',
        label: '元婴',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '元婴篇剧情尚未接入，后续神魂与旧潮真相敬请期待。',
        stageCapGrowth: 1.34,
        realmCapGrowth: 1.74,
        bodyGrowth: 14,
        mindGrowth: 9,
        insightGrowth: 8,
        fateGrowth: 4,
        spiritCapGrowth: 42,
    },
    {
        id: 'divine_transformation',
        label: '化神',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '化神篇剧情尚未接入，后续神识与界潮篇章敬请期待。',
        stageCapGrowth: 1.36,
        realmCapGrowth: 1.82,
        bodyGrowth: 18,
        mindGrowth: 12,
        insightGrowth: 10,
        fateGrowth: 5,
        spiritCapGrowth: 56,
    },
    {
        id: 'void_refining',
        label: '炼虚',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '炼虚篇剧情尚未接入，后续虚空行旅与因果线敬请期待。',
        stageCapGrowth: 1.38,
        realmCapGrowth: 1.9,
        bodyGrowth: 23,
        mindGrowth: 15,
        insightGrowth: 12,
        fateGrowth: 6,
        spiritCapGrowth: 72,
    },
    {
        id: 'body_integration',
        label: '合体',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '合体篇剧情尚未接入，后续诸界合流篇章敬请期待。',
        stageCapGrowth: 1.4,
        realmCapGrowth: 1.98,
        bodyGrowth: 29,
        mindGrowth: 18,
        insightGrowth: 15,
        fateGrowth: 7,
        spiritCapGrowth: 90,
    },
    {
        id: 'mahayana',
        label: '大乘',
        maxStage: 3,
        storyStatus: 'coming_soon',
        storyHook: '大乘篇剧情尚未接入，后续万法归一篇章敬请期待。',
        stageCapGrowth: 1.42,
        realmCapGrowth: 2.06,
        bodyGrowth: 36,
        mindGrowth: 22,
        insightGrowth: 18,
        fateGrowth: 8,
        spiritCapGrowth: 112,
    },
    {
        id: 'tribulation',
        label: '渡劫',
        maxStage: 9,
        storyStatus: 'coming_soon',
        storyHook: '渡劫篇剧情尚未接入，后续天劫与飞升抉择敬请期待。',
        stageCapGrowth: 1.44,
        realmCapGrowth: 2.14,
        bodyGrowth: 44,
        mindGrowth: 26,
        insightGrowth: 22,
        fateGrowth: 10,
        spiritCapGrowth: 138,
    },
    {
        id: 'ascension',
        label: '飞升',
        maxStage: 1,
        storyStatus: 'coming_soon',
        storyHook: '飞升后的世界与终局剧情尚未接入，敬请期待。',
        stageCapGrowth: 1,
        realmCapGrowth: 1,
        bodyGrowth: 56,
        mindGrowth: 32,
        insightGrowth: 28,
        fateGrowth: 12,
        spiritCapGrowth: 180,
    },
] as const;

export interface NormalizedRealmProgress {
    realmId: string;
    realmLabel: string;
    stage: number;
}

function realmIndex(realmId: string): number {
    const index = REALM_DEFINITIONS.findIndex((realm) => realm.id === realmId);
    return index >= 0 ? index : 0;
}

export function getRealmDefinition(realmId: string): RealmDefinition {
    return REALM_DEFINITIONS[realmIndex(realmId)];
}

export function getRealmByLabel(label: string): RealmDefinition | null {
    return REALM_DEFINITIONS.find((realm) => realm.label === label) ?? null;
}

export function getNextRealm(realmId: string): RealmDefinition | null {
    const index = realmIndex(realmId);
    return REALM_DEFINITIONS[index + 1] ?? null;
}

export function getRealmRank(realmId: string, stage: number): number {
    const index = realmIndex(realmId);
    const previousStages = REALM_DEFINITIONS
        .slice(0, index)
        .reduce((total, realm) => total + realm.maxStage, 0);
    return previousStages + Math.max(1, Math.min(
        getRealmDefinition(realmId).maxStage,
        Math.floor(Number(stage) || 1),
    ));
}

export function getRealmByRank(rank: number): NormalizedRealmProgress {
    let remaining = Math.max(1, Math.floor(Number(rank) || 1));
    for (const realm of REALM_DEFINITIONS) {
        if (remaining <= realm.maxStage) {
            return {
                realmId: realm.id,
                realmLabel: realm.label,
                stage: remaining,
            };
        }
        remaining -= realm.maxStage;
    }
    const finalRealm = REALM_DEFINITIONS[REALM_DEFINITIONS.length - 1];
    return {
        realmId: finalRealm.id,
        realmLabel: finalRealm.label,
        stage: finalRealm.maxStage,
    };
}

export function normalizeRealmProgress(
    realmId: unknown,
    realmLabel: unknown,
    stage: unknown,
): NormalizedRealmProgress {
    const byId = typeof realmId === 'string'
        ? REALM_DEFINITIONS.find((realm) => realm.id === realmId)
        : null;
    const byLabel = typeof realmLabel === 'string'
        ? getRealmByLabel(realmLabel)
        : null;
    const realm = byId ?? byLabel ?? REALM_DEFINITIONS[0];
    const index = REALM_DEFINITIONS.indexOf(realm);
    let normalizedStage = Math.max(1, Math.floor(Number(stage) || 1));
    let currentIndex = index;

    while (
        normalizedStage > REALM_DEFINITIONS[currentIndex].maxStage &&
        currentIndex < REALM_DEFINITIONS.length - 1
    ) {
        normalizedStage -= REALM_DEFINITIONS[currentIndex].maxStage;
        currentIndex += 1;
    }

    const normalizedRealm = REALM_DEFINITIONS[currentIndex];
    return {
        realmId: normalizedRealm.id,
        realmLabel: normalizedRealm.label,
        stage: Math.min(normalizedStage, normalizedRealm.maxStage),
    };
}

export function getRealmStoryHook(realmId: string): string {
    return getRealmDefinition(realmId).storyHook;
}

export function getRealmStageLabel(realmId: string, stage: number): string {
    const realm = getRealmDefinition(realmId);
    return `${realm.label} ${Math.max(1, Math.min(realm.maxStage, Math.floor(Number(stage) || 1)))} 层`;
}

export function getNextCultivationCap(
    currentCap: number,
    nextRank: number,
    crossedRealm: boolean,
    nextRealmId: string,
): number {
    const nextRealm = getRealmDefinition(nextRealmId);
    const growth = crossedRealm
        ? nextRealm.realmCapGrowth
        : nextRealm.stageCapGrowth;
    const rankCurve = Math.round(100 * Math.pow(1.115, Math.max(0, nextRank - 1)));
    const minimumStep = crossedRealm ? 80 : 40;
    return Math.max(
        Math.max(1, Math.floor(Number(currentCap) || 100)) + minimumStep,
        Math.round(Math.max(1, Number(currentCap) || 100) * growth),
        rankCurve,
    );
}
