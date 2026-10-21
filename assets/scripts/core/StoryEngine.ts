import { DataLoader } from './DataLoader';
import { SaveManager } from './SaveManager';
import { SpiritualRootSystem } from './SpiritualRootSystem';
import { CompanionSystem } from './CompanionSystem';
import { RelationshipSystem } from './RelationshipSystem';
import { SummonSystem } from './SummonSystem';
import {
    ChapterData,
    LocalSave,
    StoryEffect,
    StoryNode,
    StoryOption,
} from './StoryTypes';

export interface StoryView {
    render(node: StoryNode, save: LocalSave, chapter: ChapterData): void;
    renderRootSelection(save: LocalSave, chapter: ChapterData): void;
    renderHome?(save: LocalSave, chapter: ChapterData): void;
    showError(message: string): void;
}

export interface RootRerollState {
    freeRemaining: number;
    adRequired: boolean;
    canReroll: boolean;
}

function asNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export class StoryEngine {
    private chapter: ChapterData | null = null;
    private save: LocalSave | null = null;
    private renderedNodeId = '';
    private renderedNode: StoryNode | null = null;

    public constructor(private readonly view: StoryView) {}

    public async load(chapterId: string): Promise<void> {
        await this.loadChapter(chapterId);
    }

    public async switchSaveSlot(slotIndex: number): Promise<void> {
        if (this.save?.forgePending) {
            this.view.showError(
                '新词条尚未处理，请先选择写入或保留原词条后再切换存档。',
            );
            return;
        }
        if (
            !this.chapter ||
            !SaveManager.isSlotUnlocked(slotIndex) ||
            !SaveManager.setActiveSlot(slotIndex)
        ) {
            return;
        }
        await this.loadChapter(this.chapter.chapter_id, false, false);
    }

    public async createNewSaveSlot(slotIndex: number): Promise<void> {
        if (this.save?.forgePending) {
            this.view.showError(
                '新词条尚未处理，请先选择写入或保留原词条后再创建新存档。',
            );
            return;
        }
        if (
            !this.chapter ||
            !SaveManager.isSlotUnlocked(slotIndex) ||
            !SaveManager.setActiveSlot(slotIndex)
        ) {
            return;
        }
        SaveManager.clearSlot(slotIndex);
        await this.loadChapter(this.chapter.chapter_id, false, false);
    }

    public saveCurrentToSlot(slotIndex: number): boolean {
        if (!this.save) {
            return false;
        }
        if (this.save.forgePending) {
            this.view.showError(
                '新词条尚未处理，请先选择写入或保留原词条后再保存到其他存档位。',
            );
            return false;
        }
        return SaveManager.saveToSlot(this.save, slotIndex);
    }

    public async loadChapter(
        chapterId: string,
        fromMap = false,
        syncCloud = true,
    ): Promise<void> {
        try {
            this.chapter = await DataLoader.loadChapter(chapterId);
            this.save = await SaveManager.loadWithCloud(
                chapterId,
                this.chapter.start_node,
                syncCloud,
            );
            SpiritualRootSystem.ensureCandidates(this.save);
            CompanionSystem.ensure(this.save);
            SummonSystem.ensure(this.save);
            CompanionSystem.ensureStarter(this.save);

            for (const flag of this.chapter.flags_on_start ?? []) {
                if (this.save.flags[flag] === undefined) {
                    this.save.flags[flag] = true;
                }
            }

            SaveManager.save(this.save);
            if (!this.save.root_roll_locked) {
                this.view.renderRootSelection(this.save, this.chapter);
                return;
            }
            if (!fromMap && this.save.chapterComplete && this.view.renderHome) {
                this.view.renderHome(this.save, this.chapter);
                return;
            }
            this.enter(this.save.nodeId || this.chapter.start_node);
        } catch (error) {
            this.view.showError(`章节加载失败：${String(error)}`);
        }
    }

    public lockSpiritualRoot(candidateIndex: number): void {
        if (!this.save || !this.chapter) {
            return;
        }

        if (!SpiritualRootSystem.lock(this.save, candidateIndex)) {
            this.view.showError('灵根候选无效，或已经完成锁定。');
            return;
        }

        SaveManager.save(this.save);
        this.enter(this.save.nodeId || this.chapter.start_node);
    }

    public getRootRerollState(): RootRerollState {
        const rerolls = this.save?.spiritual_root_rerolls ?? 0;
        return {
            freeRemaining: Math.max(0, 3 - rerolls),
            adRequired: rerolls >= 3 && rerolls < 4,
            canReroll: rerolls < 4,
        };
    }

    public rerollSpiritualRoots(guaranteeRare = false): boolean {
        if (!this.save || !this.chapter || this.save.root_roll_locked) {
            return false;
        }

        const state = this.getRootRerollState();
        if (!state.canReroll || (!guaranteeRare && state.adRequired)) {
            return false;
        }
        if (guaranteeRare && !state.adRequired) {
            return false;
        }

        if (!SpiritualRootSystem.reroll(this.save, guaranteeRare)) {
            return false;
        }
        SaveManager.save(this.save);
        this.view.renderRootSelection(this.save, this.chapter);
        return true;
    }

    public startFromMap(): void {
        if (!this.chapter || !this.save) {
            return;
        }
        this.enter(this.save.nodeId || this.chapter.start_node);
    }

    public async startChapterFromMap(chapterId: string): Promise<void> {
        let requestedChapter: ChapterData;
        try {
            requestedChapter = await DataLoader.loadChapter(chapterId);
        } catch (error) {
            this.view.showError(`章节加载失败：${String(error)}`);
            return;
        }
        const currentSave = this.save ??
            SaveManager.load(chapterId, requestedChapter.start_node);
        const requiredPower = requestedChapter.required_power ?? 0;
        if (currentSave.cultivation.cultivation < requiredPower) {
            this.view.showError(
                `还不能进去：修为达到${requiredPower}（当前${currentSave.cultivation.cultivation}）。`,
            );
            return;
        }
        await this.loadChapter(chapterId, true);
        if (!this.save || !this.chapter) {
            return;
        }
        this.save.chapterComplete = false;
        this.save.nodeId = this.save.chapterProgress[chapterId]?.nodeId ??
            this.chapter.start_node;
        SaveManager.save(this.save);
        this.enter(this.save.nodeId || this.chapter.start_node);
    }

    public getSave(): LocalSave | null {
        return this.save;
    }

    public getChapter(): ChapterData | null {
        return this.chapter;
    }

    public continue(): void {
        const node = this.currentNode();
        if (!node) {
            return;
        }

        if (node.type === 'reward') {
            this.grantReward(node);
        }

        if (node.type === 'end') {
            return;
        }

        if (node.next) {
            this.enter(node.next);
        }
    }

    public choose(optionId: string): void {
        const node = this.currentNode();
        const option = node?.options?.find((item) => item.id === optionId);
        if (!option) {
            this.view.showError(`找不到选项：${optionId}`);
            return;
        }

        for (const effect of option.effects ?? []) {
            this.applyEffect(effect);
        }
        this.enter(option.next);
    }

    public battleResult(won: boolean): void {
        const node = this.currentNode();
        if (!node || node.type !== 'battle') {
            return;
        }

        const nextNode = won ? node.win_next : node.lose_next;
        if (nextNode) {
            this.enter(nextNode);
        }
    }

    public acceptAd(): void {
        const node = this.currentNode();
        if (!node || node.type !== 'ad') {
            return;
        }

        const adId = this.adClaimId(node);
        if (!this.save) {
            return;
        }
        if (SaveManager.hasClaimedAd(this.save, adId)) {
            if (node.next) {
                this.enter(node.next);
            }
            return;
        }

        if (node.ad_type === 'double_reward') {
            if (!this.applyDoubleReward(node)) {
                if (node.next) {
                    this.enter(node.next);
                }
                return;
            }
        } else if (node.ad_type === 'revive') {
            if (this.save) {
                SaveManager.claimAd(this.save, adId);
                SaveManager.addFlag(
                    this.save,
                    `ad_revive_${this.save.nodeId}`,
                    true,
                );
                SaveManager.save(this.save);
            }
            this.enter(node.revive_next ?? node.next ?? '');
            return;
        } else if (this.save) {
            SaveManager.claimAd(this.save, adId);
            SaveManager.save(this.save);
        }

        if (node.next) {
            this.enter(node.next);
        }
    }

    public skipAd(): void {
        const node = this.currentNode();
        if (node?.type === 'ad' && node.next) {
            this.enter(node.next);
        }
    }

    public restart(): void {
        if (!this.chapter) {
            return;
        }
        const candidates = this.save?.spiritual_root_candidates ?? [];
        const spiritualRoot = this.save?.spiritual_root ?? null;
        const rootRollLocked = this.save?.root_roll_locked ?? false;
        const rootRerolls = this.save?.spiritual_root_rerolls ?? 0;
        this.save = SaveManager.reset(this.chapter.chapter_id, this.chapter.start_node);
        this.save.spiritual_root_candidates = candidates;
        this.save.spiritual_root = spiritualRoot;
        this.save.root_roll_locked = rootRollLocked;
        this.save.spiritual_root_rerolls = rootRerolls;
        SaveManager.save(this.save);
        if (!rootRollLocked) {
            this.view.renderRootSelection(this.save, this.chapter);
            return;
        }
        this.enter(this.chapter.start_node);
    }

    private currentNode(): StoryNode | null {
        if (!this.chapter || !this.save) {
            return null;
        }
        if (
            this.renderedNodeId === this.save.nodeId &&
            this.renderedNode
        ) {
            return this.renderedNode;
        }
        return this.chapter.nodes[this.save.nodeId] ?? null;
    }

    private enter(nodeId: string): void {
        if (!this.chapter || !this.save) {
            return;
        }

        this.renderedNodeId = '';
        this.renderedNode = null;
        const node = this.chapter.nodes[nodeId];
        if (!node) {
            this.view.showError(`剧情节点不存在：${nodeId}`);
            return;
        }

        this.save.nodeId = nodeId;
        if (node.type === 'branch') {
            const branch = (node.branches ?? []).find((candidate) =>
                candidate.conditions.every((condition) =>
                    this.matchesCondition(condition),
                ),
            );
            const nextNode = branch?.next ?? node.fallback;
            if (!nextNode) {
                this.view.showError(`分支节点没有可用出口：${nodeId}`);
                return;
            }
            this.enter(nextNode);
            return;
        }
        if (node.type === 'set_flag' && node.flag) {
            this.applyEffect({
                op: 'set_flag',
                key: node.flag,
                value: node.value ?? true,
            });
            if (node.next) {
                this.enter(node.next);
            }
            return;
        }

        if (node.type === 'end') {
            this.save.chapterComplete = true;
            SaveManager.completeChapter(
                this.save,
                this.chapter.chapter_id,
                node.unlock ?? [],
            );
            CompanionSystem.ensureStarter(this.save);
        }

        if (
            node.type === 'ad' &&
            SaveManager.hasClaimedAd(this.save, this.adClaimId(node))
        ) {
            if (node.next) {
                this.enter(node.next);
            }
            return;
        }

        const renderNode = this.prepareNode(nodeId, node);
        this.renderedNodeId = nodeId;
        this.renderedNode = renderNode;
        SaveManager.save(this.save);
        this.view.render(renderNode, this.save, this.chapter);
    }

    private matchesCondition(condition: {
        flag: string;
        equals?: string | number | boolean;
        min?: number;
    }): boolean {
        if (!this.save) {
            return false;
        }
        const value = condition.flag === 'qi04_evidence_count'
            ? this.qi04EvidenceCount()
            : this.save.flags[condition.flag];
        if (condition.equals !== undefined && value !== condition.equals) {
            return false;
        }
        if (condition.min !== undefined && Number(value ?? 0) < condition.min) {
            return false;
        }
        return value !== undefined;
    }

    private qi04EvidenceCount(): number {
        if (!this.save) {
            return 0;
        }
        const stored = Number(this.save.flags.qi04_evidence_count ?? 0);
        if (Number.isFinite(stored) && stored > 0) {
            return Math.floor(stored);
        }
        return [
            'qi04_evidence_herb',
            'qi04_evidence_bed',
            'qi04_evidence_archive',
        ].filter((flag) => this.save?.flags[flag] === true).length;
    }

    private prepareNode(nodeId: string, node: StoryNode): StoryNode {
        if (!this.save || !this.chapter) {
            return node;
        }

        if (this.chapter.chapter_id === 'qi_01' && nodeId === 'n113') {
            if (this.save.flags.qi01_saved_zhao_ye === true) {
                return {
                    ...node,
                    text: '傍晚，灰牌被安排到外院西廊。你把旧铁剑挂在腰间，把缺口铜灯藏进袖中。阵眼里那道求救声还留在耳边，像有人隔着灯火提醒你：别让他们把我写成从未存在过。西廊尽头随即传来第二次翻页声。',
                };
            }
            if (this.save.flags.qi01_self_first === true) {
                return {
                    ...node,
                    text: '傍晚，灰牌被安排到外院西廊。你把旧铁剑挂在腰间，把缺口铜灯藏进袖中。灰牌边缘还留着阵眼擦过的白痕，像一笔没有写完的警告。西廊尽头随即传来第二次翻页声。',
                };
            }
        }

        if (this.chapter.chapter_id === 'qi_03' && nodeId === 'n318') {
            if (this.save.flags.qi03_wrote_surname === true) {
                return {
                    ...node,
                    text: '离开裂口时，六盏小灯熄灭了一盏，却没有人走出来。你把那个姓写回了灰牌，宗门会更快注意到你，但至少没人能再说这里从未有过那个人。',
                };
            }
            if (this.save.flags.qi03_left_surname === true) {
                return {
                    ...node,
                    text: '离开裂口时，六盏小灯熄灭了一盏，却没有人走出来。你把那个姓留在无名石上，把回来的路留给真正的他。',
                };
            }
        }

        if (this.chapter.chapter_id === 'qi_04' && nodeId === 'n401') {
            if (this.save.flags.qi03_wrote_surname === true) {
                return {
                    ...node,
                    text: '你和许照棠回到藏经楼后廊。灰牌上那个刚写回去的‘许’字还没有褪，她因此更敢相信自己的记忆，也更确定录司很快会来找你们。',
                };
            }
            if (this.save.flags.qi03_left_surname === true) {
                return {
                    ...node,
                    text: '你和许照棠回到藏经楼后廊。无名石上留下的那个‘许’字还在发冷，她不再要求你把哥哥的名字写回去，只想把哥哥生活过的痕迹一条条找出来。',
                };
            }
        }

        if (
            this.chapter.chapter_id !== 'qi_04' ||
            nodeId !== 'n407'
        ) {
            return node;
        }

        const evidence = [
            {
                flag: 'qi04_evidence_herb',
                id: 'herb',
                text: '查药圃旧记，核对药材与黑根痕迹',
                effect: {
                    op: 'add_favor',
                    key: 'su_wan_chao',
                    value: 1,
                } as StoryEffect,
            },
            {
                flag: 'qi04_evidence_bed',
                id: 'bed',
                text: '查弟子居空床，确认这里确实住过人',
                effect: {
                    op: 'add_favor',
                    key: 'xu_zhao_tang',
                    value: 1,
                } as StoryEffect,
            },
            {
                flag: 'qi04_evidence_archive',
                id: 'archive',
                text: '查旧档案缺页，确认名字是否被抹掉',
                effect: {
                    op: 'add',
                    key: 'sect_suspicion',
                    value: 1,
                } as StoryEffect,
            },
        ].filter((item) => this.save?.flags[item.flag] !== true);

        if (!evidence.length) {
            return {
                type: 'say',
                speaker: '旁白',
                text: '三处痕迹都已经查过。药量、空床和缺页互相印证，纸傀也在门后的墨迹里醒来。',
                next: 'n408',
            };
        }

        const options: StoryOption[] = evidence.map((item) => ({
            id: `inspect_${item.id}`,
            text: item.text,
            next: 'n408',
            effects: [
                {
                    op: 'set_flag',
                    key: item.flag,
                    value: true,
                },
                {
                    op: 'add',
                    key: 'qi04_evidence_count',
                    value: 1,
                },
                item.effect,
            ],
        }));
        if (this.qi04EvidenceCount() >= 2) {
            options.unshift({
                id: 'submit_evidence',
                text: '把两份证据固定下来，看看纸傀究竟要撕掉什么',
                next: 'n408',
                effects: [
                    {
                        op: 'set_flag',
                        key: 'qi04_evidence_ready',
                        value: true,
                    },
                ],
            });
        }

        return {
            ...node,
            prompt: this.qi04EvidenceCount() >= 2
                ? '两份证据已经能互相印证。现在固定证据，还是再查最后一处？'
                : '第一份证据已经到手。至少再查一处，确认这不是某个人的片面记忆。',
            options,
        };
    }

    private applyEffect(effect: StoryEffect): void {
        if (!this.save) {
            return;
        }

        if (effect.op === 'set_flag') {
            SaveManager.addFlag(this.save, effect.key, effect.value);
        } else if (effect.op === 'add') {
            const current = asNumber(this.save.flags[effect.key]);
            this.save.flags[effect.key] = current + asNumber(effect.value);
        } else if (effect.op === 'add_favor') {
            RelationshipSystem.addFavor(
                this.save,
                effect.key,
                asNumber(effect.value),
            );
        } else if (effect.op === 'unlock_summon') {
            if (
                effect.value !== false &&
                !SummonSystem.unlock(this.save, effect.key)
            ) {
                this.view.showError(`无法开放${effect.key}的招募池。`);
            }
        } else if (effect.op === 'recruit') {
            if (
                effect.value !== false &&
                !CompanionSystem.recruit(
                    this.save,
                    effect.key,
                    this.save.nodeId,
                )
            ) {
                this.view.showError(`当前条件不足，无法招募${effect.key}。`);
            }
        } else if (effect.op === 'set_companion_active') {
            CompanionSystem.setActive(
                this.save,
                effect.key,
                effect.value === true,
            );
        }

        SaveManager.save(this.save);
    }

    private grantReward(node: StoryNode): void {
        if (!this.save) {
            return;
        }

        const settlementId = node.settlement_id;
        if (settlementId && SaveManager.hasClaimed(this.save, settlementId)) {
            return;
        }

        const granted: Record<string, number> = {};
        for (const item of node.items ?? []) {
            const count = asNumber(item.count);
            granted[item.id] = (granted[item.id] ?? 0) + count;
            SaveManager.addInventory(this.save, item.id, count);
        }

        if (settlementId) {
            SaveManager.claim(this.save, settlementId, granted);
        }
        SaveManager.save(this.save);
    }

    private applyDoubleReward(node: StoryNode): boolean {
        if (!this.save || SaveManager.hasClaimedAd(this.save, this.adClaimId(node))) {
            return false;
        }

        const reward = node.reward ?? {};
        const settlementId = String(reward.settlement_id ?? '');
        const multiplier = asNumber(reward.multiplier, 2);
        const original = this.save.settlementItems[settlementId];
        if (!settlementId || !original || multiplier <= 1) {
            return false;
        }

        const configuredReward = Object.keys(this.chapter?.nodes ?? {})
            .map((nodeId) => (this.chapter?.nodes ?? {})[nodeId])
            .find((candidate) => {
                return candidate.type === 'reward' &&
                    candidate.settlement_id === settlementId;
            });
        const configuredDouble = configuredReward?.ad_double;
        const include = new Set(
            ((node.ad_double?.include ??
                configuredDouble?.include ??
                Object.keys(original)) as string[]).map(String),
        );
        const exclude = new Set(
            (node.ad_double?.exclude ?? configuredDouble?.exclude ?? []) as string[],
        );
        for (const itemId of Object.keys(original)) {
            const count = original[itemId];
            if (include.has(itemId) && !exclude.has(itemId)) {
                SaveManager.addInventory(this.save, itemId, count * (multiplier - 1));
            }
        }
        SaveManager.claimAd(this.save, this.adClaimId(node));
        SaveManager.save(this.save);
        return true;
    }

    private adClaimId(node: StoryNode): string {
        return node.ad_placement ??
            `${this.save?.chapterId ?? 'chapter'}:${this.save?.nodeId ?? 'node'}`;
    }
}
