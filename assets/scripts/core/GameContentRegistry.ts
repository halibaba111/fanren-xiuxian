import { MapBundleId } from './MapBundleManager';
import { LocalSave } from './StoryTypes';
import { SaveManager } from './SaveManager';

export type GameRegionId =
    | 'map_outer'
    | 'map_library'
    | 'map_market'
    | 'map_rear_mountain'
    | 'map_inner_sect';

export interface RegionConfig {
    id: GameRegionId;
    label: string;
    subtitle: string;
    bundleId: MapBundleId;
    backgroundAsset: string;
    backgroundBundle?: MapBundleId;
    requiredUnlock?: string;
    requiredPower?: number;
    entryLocationId: string;
}

export interface MapEventConfig {
    id: string;
    chapterId: string;
    title: string;
    summary: string;
    mapId: GameRegionId;
    locationId: string;
    requiredChapter?: string;
    requiredUnlock?: string;
    requiredPower?: number;
    repeatable?: boolean;
    priority: number;
}

export const GAME_REGIONS: readonly RegionConfig[] = [
    {
        id: 'map_outer',
        label: '岚川院外院',
        subtitle: '山门、西廊、药圃和弟子居',
        bundleId: 'map_outer',
        backgroundAsset: 'bg_outer_courtyard_move',
        entryLocationId: 'gate',
    },
    {
        id: 'map_library',
        label: '藏经楼',
        subtitle: '旧册、禁注，还有一位不露脸的守卫',
        bundleId: 'map_library',
        backgroundAsset: 'bg_library_action_map_v2',
        backgroundBundle: 'map_library',
        requiredUnlock: 'qi_02',
        requiredPower: 18,
        entryLocationId: 'library_corridor',
    },
    {
        id: 'map_market',
        label: '外院坊市',
        subtitle: '买材料、接委托、淬炼装备',
        bundleId: 'map_market',
        backgroundAsset: 'bg_market_action_map_v2',
        backgroundBundle: 'map_market',
        requiredUnlock: 'qi_02',
        requiredPower: 18,
        entryLocationId: 'market_square',
    },
    {
        id: 'map_rear_mountain',
        label: '后山裂口',
        subtitle: '三年前封住灾潮的地方',
        bundleId: 'map_rear_mountain',
        backgroundAsset: 'bg_rear_mountain_action_map_v2',
        backgroundBundle: 'map_rear_mountain',
        requiredUnlock: 'qi_03',
        requiredPower: 32,
        entryLocationId: 'rift_gate',
    },
    {
        id: 'map_inner_sect',
        label: '岚川院内门',
        subtitle: '原始档案和录痕庭',
        bundleId: 'map_inner_sect',
        backgroundAsset: 'bg_inner_sect_action_map_v2',
        backgroundBundle: 'map_inner_sect',
        requiredUnlock: 'qi_06',
        requiredPower: 64,
        entryLocationId: 'inner_gate',
    },
] as const;

export const MAP_EVENTS: readonly MapEventConfig[] = [
    {
        id: 'event_qi01_main',
        chapterId: 'qi_01',
        title: '灰牌入山',
        summary: '西廊名册已经写了你的名字，灰牌却还是空的。先查清是谁提前动了手脚。',
        mapId: 'map_outer',
        locationId: 'west',
        priority: 100,
    },
    {
        id: 'event_qi01_herb_side',
        chapterId: 'q_qi01_side_01',
        title: '药圃失物',
        summary: '三株回气草顺着旧阵沟“走了”。帮苏晚潮找回来，看看它们在回应谁。',
        mapId: 'map_outer',
        locationId: 'herb',
        requiredChapter: 'qi_01',
        priority: 80,
    },
    {
        id: 'event_qi02_main',
        chapterId: 'qi_02',
        title: '没有这个人',
        summary: '进藏经楼后廊，查许照野为什么从名册上没了。',
        mapId: 'map_library',
        locationId: 'library_corridor',
        requiredChapter: 'qi_01',
        requiredPower: 18,
        priority: 100,
    },
    {
        id: 'event_qi03_main',
        chapterId: 'qi_03',
        title: '石台还名',
        summary: '去后山裂口，看看许照野留下的最后一盏灯。',
        mapId: 'map_rear_mountain',
        locationId: 'rift_gate',
        requiredChapter: 'qi_02',
        requiredUnlock: 'qi_03',
        requiredPower: 32,
        priority: 100,
    },
    {
        id: 'event_qi04_main',
        chapterId: 'qi_04',
        title: '空床有主',
        summary: '回到藏经楼和弟子居，让许照棠拿出哥哥存在过的证据。',
        mapId: 'map_library',
        locationId: 'library_corridor',
        requiredChapter: 'qi_03',
        requiredUnlock: 'qi_04',
        requiredPower: 42,
        priority: 110,
    },
    {
        id: 'event_qi05_main',
        chapterId: 'qi_05',
        title: '灯照旧声',
        summary: '赶去药圃，救出温棚里的弟子，再听清铜灯里的声音。',
        mapId: 'map_outer',
        locationId: 'herb',
        requiredChapter: 'qi_04',
        requiredUnlock: 'qi_05',
        requiredPower: 52,
        priority: 120,
    },
    {
        id: 'event_qi06_main',
        chapterId: 'qi_06',
        title: '雨夜收簿',
        summary: '进内门收簿庭，护住原始账页，争取让叶沉星进入招募池。',
        mapId: 'map_inner_sect',
        locationId: 'inner_gate',
        requiredChapter: 'qi_05',
        requiredUnlock: 'qi_06',
        requiredPower: 64,
        priority: 130,
    },
] as const;

export class GameContentRegistry {
    public static region(regionId: string): RegionConfig | null {
        return GAME_REGIONS.find((region) => region.id === regionId) ?? null;
    }

    public static event(eventId: string): MapEventConfig | null {
        return MAP_EVENTS.find((event) => event.id === eventId) ?? null;
    }

    public static getRegionLockReason(
        save: LocalSave,
        region: RegionConfig,
    ): string {
        if (
            region.requiredUnlock &&
            !SaveManager.isUnlocked(save, region.requiredUnlock)
        ) {
            return this.unlockLabel(region.requiredUnlock);
        }
        if (
            region.requiredPower !== undefined &&
            save.cultivation.cultivation < region.requiredPower
        ) {
            return `修为达到${region.requiredPower}（当前${save.cultivation.cultivation}）`;
        }
        return '';
    }

    public static isRegionUnlocked(save: LocalSave, region: RegionConfig): boolean {
        return this.getRegionLockReason(save, region).length === 0;
    }

    public static getEventLockReason(
        save: LocalSave,
        event: MapEventConfig,
    ): string {
        if (
            event.requiredChapter &&
            !SaveManager.isChapterComplete(save, event.requiredChapter)
        ) {
            return `完成${this.chapterLabel(event.requiredChapter)}`;
        }
        if (
            event.requiredUnlock &&
            !SaveManager.isUnlocked(save, event.requiredUnlock)
        ) {
            return this.unlockLabel(event.requiredUnlock);
        }
        if (
            event.requiredPower !== undefined &&
            save.cultivation.cultivation < event.requiredPower
        ) {
            return `修为达到${event.requiredPower}（当前${save.cultivation.cultivation}）`;
        }
        if (
            !event.repeatable &&
            SaveManager.isChapterComplete(save, event.chapterId)
        ) {
            return '这件事已经办妥';
        }
        return '';
    }

    public static isEventUnlocked(save: LocalSave, event: MapEventConfig): boolean {
        return this.getEventLockReason(save, event).length === 0;
    }

    private static chapterLabel(chapterId: string): string {
        const chapterNumber = chapterId.match(/(\d+)/)?.[1];
        return chapterNumber ? `第${chapterNumber}章` : chapterId;
    }

    private static unlockLabel(contentId: string): string {
        const chapterNumber = contentId.match(/(\d+)/)?.[1];
        return chapterNumber
            ? `第${chapterNumber}章的线索已经落定`
            : `完成${contentId}`;
    }

    public static eventAt(
        save: LocalSave,
        mapId: string,
        locationId: string,
    ): MapEventConfig | null {
        return [...MAP_EVENTS]
            .filter((event) => {
                return event.mapId === mapId &&
                    event.locationId === locationId &&
                    this.isEventUnlocked(save, event);
            })
            .sort((a, b) => b.priority - a.priority)[0] ?? null;
    }

    public static nextAvailableEvent(save: LocalSave): MapEventConfig | null {
        return [...MAP_EVENTS]
            .filter((event) => this.isEventUnlocked(save, event))
            .sort((a, b) => b.priority - a.priority)[0] ?? null;
    }
}
