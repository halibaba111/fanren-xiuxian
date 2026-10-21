import { sys } from 'cc';
import {
    CharacterDefinition,
    CompanionState,
    CultivationProgress,
    EquipmentInstance,
    EquipmentQuality,
    EquipmentSlot,
    HerbPlotStage,
    LocalSave,
    RelationshipState,
    StoryScalar,
    SummonProgress,
} from './StoryTypes';
import { CharacterRegistry } from './CharacterRegistry';
import {
    EQUIPMENT_TEMPLATES,
    QUALITY_BASE_ROLL_RANGE,
    QUALITY_REFINE_CAP,
    TOWER_FLOORS,
} from './GameConfig';
import {
    CloudSaveEnvelope,
    GAME_PROGRESS_SAVE_FORMAT,
    GameProgressCloud,
} from './GameProgressCloud';
import { normalizeRealmProgress } from './RealmProgression';

const STORAGE_KEY_PREFIX = 'xiuxian_game_save_v3_slot_';
const SAVE_META_KEY_PREFIX = 'xiuxian_game_save_meta_v1_slot_';
const ACTIVE_SLOT_KEY = 'xiuxian_game_active_slot_v1';
const SLOT_COUNT = 3;
const META_STORAGE_KEY = 'xiuxian_game_meta_v1';
const LEGACY_STORAGE_KEY_V2 = 'xiuxian_game_save_v2';
const LEGACY_STORAGE_KEY = 'xiuxian_qi_01_save_v1';

interface GameMeta {
    thirdSlotUnlocked: boolean;
}

interface SaveMeta {
    savedAt: number;
    revision: number;
}

interface SaveToSlotOptions {
    syncCloud?: boolean;
    touchMeta?: boolean;
    meta?: SaveMeta;
}

export interface SaveSlotSummary {
    slotIndex: number;
    hasSave: boolean;
    locked: boolean;
    chapterId: string;
    nodeId: string;
    chapterComplete: boolean;
}

function normalizeSlotIndex(value: number): number | null {
    const slotIndex = Math.floor(Number(value));
    return Number.isInteger(slotIndex) &&
        slotIndex >= 0 &&
        slotIndex < SLOT_COUNT
        ? slotIndex
        : null;
}

function createCultivation(): CultivationProgress {
    return {
        realmId: 'qi_refining',
        realmLabel: '炼气',
        stage: 1,
        cultivation: 0,
        cultivationCap: 100,
        spirit: 74,
        spiritCap: 100,
        body: 48,
        mind: 52,
        insight: 50,
        fate: 45,
        days: 0,
    };
}

function createTowerProgress(): LocalSave['tower'] {
    return {
        currentFloor: 1,
        bestFloor: 0,
        firstClearFloors: [],
        activeFloor: null,
        activeAdventureId: null,
        adventureHistory: [],
        blessing: 0,
    };
}

function createTrialStats(): LocalSave['cultivationGoal']['trialStats'] {
    return {
        attempts: 0,
        failedAttempts: 0,
        clearedSegments: 0,
        totalRounds: 0,
        totalDamageTaken: 0,
    };
}

function createCultivationGoal(): LocalSave['cultivationGoal'] {
    return {
        capKey: '',
        capNoticeSeen: false,
        goalPanelSeen: false,
        trialState: 'locked',
        trialPhase: 0,
        lastFailedTrialPhase: 0,
        lastFailedTrialSpiritCost: 0,
        trialStats: createTrialStats(),
    };
}

function createEconomy(): LocalSave['economy'] {
    return {
        dayKey: '',
        cultivationAdCount: 0,
        forgeMaterialAdClaimed: false,
        commissionRewardAdCount: 0,
        commissionRefreshCount: 0,
        marketPurchaseCounts: {},
    };
}

function createCommissions(): LocalSave['commissions'] {
    return {
        availableIds: [],
        activeCommissionId: null,
        completedIds: [],
        refreshCount: 0,
        herbDeliveryCount: 0,
    };
}

function createSummonProgress(): SummonProgress {
    return {
        totalDraws: 0,
        pityCount: 0,
        totalLingShiSpent: 0,
        freeTenDraws: 0,
        unlockedNpcIds: [],
        lastResultNpcId: '',
        lastResultWasDuplicate: false,
    };
}

function normalizeSummonProgress(
    source: Partial<SummonProgress> | undefined,
): SummonProgress {
    const totalDraws = Number(source?.totalDraws);
    const pityCount = Number(source?.pityCount);
    const totalLingShiSpent = Number(source?.totalLingShiSpent);
    return {
        ...createSummonProgress(),
        ...(source ?? {}),
        totalDraws: Math.max(
            0,
            Number.isFinite(totalDraws) ? Math.floor(totalDraws) : 0,
        ),
        pityCount: Math.max(
            0,
            Math.min(
                30,
                Number.isFinite(pityCount) ? Math.floor(pityCount) : 0,
            ),
        ),
        totalLingShiSpent: Math.max(
            0,
            Number.isFinite(totalLingShiSpent)
                ? Math.floor(totalLingShiSpent)
                : 0,
        ),
        freeTenDraws: Math.max(
            0,
            Math.min(99, Math.floor(Number(source?.freeTenDraws ?? 0))),
        ),
        unlockedNpcIds: unique(
            Array.isArray(source?.unlockedNpcIds)
                ? source.unlockedNpcIds.map(String)
                : [],
        ),
        lastResultNpcId: typeof source?.lastResultNpcId === 'string'
            ? source.lastResultNpcId
            : '',
        lastResultWasDuplicate: source?.lastResultWasDuplicate === true,
    };
}

function isEquipmentQuality(value: unknown): value is EquipmentQuality {
    return value === 'white' ||
        value === 'green' ||
        value === 'blue' ||
        value === 'purple' ||
        value === 'gold' ||
        value === 'red';
}

function normalizeSlot(value: unknown, fallback: EquipmentSlot): EquipmentSlot {
    if (value === 'accessory') {
        return 'ring';
    }
    return value === 'weapon' ||
        value === 'artifact' ||
        value === 'armor' ||
        value === 'head' ||
        value === 'ring' ||
        value === 'boots'
        ? value
        : fallback;
}

function normalizeEquipment(
    source: Partial<EquipmentInstance> & { slot?: string },
    index: number,
): EquipmentInstance {
    const templateId = String(source.templateId ?? `legacy_equipment_${index + 1}`);
    const template = EQUIPMENT_TEMPLATES[templateId];
    const basePower = Math.max(0, Number(source.basePower ?? 0));
    const rawBaseStats = source.baseStats && typeof source.baseStats === 'object'
        ? source.baseStats
        : {};
    const baseStats = {
        ...(template?.baseStats ?? {}),
        ...rawBaseStats,
    };
    if (!Object.keys(baseStats).length && basePower > 0) {
        baseStats.attack = basePower;
    }
    const fallbackQuality: EquipmentQuality = template?.quality ??
        (basePower >= 25 ? 'blue' : basePower >= 12 ? 'green' : 'white');
    const quality = isEquipmentQuality(source.quality)
        ? source.quality
        : fallbackQuality;
    const [minimumBaseRoll, maximumBaseRoll] = QUALITY_BASE_ROLL_RANGE[quality];
    const rawBaseRoll = Number(source.baseRoll);
    return {
        id: String(source.id ?? `legacy_equipment_${index + 1}`),
        templateId,
        name: String(source.name ?? template?.name ?? '无名法器'),
        slot: normalizeSlot(source.slot, template?.slot ?? 'artifact'),
        level: Math.max(1, Math.floor(Number(source.level ?? 1))),
        equipped: source.equipped === true,
        affixes: Array.isArray(source.affixes) ? source.affixes : [],
        baseRoll: Number.isFinite(rawBaseRoll)
            ? Math.max(minimumBaseRoll, Math.min(maximumBaseRoll, rawBaseRoll))
            : undefined,
        basePower: Number.isFinite(basePower) && basePower > 0
            ? basePower
            : undefined,
        quality,
        locked: source.locked === true,
        baseStats,
        refineLevel: Math.max(
            0,
            Math.min(
                QUALITY_REFINE_CAP[quality],
                Math.floor(Number(source.refineLevel ?? 0)),
            ),
        ),
        rerollCount: Math.max(0, Math.floor(Number(source.rerollCount ?? 0))),
        coreAffixMilestoneClaimed:
            source.coreAffixMilestoneClaimed === true,
        acquiredAt: Math.max(0, Math.floor(Number(source.acquiredAt ?? 0))),
    };
}

// Save migration cannot call EquipmentForgeSystem without creating a cycle.
// Keep these fields aligned with EquipmentForgeSystem.createEquipment().
function createMigratedTowerEquipment(
    save: LocalSave,
    templateId: string,
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

    const [minimum, maximum] = QUALITY_BASE_ROLL_RANGE[template.quality];
    let seed = serial * 97;
    for (let index = 0; index < templateId.length; index += 1) {
        seed = (seed * 31 + templateId.charCodeAt(index)) % 1000003;
    }
    const normalized = (seed % 1000) / 999;
    const baseRoll = Math.round(
        (minimum + (maximum - minimum) * normalized) * 100,
    ) / 100;

    return {
        id,
        templateId,
        name: template.name,
        slot: template.slot,
        level: 1,
        equipped: false,
        affixes: [],
        baseRoll,
        basePower: Number(template.baseStats.attack ?? 0) || undefined,
        quality: template.quality,
        locked: false,
        baseStats: { ...template.baseStats },
        refineLevel: 0,
        rerollCount: 0,
        coreAffixMilestoneClaimed: false,
        acquiredAt: 0,
    };
}

function createRelationshipState(
    definition: CharacterDefinition,
): RelationshipState {
    return {
        npcId: definition.npcId,
        name: definition.name,
        favor: 0,
        level: 0,
        levelLabel: '初识',
        unlockedScenes: [],
        relationshipType: definition.relationshipType,
        romanceable: definition.romanceable,
        recruited: false,
    };
}

function createRelationships(): Record<string, RelationshipState> {
    const relationshipIds = [
        'su_wan_chao',
        'guan_yan_qiu',
        'cheng_shou_mo',
        'xu_zhao_tang',
        'ye_chen_xing',
        'shen_zhi_wei',
        'jiang_wan_ling',
    ];
    const relationships: Record<string, RelationshipState> = {};
    relationshipIds.forEach((npcId) => {
        const definition = CharacterRegistry.get(npcId);
        if (definition) {
            relationships[npcId] = createRelationshipState(definition);
        }
    });
    return relationships;
}

function createCompanions(): Record<string, CompanionState> {
    const companions: Record<string, CompanionState> = {};
    CharacterRegistry.companions().forEach((definition) => {
        companions[definition.npcId] = {
            npcId: definition.npcId,
            recruited: false,
            active: false,
            recruitChapter: definition.recruitChapter ?? '',
            recruitSceneId: '',
            supportLevel: 0,
            duplicateCount: 0,
        };
    });
    return companions;
}

function mergeCompanions(
    base: Record<string, CompanionState>,
    parsed: Partial<Record<string, CompanionState>> | undefined,
): Record<string, CompanionState> {
    const merged: Record<string, CompanionState> = {};
    Object.keys(base).forEach((npcId) => {
        const current = parsed?.[npcId];
        const recruited = current?.recruited === true;
        const parsedSupportLevel = Number(current?.supportLevel ?? 0);
        const parsedDuplicateCount = Number(current?.duplicateCount ?? 0);
        merged[npcId] = {
            ...base[npcId],
            ...(current ?? {}),
            npcId,
            recruited,
            active: recruited && current?.active === true,
            recruitChapter:
                current?.recruitChapter ?? base[npcId].recruitChapter,
            recruitSceneId: current?.recruitSceneId ?? '',
            supportLevel: Number.isFinite(parsedSupportLevel)
                ? Math.max(0, Math.min(4, Math.floor(parsedSupportLevel)))
                : 0,
            duplicateCount: Number.isFinite(parsedDuplicateCount)
                ? Math.max(0, Math.floor(parsedDuplicateCount))
                : 0,
        };
    });
    return merged;
}

function createDefaultSave(chapterId: string, nodeId: string): LocalSave {
    return {
        version: 5,
        chapterId,
        nodeId,
        flags: {},
        inventory: {},
        claimedSettlements: [],
        settlementItems: {},
        chapterComplete: false,
        spiritual_root_candidates: [],
        spiritual_root: null,
        root_roll_locked: false,
        spiritual_root_rerolls: 0,
        chapterProgress: {
            [chapterId]: {
                nodeId,
                complete: false,
            },
        },
        completedChapters: [],
        unlockedContent: ['qi_01', 'map_outer'],
        claimedAds: [],
        announcementSeenVersion: '',
        tutorialOfferSeen: false,
        tutorialEnabled: false,
        tutorialStep: '',
        tutorialComplete: false,
        tutorialSkipped: false,
        tutorialChapter1GuideDone: false,
        tutorialChapter2GuideDone: false,
        tutorialBattleBriefSeen: false,
        starterCompanionGranted: false,
        eventTriggerMode: 'confirm',
        pendingEventId: '',
        currentMapId: 'map_outer',
        mapPositions: {
            map_outer: { x: 0, y: -226 },
        },
        cultivation: createCultivation(),
        herbPlot: {
            stage: 0,
            tended: 0,
            harvestCount: 0,
            insightCharge: 0,
            tutorialSeen: false,
        },
        equipment: [],
        relationships: createRelationships(),
        companions: createCompanions(),
        summon: createSummonProgress(),
        forgeAttempts: 0,
        forgePending: null,
        tower: createTowerProgress(),
        cultivationGoal: createCultivationGoal(),
        economy: createEconomy(),
        commissions: createCommissions(),
        telemetry: [],
    };
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

export class SaveManager {
    public static readonly SLOT_COUNT = SLOT_COUNT;
    private static pendingCloudSave: CloudSaveEnvelope | null = null;
    private static cloudSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private static cloudSaveInFlight: Promise<boolean> | null = null;

    public static getActiveSlot(): number {
        const stored = normalizeSlotIndex(
            Number(sys.localStorage.getItem(ACTIVE_SLOT_KEY) ?? 0),
        );
        return stored ?? 0;
    }

    public static setActiveSlot(slotIndex: number): boolean {
        const normalized = normalizeSlotIndex(slotIndex);
        if (normalized === null) {
            return false;
        }
        sys.localStorage.setItem(ACTIVE_SLOT_KEY, String(normalized));
        return true;
    }

    public static getSlotSummaries(): SaveSlotSummary[] {
        this.migrateLegacySave();
        return Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
            const raw = sys.localStorage.getItem(this.slotKey(slotIndex));
            const locked = !this.isSlotUnlocked(slotIndex);
            if (!raw) {
                return {
                    slotIndex,
                    hasSave: false,
                    locked,
                    chapterId: '',
                    nodeId: '',
                    chapterComplete: false,
                };
            }

            try {
                const parsed = JSON.parse(raw) as Partial<LocalSave>;
                return {
                    slotIndex,
                    hasSave: true,
                    locked: false,
                    chapterId: String(parsed.chapterId ?? ''),
                    nodeId: String(parsed.nodeId ?? ''),
                    chapterComplete: parsed.chapterComplete === true,
                };
            } catch {
                return {
                    slotIndex,
                    hasSave: false,
                    locked,
                    chapterId: '',
                    nodeId: '',
                    chapterComplete: false,
                };
            }
        });
    }

    public static saveToSlot(
        save: LocalSave,
        slotIndex: number,
        options: SaveToSlotOptions = {},
    ): boolean {
        const normalized = normalizeSlotIndex(slotIndex);
        if (normalized === null || !this.isSlotUnlocked(normalized)) {
            return false;
        }
        this.normalizeRuntimeState(save);
        this.syncActiveChapter(save);
        save.version = 5;
        save.completedChapters = unique(save.completedChapters);
        save.unlockedContent = unique(save.unlockedContent);
        save.companions = mergeCompanions(
            createCompanions(),
            save.companions,
        );
        save.summon = normalizeSummonProgress(save.summon);
        this.syncCompanionsFromFlags(save);
        this.syncRelationshipsFromFlags(save);
        sys.localStorage.setItem(
            this.slotKey(normalized),
            JSON.stringify(save),
        );
        const meta = options.meta ??
            (options.touchMeta === false
                ? this.readSaveMeta(normalized)
                : this.nextSaveMeta(normalized));
        if (meta) {
            this.writeSaveMeta(normalized, meta);
        }
        if (
            options.syncCloud !== false &&
            normalized === this.getActiveSlot() &&
            meta
        ) {
            this.queueCloudSave(save, normalized, meta);
        }
        return true;
    }

    public static clearSlot(slotIndex: number): boolean {
        const normalized = normalizeSlotIndex(slotIndex);
        if (normalized === null || !this.isSlotUnlocked(normalized)) {
            return false;
        }
        sys.localStorage.removeItem(this.slotKey(normalized));
        sys.localStorage.removeItem(this.saveMetaKey(normalized));
        return true;
    }

    public static load(chapterId: string, defaultNodeId: string): LocalSave {
        this.migrateLegacySave();
        const raw = sys.localStorage.getItem(
            this.slotKey(this.getActiveSlot()),
        );
        if (!raw) {
            return createDefaultSave(chapterId, defaultNodeId);
        }

        try {
            const parsed = JSON.parse(raw) as Partial<LocalSave>;
            const base = createDefaultSave(chapterId, defaultNodeId);
            const save: LocalSave = {
                ...createDefaultSave(chapterId, defaultNodeId),
                ...parsed,
                flags: parsed.flags ?? {},
                inventory: parsed.inventory ?? {},
                claimedSettlements: parsed.claimedSettlements ?? [],
                settlementItems: parsed.settlementItems ?? {},
                claimedAds: Array.isArray(parsed.claimedAds)
                    ? parsed.claimedAds
                    : [],
                spiritual_root_candidates: Array.isArray(parsed.spiritual_root_candidates)
                    ? parsed.spiritual_root_candidates
                    : [],
                spiritual_root: parsed.spiritual_root ?? null,
                root_roll_locked:
                    parsed.root_roll_locked === true && parsed.spiritual_root != null,
                spiritual_root_rerolls: Math.max(
                    0,
                    Number(parsed.spiritual_root_rerolls ?? 0),
                ),
                chapterProgress: parsed.chapterProgress ?? {
                    [parsed.chapterId ?? chapterId]: {
                        nodeId: parsed.nodeId ?? defaultNodeId,
                        complete: parsed.chapterComplete === true,
                    },
                },
                completedChapters: parsed.completedChapters ?? (
                    parsed.chapterComplete && parsed.chapterId
                        ? [parsed.chapterId]
                        : []
                ),
                unlockedContent: unique([
                    ...base.unlockedContent,
                    ...(parsed.unlockedContent ?? []),
                ]),
                announcementSeenVersion:
                    typeof parsed.announcementSeenVersion === 'string'
                        ? parsed.announcementSeenVersion
                        : '',
                tutorialOfferSeen:
                    parsed.tutorialOfferSeen === true ||
                    (parsed.tutorialOfferSeen === undefined &&
                        parsed.root_roll_locked === true),
                tutorialEnabled: parsed.tutorialEnabled === true,
                tutorialStep:
                    typeof parsed.tutorialStep === 'string'
                        ? parsed.tutorialStep
                        : '',
                tutorialComplete: parsed.tutorialComplete === true,
                tutorialSkipped: parsed.tutorialSkipped === true,
                tutorialChapter1GuideDone:
                    parsed.tutorialChapter1GuideDone === true,
                tutorialChapter2GuideDone:
                    parsed.tutorialChapter2GuideDone === true,
                tutorialBattleBriefSeen:
                    parsed.tutorialBattleBriefSeen === true,
                eventTriggerMode:
                    parsed.eventTriggerMode === 'auto' ||
                    parsed.eventTriggerMode === 'manual'
                        ? parsed.eventTriggerMode
                        : 'confirm',
                pendingEventId: parsed.pendingEventId ?? '',
                currentMapId: parsed.currentMapId ?? 'map_outer',
                mapPositions: parsed.mapPositions ?? base.mapPositions,
                cultivation: {
                    ...base.cultivation,
                    ...(parsed.cultivation ?? {}),
                },
                herbPlot: {
                    stage: Math.max(
                        0,
                        Math.min(
                            3,
                            Number(parsed.herbPlot?.stage ?? base.herbPlot.stage),
                        ),
                    ) as HerbPlotStage,
                    tended: Math.max(
                        0,
                        Number(parsed.herbPlot?.tended ?? base.herbPlot.tended),
                    ),
                    harvestCount: Math.max(
                        0,
                        Math.floor(
                            Number(
                                parsed.herbPlot?.harvestCount ??
                                    base.herbPlot.harvestCount,
                            ),
                        ),
                    ),
                    insightCharge: Math.max(
                        0,
                        Math.min(
                            1,
                            Math.floor(
                                Number(
                                    parsed.herbPlot?.insightCharge ??
                                        base.herbPlot.insightCharge,
                                ),
                            ),
                        ),
                    ),
                    tutorialSeen: parsed.herbPlot?.tutorialSeen === true,
                },
                equipment: Array.isArray(parsed.equipment)
                    ? parsed.equipment.map((item, index) =>
                        normalizeEquipment(
                            (item ?? {}) as Partial<EquipmentInstance> & {
                                slot?: string;
                            },
                            index,
                        ),
                    )
                    : [],
                relationships: {
                    ...base.relationships,
                    ...(parsed.relationships ?? {}),
                },
                companions: mergeCompanions(
                    base.companions,
                    parsed.companions,
                ),
                summon: normalizeSummonProgress(parsed.summon),
                forgeAttempts: Number(parsed.forgeAttempts ?? 0),
                forgePending:
                    parsed.forgePending &&
                    typeof parsed.forgePending === 'object' &&
                    typeof parsed.forgePending.equipmentId === 'string' &&
                    parsed.forgePending.affix &&
                    typeof parsed.forgePending.affix === 'object'
                        ? {
                              equipmentId: parsed.forgePending.equipmentId,
                              replaceIndex: Number(
                                  parsed.forgePending.replaceIndex ?? -1,
                              ),
                              affix: parsed.forgePending.affix,
                              previousAffix:
                                  parsed.forgePending.previousAffix &&
                                  typeof parsed.forgePending.previousAffix ===
                                      'object'
                                      ? parsed.forgePending.previousAffix
                                      : undefined,
                              mode: parsed.forgePending.mode === 'reroll'
                                  ? 'reroll'
                                  : undefined,
                              cost: Math.max(
                                  0,
                                  Number(parsed.forgePending.cost ?? 0),
                              ),
                          }
                        : null,
                tower: {
                    ...base.tower,
                    ...(parsed.tower ?? {}),
                },
                cultivationGoal: {
                    ...base.cultivationGoal,
                    ...(parsed.cultivationGoal ?? {}),
                },
                economy: {
                    ...base.economy,
                    ...(parsed.economy ?? {}),
                },
                commissions: {
                    ...base.commissions,
                    ...(parsed.commissions ?? {}),
                },
                telemetry: Array.isArray(parsed.telemetry)
                    ? parsed.telemetry
                    : [],
            };
            this.activateChapter(save, chapterId, defaultNodeId);
            this.normalizeRuntimeState(save);
            this.syncCompanionsFromFlags(save);
            this.syncRelationshipsFromFlags(save);
            this.saveToSlot(save, this.getActiveSlot(), {
                syncCloud: false,
                touchMeta: false,
            });
            return save;
        } catch {
            return createDefaultSave(chapterId, defaultNodeId);
        }
    }

    public static async loadWithCloud(
        chapterId: string,
        defaultNodeId: string,
        syncCloud = true,
    ): Promise<LocalSave> {
        this.migrateLegacySave();
        const activeSlot = this.getActiveSlot();
        const hadLocalSave = Boolean(
            sys.localStorage.getItem(this.slotKey(activeSlot)),
        );
        let local = this.load(chapterId, defaultNodeId);
        if (!syncCloud) {
            return local;
        }

        const cloud = await GameProgressCloud.read();
        const remote = cloud.envelope;
        if (!remote) {
            // A successful empty response is the only case where the local
            // record should seed the cloud. Network/platform failures leave
            // the local fallback untouched and avoid an accidental overwrite.
            if (cloud.available && !cloud.message && hadLocalSave) {
                this.save(local);
            }
            return local;
        }

        const remoteSlot = normalizeSlotIndex(remote.slotIndex);
        if (remoteSlot === null) {
            return local;
        }

        let targetSlot = activeSlot;
        if (remoteSlot !== activeSlot) {
            // The cloud record is the current user's latest progress. Local
            // slot switching opts out through syncCloud=false, so normal boot
            // may adopt the cloud record's slot across devices.
            if (remoteSlot === 2) {
                this.unlockThirdSlot();
            }
            if (!this.isSlotUnlocked(remoteSlot) || !this.setActiveSlot(remoteSlot)) {
                return local;
            }
            targetSlot = remoteSlot;
            local = this.load(chapterId, defaultNodeId);
        }

        const localRaw = sys.localStorage.getItem(this.slotKey(targetSlot));
        const localMeta = this.readSaveMeta(targetSlot);
        const remoteIsNewer = !localRaw || this.isRemoteNewer(remote, localMeta);
        if (remoteIsNewer) {
            sys.localStorage.setItem(
                this.slotKey(targetSlot),
                JSON.stringify(remote.save),
            );
            const restored = this.load(chapterId, defaultNodeId);
            this.writeSaveMeta(targetSlot, {
                savedAt: remote.savedAt,
                revision: remote.revision,
            });
            return restored;
        }

        if (!localMeta || this.isLocalNewer(localMeta, remote)) {
            this.save(local);
        }
        return local;
    }

    public static save(save: LocalSave): void {
        this.saveToSlot(save, this.getActiveSlot());
    }

    public static flushCloudSave(): Promise<boolean> {
        if (this.cloudSaveInFlight) {
            return this.cloudSaveInFlight;
        }
        const pending = this.pendingCloudSave;
        if (!pending) {
            return Promise.resolve(true);
        }
        this.pendingCloudSave = null;
        const request = GameProgressCloud.write(pending)
            .then((result) => result.ok)
            .catch(() => false);
        this.cloudSaveInFlight = request.then((ok) => {
            this.cloudSaveInFlight = null;
            if (this.pendingCloudSave) {
                void this.flushCloudSave();
            }
            return ok;
        });
        return this.cloudSaveInFlight;
    }

    public static reset(chapterId: string, nodeId: string): LocalSave {
        const save = createDefaultSave(chapterId, nodeId);
        this.save(save);
        return save;
    }

    public static activateChapter(
        save: LocalSave,
        chapterId: string,
        defaultNodeId: string,
    ): void {
        const progress = save.chapterProgress[chapterId] ?? {
            nodeId: defaultNodeId,
            complete: false,
        };
        save.chapterProgress[chapterId] = progress;
        save.chapterId = chapterId;
        save.nodeId = progress.nodeId || defaultNodeId;
        save.chapterComplete = progress.complete === true;
    }

    public static completeChapter(
        save: LocalSave,
        chapterId: string,
        unlocks: string[],
    ): void {
        const progress = save.chapterProgress[chapterId] ?? {
            nodeId: save.nodeId,
            complete: false,
        };
        progress.nodeId = save.nodeId;
        progress.complete = true;
        save.chapterProgress[chapterId] = progress;
        save.chapterComplete = true;
        save.completedChapters = unique([
            ...save.completedChapters,
            chapterId,
        ]);
        save.unlockedContent = unique([
            ...save.unlockedContent,
            ...unlocks,
        ]);
    }

    public static isChapterComplete(save: LocalSave, chapterId: string): boolean {
        return save.completedChapters.indexOf(chapterId) >= 0 ||
            save.chapterProgress[chapterId]?.complete === true;
    }

    public static isUnlocked(save: LocalSave, contentId: string): boolean {
        return save.unlockedContent.indexOf(contentId) >= 0;
    }

    public static addFlag(save: LocalSave, key: string, value: StoryScalar): void {
        save.flags[key] = value;
    }

    public static addInventory(save: LocalSave, itemId: string, count: number): void {
        const next = (save.inventory[itemId] ?? 0) + count;
        if (next <= 0) {
            delete save.inventory[itemId];
            return;
        }
        save.inventory[itemId] = next;
    }

    public static hasClaimed(save: LocalSave, settlementId: string): boolean {
        return save.claimedSettlements.indexOf(settlementId) >= 0;
    }

    public static claim(
        save: LocalSave,
        settlementId: string,
        items: Record<string, number>,
    ): void {
        if (!this.hasClaimed(save, settlementId)) {
            save.claimedSettlements.push(settlementId);
        }
        save.settlementItems[settlementId] = { ...items };
    }

    public static hasClaimedAd(save: LocalSave, adId: string): boolean {
        return save.claimedAds.indexOf(adId) >= 0;
    }

    public static claimAd(save: LocalSave, adId: string): void {
        if (!this.hasClaimedAd(save, adId)) {
            save.claimedAds.push(adId);
        }
    }

    public static isSlotUnlocked(slotIndex: number): boolean {
        const normalized = normalizeSlotIndex(slotIndex);
        if (normalized === null || normalized < 2) {
            return normalized !== null;
        }

        return this.getMeta().thirdSlotUnlocked ||
            Boolean(sys.localStorage.getItem(this.slotKey(normalized)));
    }

    public static unlockThirdSlot(): void {
        const meta = this.getMeta();
        meta.thirdSlotUnlocked = true;
        sys.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
    }

    private static normalizeRuntimeState(save: LocalSave): void {
        save.announcementSeenVersion =
            typeof save.announcementSeenVersion === 'string'
                ? save.announcementSeenVersion
                : '';
        const cultivation = save.cultivation ?? createCultivation();
        const normalizedRealm = normalizeRealmProgress(
            cultivation.realmId,
            cultivation.realmLabel,
            cultivation.stage,
        );
        save.cultivation = {
            ...createCultivation(),
            ...cultivation,
            ...normalizedRealm,
            stage: normalizedRealm.stage,
            cultivation: Math.max(
                0,
                Math.min(
                    Math.max(1, Number(cultivation.cultivationCap) || 100),
                    Number(cultivation.cultivation) || 0,
                ),
            ),
            cultivationCap: Math.max(
                1,
                Math.floor(Number(cultivation.cultivationCap) || 100),
            ),
            spirit: Math.max(0, Number(cultivation.spirit) || 0),
            spiritCap: Math.max(1, Number(cultivation.spiritCap) || 100),
            body: Math.max(0, Number(cultivation.body) || 0),
            mind: Math.max(0, Number(cultivation.mind) || 0),
            insight: Math.max(0, Number(cultivation.insight) || 0),
            fate: Math.max(0, Number(cultivation.fate) || 0),
            days: Math.max(0, Math.floor(Number(cultivation.days) || 0)),
        };
        save.cultivation.spirit = Math.min(
            save.cultivation.spirit,
            save.cultivation.spiritCap,
        );
        save.starterCompanionGranted = save.starterCompanionGranted === true;
        save.equipment = Array.isArray(save.equipment)
            ? save.equipment.map((item, index) =>
                normalizeEquipment(
                    (item ?? {}) as Partial<EquipmentInstance> & {
                        slot?: string;
                    },
                    index,
                ),
            )
            : [];
        save.summon = normalizeSummonProgress(save.summon);

        const herbPlot = (save.herbPlot ?? {}) as Partial<LocalSave['herbPlot']>;
        save.herbPlot = {
            stage: Math.max(
                0,
                Math.min(3, Math.floor(Number(herbPlot.stage ?? 0))),
            ) as HerbPlotStage,
            tended: Math.max(
                0,
                Math.floor(Number(herbPlot.tended ?? 0)),
            ),
            harvestCount: Math.max(
                0,
                Math.floor(Number(herbPlot.harvestCount ?? 0)),
            ),
            insightCharge: Math.max(
                0,
                Math.min(1, Math.floor(Number(herbPlot.insightCharge ?? 0))),
            ),
            tutorialSeen: herbPlot.tutorialSeen === true,
        };

        const tower = (save.tower ?? {}) as Partial<LocalSave['tower']>;
        const firstClearFloors = Array.isArray(tower.firstClearFloors)
            ? tower.firstClearFloors
                .map((floor) => Math.floor(Number(floor)))
                .filter((floor) => floor >= 1 && floor <= 10)
            : [];
        // Old saves may contain repeatClearCounts from an abandoned tower loop.
        // Strip it during normalization so no later system can mistake it for
        // an active progression mechanic.
        const normalizedTowerInput = {
            ...(tower as Record<string, unknown>),
        };
        delete normalizedTowerInput.repeatClearCounts;
        save.tower = {
            ...createTowerProgress(),
            ...normalizedTowerInput,
            currentFloor: Math.max(
                1,
                Math.min(10, Math.floor(Number(tower.currentFloor ?? 1))),
            ),
            bestFloor: Math.max(
                0,
                Math.min(10, Math.floor(Number(tower.bestFloor ?? 0))),
                ...firstClearFloors,
            ),
            firstClearFloors: unique(firstClearFloors.map(String)).map(Number),
            activeFloor: tower.activeFloor !== null &&
                Number.isFinite(Number(tower.activeFloor))
                ? Math.max(1, Math.min(10, Math.floor(Number(tower.activeFloor))))
                : null,
            activeAdventureId: typeof tower.activeAdventureId === 'string'
                ? tower.activeAdventureId
                : null,
            adventureHistory: unique(
                Array.isArray(tower.adventureHistory)
                    ? tower.adventureHistory.map(String)
                    : [],
            ),
            blessing: Math.max(0, Math.min(3, Math.floor(Number(tower.blessing ?? 0)))),
        };
        this.backfillTowerMilestoneRewards(save);

        const goal = (save.cultivationGoal ?? {}) as Partial<LocalSave['cultivationGoal']>;
        const trialState =
            goal.trialState === 'available' || goal.trialState === 'cleared'
                ? goal.trialState
                : 'locked';
        const rawTrialStats =
            goal.trialStats && typeof goal.trialStats === 'object'
                ? goal.trialStats as Partial<
                    LocalSave['cultivationGoal']['trialStats']
                >
                : {} as Partial<LocalSave['cultivationGoal']['trialStats']>;
        save.cultivationGoal = {
            ...createCultivationGoal(),
            ...goal,
            capKey: typeof goal.capKey === 'string' ? goal.capKey : '',
            capNoticeSeen: goal.capNoticeSeen === true,
            goalPanelSeen: goal.goalPanelSeen === true,
            trialState,
            trialPhase: trialState === 'cleared'
                ? 3
                : trialState === 'locked'
                    ? 0
                    : Math.max(
                        0,
                        Math.min(3, Math.floor(Number(goal.trialPhase ?? 0))),
                    ),
            lastFailedTrialPhase: Math.max(
                0,
                Math.min(3, Math.floor(Number(goal.lastFailedTrialPhase ?? 0))),
            ),
            lastFailedTrialSpiritCost: Math.max(
                0,
                Math.floor(Number(goal.lastFailedTrialSpiritCost ?? 0)),
            ),
            trialStats: {
                attempts: Math.max(
                    0,
                    Math.floor(Number(rawTrialStats.attempts ?? 0)),
                ),
                failedAttempts: Math.max(
                    0,
                    Math.floor(Number(rawTrialStats.failedAttempts ?? 0)),
                ),
                clearedSegments: Math.max(
                    0,
                    Math.min(
                        3,
                        Math.floor(
                            Number(rawTrialStats.clearedSegments ?? 0),
                        ),
                    ),
                ),
                totalRounds: Math.max(
                    0,
                    Math.floor(Number(rawTrialStats.totalRounds ?? 0)),
                ),
                totalDamageTaken: Math.max(
                    0,
                    Math.floor(Number(rawTrialStats.totalDamageTaken ?? 0)),
                ),
            },
        };

        const economy = (save.economy ?? {}) as Partial<LocalSave['economy']>;
        const rawMarketPurchaseCounts =
            economy.marketPurchaseCounts &&
            typeof economy.marketPurchaseCounts === 'object'
                ? economy.marketPurchaseCounts as Record<string, unknown>
                : {};
        const marketPurchaseCounts: Record<string, number> = {};
        Object.keys(rawMarketPurchaseCounts).forEach((key) => {
            const value = Math.max(
                0,
                Math.floor(Number(rawMarketPurchaseCounts[key] ?? 0)),
            );
            if (key && value > 0) {
                marketPurchaseCounts[key] = value;
            }
        });
        save.economy = {
            ...createEconomy(),
            ...economy,
            dayKey: typeof economy.dayKey === 'string' ? economy.dayKey : '',
            cultivationAdCount: Math.max(
                0,
                Math.min(3, Math.floor(Number(economy.cultivationAdCount ?? 0))),
            ),
            forgeMaterialAdClaimed: economy.forgeMaterialAdClaimed === true,
            commissionRewardAdCount: Math.max(
                0,
                Math.min(
                    3,
                    Math.floor(Number(economy.commissionRewardAdCount ?? 0)),
                ),
            ),
            commissionRefreshCount: Math.max(
                0,
                Math.floor(Number(economy.commissionRefreshCount ?? 0)),
            ),
            marketPurchaseCounts,
        };

        const commissions = (save.commissions ?? {}) as Partial<LocalSave['commissions']>;
        save.commissions = {
            ...createCommissions(),
            ...commissions,
            availableIds: unique(
                Array.isArray(commissions.availableIds)
                    ? commissions.availableIds.map(String)
                    : [],
            ),
            activeCommissionId: typeof commissions.activeCommissionId === 'string'
                ? commissions.activeCommissionId
                : null,
            completedIds: unique(
                Array.isArray(commissions.completedIds)
                    ? commissions.completedIds.map(String)
                    : [],
            ),
            refreshCount: Math.max(
                0,
                Math.floor(Number(commissions.refreshCount ?? 0)),
            ),
            herbDeliveryCount: Math.max(
                0,
                Math.floor(Number(commissions.herbDeliveryCount ?? 0)),
            ),
        };

        save.telemetry = Array.isArray(save.telemetry)
            ? save.telemetry
                .filter((event) => event && typeof event.name === 'string')
                .slice(-100)
                .map((event) => ({
                    name: event.name,
                    timestamp: Math.max(0, Number(event.timestamp ?? 0)),
                    payload:
                        event.payload && typeof event.payload === 'object'
                            ? event.payload
                            : {},
                }))
            : [];
    }

    private static backfillTowerMilestoneRewards(save: LocalSave): void {
        this.backfillTowerBonusEquipment(save);

        const clearedFloorEight =
            save.tower.bestFloor >= 8 ||
            save.tower.firstClearFloors.some((floor) => floor >= 8);
        if (clearedFloorEight) {
            if (Number(save.inventory.condensation_trial_clue ?? 0) <= 0) {
                this.addInventory(save, 'condensation_trial_clue', 1);
            }
        }

        const clearedFloorTen =
            save.tower.bestFloor >= 10 ||
            save.tower.firstClearFloors.some((floor) => floor >= 10);
        const archiveResolved =
            save.tower.adventureHistory.some((entry) =>
                entry.startsWith('tower_nameless_archive:'),
            ) ||
            save.flags.tower_archive_branch_record === true ||
            save.flags.tower_archive_branch_seal === true;
        if (clearedFloorTen) {
            if (Number(save.inventory.archive_key ?? 0) <= 0) {
                this.addInventory(save, 'archive_key', 1);
            }
            if (!archiveResolved && !save.tower.activeAdventureId) {
                save.tower.activeAdventureId = 'tower_nameless_archive';
            }
        }
    }

    private static backfillTowerBonusEquipment(save: LocalSave): void {
        TOWER_FLOORS.forEach((config) => {
            const flagId = config.bonusRewardGrantFlag;
            const bonusTemplateIds = config.bonusRewardTemplateIds ?? [];
            const clearedFloor =
                save.tower.bestFloor >= config.floor ||
                save.tower.firstClearFloors.some(
                    (floor) => floor >= config.floor,
                );
            if (
                !flagId ||
                bonusTemplateIds.length === 0 ||
                !clearedFloor ||
                save.flags[flagId] === true
            ) {
                return;
            }

            bonusTemplateIds.forEach((templateId) => {
                const alreadyOwned = save.equipment.some(
                    (item) => item.templateId === templateId,
                );
                if (alreadyOwned) {
                    return;
                }
                const equipment = createMigratedTowerEquipment(
                    save,
                    templateId,
                );
                if (equipment) {
                    save.equipment.push(equipment);
                }
            });

            if (
                bonusTemplateIds.every((templateId) =>
                    save.equipment.some(
                        (item) => item.templateId === templateId,
                    ),
                )
            ) {
                save.flags[flagId] = true;
            }
        });
    }

    private static syncActiveChapter(save: LocalSave): void {
        save.chapterProgress[save.chapterId] = {
            nodeId: save.nodeId,
            complete: save.chapterComplete,
        };
    }

    private static slotKey(slotIndex: number): string {
        return `${STORAGE_KEY_PREFIX}${slotIndex + 1}`;
    }

    private static saveMetaKey(slotIndex: number): string {
        return `${SAVE_META_KEY_PREFIX}${slotIndex + 1}`;
    }

    private static readSaveMeta(slotIndex: number): SaveMeta | null {
        const raw = sys.localStorage.getItem(this.saveMetaKey(slotIndex));
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<SaveMeta>;
            const savedAt = Math.max(0, Math.floor(Number(parsed.savedAt) || 0));
            const revision = Math.max(0, Math.floor(Number(parsed.revision) || 0));
            return savedAt || revision ? { savedAt, revision } : null;
        } catch {
            return null;
        }
    }

    private static writeSaveMeta(slotIndex: number, meta: SaveMeta): void {
        sys.localStorage.setItem(
            this.saveMetaKey(slotIndex),
            JSON.stringify({
                savedAt: Math.max(0, Math.floor(Number(meta.savedAt) || 0)),
                revision: Math.max(0, Math.floor(Number(meta.revision) || 0)),
            }),
        );
    }

    private static nextSaveMeta(slotIndex: number): SaveMeta {
        const previous = this.readSaveMeta(slotIndex);
        const now = Date.now();
        return {
            savedAt: now,
            revision: Math.max(now, (previous?.revision ?? 0) + 1),
        };
    }

    private static isRemoteNewer(
        remote: CloudSaveEnvelope,
        local: SaveMeta | null,
    ): boolean {
        if (!local) {
            return true;
        }
        if (remote.savedAt !== local.savedAt) {
            return remote.savedAt > local.savedAt;
        }
        return remote.revision > local.revision;
    }

    private static isLocalNewer(
        local: SaveMeta,
        remote: CloudSaveEnvelope,
    ): boolean {
        if (local.savedAt !== remote.savedAt) {
            return local.savedAt > remote.savedAt;
        }
        return local.revision > remote.revision;
    }

    private static queueCloudSave(
        save: LocalSave,
        slotIndex: number,
        meta: SaveMeta,
    ): void {
        let clonedSave: LocalSave;
        try {
            clonedSave = JSON.parse(JSON.stringify(save)) as LocalSave;
        } catch {
            return;
        }
        this.pendingCloudSave = {
            format: GAME_PROGRESS_SAVE_FORMAT,
            slotIndex,
            savedAt: meta.savedAt,
            revision: meta.revision,
            save: clonedSave,
        };
        if (this.cloudSaveTimer !== null) {
            return;
        }
        this.cloudSaveTimer = setTimeout(() => {
            this.cloudSaveTimer = null;
            void this.flushCloudSave();
        }, 0);
    }

    private static getMeta(): GameMeta {
        const raw = sys.localStorage.getItem(META_STORAGE_KEY);
        if (!raw) {
            return { thirdSlotUnlocked: false };
        }
        try {
            const parsed = JSON.parse(raw) as Partial<GameMeta>;
            return {
                thirdSlotUnlocked: parsed.thirdSlotUnlocked === true,
            };
        } catch {
            return { thirdSlotUnlocked: false };
        }
    }

    private static migrateLegacySave(): void {
        const firstSlotKey = this.slotKey(0);
        if (sys.localStorage.getItem(firstSlotKey)) {
            return;
        }

        const legacy =
            sys.localStorage.getItem(LEGACY_STORAGE_KEY_V2) ??
            sys.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            sys.localStorage.setItem(firstSlotKey, legacy);
        }
    }

    private static syncRelationshipsFromFlags(save: LocalSave): void {
        const mappings = [
            ['su_wan_chao', 'su_wan_chao_favor'],
            ['guan_yan_qiu', 'guan_yan_qiu_favor'],
            ['cheng_shou_mo', 'cheng_shou_mo_favor'],
            ['xu_zhao_tang', 'xu_zhao_tang_favor'],
            ['ye_chen_xing', 'ye_chen_xing_favor'],
            ['shen_zhi_wei', 'shen_zhi_wei_favor'],
            ['jiang_wan_ling', 'jiang_wan_ling_favor'],
        ] as const;
        mappings.forEach(([npcId, flagId]) => {
            const relationship = save.relationships[npcId];
            if (!relationship) {
                return;
            }
            relationship.favor = Math.max(
                relationship.favor,
                Number(save.flags[flagId] ?? 0),
            );
        });
    }

    private static syncCompanionsFromFlags(save: LocalSave): void {
        save.companions = mergeCompanions(
            createCompanions(),
            save.companions,
        );
        CharacterRegistry.companions().forEach((definition) => {
            const state = save.companions[definition.npcId];
            if (!state) {
                return;
            }
            if (save.flags[`companion_${definition.npcId}_recruited`] === true) {
                state.recruited = true;
            }
            if (
                state.recruited &&
                save.summon.unlockedNpcIds.indexOf(definition.npcId) < 0
            ) {
                save.summon.unlockedNpcIds.push(definition.npcId);
            }
            if (save.flags[`companion_${definition.npcId}_active`] !== undefined) {
                state.active =
                    state.recruited &&
                    save.flags[`companion_${definition.npcId}_active`] === true;
            }
            const relationship = save.relationships[definition.npcId];
            if (relationship) {
                relationship.recruited = state.recruited;
            }
        });
    }
}
