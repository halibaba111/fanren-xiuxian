import {
    Button,
    Canvas,
    Camera,
    Color,
    Component,
    director,
    EditBox,
    EventTouch,
    Graphics,
    Label,
    Mask,
    Node,
    Rect,
    ResolutionPolicy,
    resources,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    _decorator,
    view,
} from 'cc';
import { StoryEngine, StoryView } from '../core/StoryEngine';
import {
    ChapterData,
    EquipmentQuality,
    EquipmentSlot,
    HerbPlotStage,
    LocalSave,
    SpiritualRootCandidate,
    StoryItem,
    StoryNode,
} from '../core/StoryTypes';
import { SpiritualRootSystem } from '../core/SpiritualRootSystem';
import { SaveManager } from '../core/SaveManager';
import {
    MapBundleId,
    MapBundleManager,
} from '../core/MapBundleManager';
import {
    GAME_REGIONS,
    GameContentRegistry,
    GameRegionId,
    RegionConfig,
} from '../core/GameContentRegistry';
import { EventRouter } from '../core/EventRouter';
import {
    EquipmentForgeSystem,
    ForgeRecommendation,
} from '../core/EquipmentForgeSystem';
import { ProgressionSystem } from '../core/ProgressionSystem';
import { RelationshipSystem } from '../core/RelationshipSystem';
import { CompanionSystem } from '../core/CompanionSystem';
import {
    SUMMON_SINGLE_COST,
    SUMMON_TEN_COST,
    SUMMON_MALE_RATE,
    SUMMON_FEMALE_RATE,
    SUMMON_PITY_LIMIT,
    SummonSystem,
} from '../core/SummonSystem';
import { RewardedAdService } from '../core/RewardedAdService';
import { BattleAction, BattleState, BattleSystem } from '../core/BattleSystem';
import { EconomySystem, MARKET_OFFERS } from '../core/EconomySystem';
import {
    EquipmentRecommendationContext,
    EquipmentSortMode,
    EquipmentStatusFilter,
    InventorySystem,
} from '../core/InventorySystem';
import { TowerSystem } from '../core/TowerSystem';
import { CommissionSystem } from '../core/CommissionSystem';
import {
    BATTLE_RULES,
    EQUIPMENT_TEMPLATES,
    ITEM_DEFINITIONS,
    QUALITY_AFFIX_LIMIT,
    QUALITY_LABELS,
    SLOT_LABELS,
} from '../core/GameConfig';
import { TelemetryService } from '../core/TelemetryService';

// The target platform accepts a fixed portrait canvas. Keep all runtime layout
// calculations on this baseline so later screens cannot silently drift back to
// the old desktop-sized graybox.
const MOBILE_CANVAS = Object.freeze({
    width: 390,
    height: 844,
    sideInset: 16,
    safeTop: 18,
    safeBottom: 18,
});
const DESIGN_WIDTH = MOBILE_CANVAS.width;
const DESIGN_HEIGHT = MOBILE_CANVAS.height;
const CONTENT_WIDTH = DESIGN_WIDTH - MOBILE_CANVAS.sideInset * 2;
const CENTER_Y = 0;
const STORY_BACKGROUND_FALLBACK = 'bg_lanchuan_gate_dawn';
const ANNOUNCEMENT_VERSION = '2026-10-09-v4';
const BAG_SLOT_FILTERS: Array<EquipmentSlot | 'all'> = [
    'all',
    'weapon',
    'artifact',
    'armor',
    'head',
    'ring',
    'boots',
];
const BAG_QUALITY_FILTERS: Array<EquipmentQuality | 'all'> = [
    'all',
    'white',
    'green',
    'blue',
    'purple',
    'gold',
    'red',
];
const BAG_SORT_MODES: EquipmentSortMode[] = [
    'quality',
    'power',
    'refine',
    'slot',
    'latest',
];
const BAG_SORT_LABELS: Record<EquipmentSortMode, string> = {
    quality: '品质',
    power: '战力',
    refine: '温养',
    slot: '部位',
    latest: '最新',
};
const BAG_STATUS_FILTERS: EquipmentStatusFilter[] = [
    'all',
    'equipped',
    'replaceable',
    'cultivable',
    'sellable',
    'locked',
    'new_affix',
];
const BAG_STATUS_LABELS: Record<EquipmentStatusFilter, string> = {
    all: '全部',
    equipped: '已装备',
    replaceable: '可替换',
    cultivable: '可温养',
    sellable: '可出售',
    locked: '已锁定',
    new_affix: '待确认',
};

const COLORS = {
    background: new Color(13, 23, 34, 255),
    panel: new Color(25, 39, 51, 255),
    panelAlt: new Color(36, 54, 63, 255),
    ink: new Color(237, 231, 211, 255),
    muted: new Color(163, 177, 174, 255),
    jade: new Color(84, 174, 143, 255),
    ember: new Color(207, 126, 67, 255),
    danger: new Color(184, 79, 72, 255),
};

interface RewardedAction {
    placement: string;
    title: string;
    body: string;
    reward: string;
    onComplete: () => void | Promise<void>;
}

type TutorialStep =
    | ''
    | 'root_select'
    | 'system_map'
    | 'system_character'
    | 'system_summon'
    | 'system_bag'
    | 'system_tower'
    | 'map_task'
    | 'map_move'
    | 'chapter1_tasks'
    | 'chapter1_character'
    | 'chapter2_bag'
    | 'chapter2_forge';

type BagView = 'equipment' | 'consumables' | 'materials';

const { ccclass } = _decorator;

@ccclass('GrayboxBootstrap')
export class GrayboxBootstrap extends Component implements StoryView {
    private engine: StoryEngine | null = null;
    private root: Node | null = null;
    private bodyLabel: Label | null = null;
    private speakerLabel: Label | null = null;
    private promptLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private chapterLabel: Label | null = null;
    private choiceLayer: Node | null = null;
    private battleLayer: Node | null = null;
    private adLayer: Node | null = null;
    private adBusy = false;
    private adError = '';
    private activeAdNode: StoryNode | null = null;
    private activeRewardedAction: RewardedAction | null = null;
    private rootLayer: Node | null = null;
    private tutorialLayer: Node | null = null;
    private announcementLayer: Node | null = null;
    private announcementDismissedThisSession = false;
    private tutorialOfferOpen = false;
    private tutorialFocusNode: Node | null = null;
    private tutorialFocusElapsed = 0;
    private mapLayer: Node | null = null;
    private mapViewport: Node | null = null;
    private mapSceneLayer: Node | null = null;
    private mapTaskPanel: Node | null = null;
    private mapTaskExpanded = false;
    private mapJoystick: Node | null = null;
    private mapJoystickThumb: Node | null = null;
    private mapJoystickActive = false;
    private mapJoystickX = 0;
    private mapJoystickY = 0;
    private characterLayer: Node | null = null;
    private bagLayer: Node | null = null;
    private bagInventoryLabel: Label | null = null;
    private bagStatusLabel: Label | null = null;
    private bagPowderInput: EditBox | null = null;
    private bagSortMode: EquipmentSortMode = 'quality';
    private bagSlotFilter: EquipmentSlot | 'all' = 'all';
    private bagQualityFilter: EquipmentQuality | 'all' = 'all';
    private bagStatusFilter: EquipmentStatusFilter = 'all';
    private bagView: BagView = 'equipment';
    private bagSelectedEquipmentId = '';
    private bagSelectedAffixIndex = 0;
    private activityLayer: Node | null = null;
    private towerSelectedFloor = 1;
    private pendingForgeRecommendation: ForgeRecommendation | null = null;
    private commissionSelectedIndex = 0;
    private companionSelectedNpcId = '';
    private cultivationAdButton: Node | null = null;
    private forgeMaterialAdButton: Node | null = null;
    private forgePendingLabel: Label | null = null;
    private forgeAcceptButton: Node | null = null;
    private forgeRejectButton: Node | null = null;
    private worldMapLayer: Node | null = null;
    private eventPromptLayer: Node | null = null;
    private settingsLayer: Node | null = null;
    private regionStatusLabel: Label | null = null;
    private characterSystemLabel: Label | null = null;
    private regionEventNode: Node | null = null;
    private mapLocationNodes: Node[] = [];
    private continueButton: Node | null = null;
    private continueHandler: (() => void) | null = null;
    private tapLockUntil = 0;
    private battleHpLabel: Label | null = null;
    private battlePlayerHpLabel: Label | null = null;
    private battleManaLabel: Label | null = null;
    private battleStageLabel: Label | null = null;
    private battleEnemyIntentLabel: Label | null = null;
    private battleEnemyStatusLabel: Label | null = null;
    private backgroundSprite: Sprite | null = null;
    private portraitSprite: Sprite | null = null;
    private battleEnemySprite: Sprite | null = null;
    private rewardItemSprite: Sprite | null = null;
    private backgroundRequestId = 0;
    private portraitRequestId = 0;
    private battleRequestId = 0;
    private rewardRequestId = 0;
    private mapBackgroundRequestId = 0;
    private mapPlayerRequestId = 0;
    private battleState: BattleState | null = null;
    private battleFinishHandler:
        | ((victory: boolean, state: BattleState) => void)
        | null = null;
    private activeSave: LocalSave | null = null;
    private activeChapter: ChapterData | null = null;
    private initialHubShown = false;
    private mapBackgroundSprite: Sprite | null = null;
    private mapPlayerSprite: Sprite | null = null;
    private mapPlayerFrames: SpriteFrame[] = [];
    private mapPlayerFrameIndex = 0;
    private mapPlayerFrameElapsed = 0;
    private mapPlayerMoving = false;
    private mapMoveElapsed = 0;
    private mapMoveDuration = 0;
    private mapMoveStartX = 0;
    private mapMoveStartY = 0;
    private mapMoveTargetX = 0;
    private mapMoveTargetY = 0;
    private mapMoveRow = 0;
    private mapDestinationLocation = '';
    private mapLocationLabel: Label | null = null;
    private mapHintLabel: Label | null = null;
    private worldMapStatusLabel: Label | null = null;
    private worldMapRetryButton: Node | null = null;
    private worldMapRegionButtons = new Map<GameRegionId, Node>();
    private worldMapRetryRegion: RegionConfig | null = null;
    private mapDragging = false;
    private mapDragMoved = false;
    private mapDragStartX = 0;
    private mapDragStartY = 0;
    private mapDragOriginX = 0;
    private mapDragOriginY = 0;
    private radarGraphics: Graphics | null = null;
    private radarValueLabel: Label | null = null;
    private storyStartedFromMap = false;
    private activeMapBundleId: MapBundleId = 'map_outer';
    private activeRegionId: GameRegionId = 'map_outer';
    private mapBundleLoading = false;
    private mapBundleError = '';

    public update(deltaTime: number): void {
        if (this.tutorialFocusNode?.active) {
            this.tutorialFocusElapsed += deltaTime;
            const pulse = 1 + Math.sin(this.tutorialFocusElapsed * 5.2) * 0.045;
            this.tutorialFocusNode.setScale(pulse, pulse, 1);
        }

        if (this.mapPlayerMoving && this.mapPlayerSprite) {
            this.mapMoveElapsed = Math.min(
                this.mapMoveDuration,
                this.mapMoveElapsed + deltaTime,
            );
            const progress =
                this.mapMoveDuration <= 0
                    ? 1
                    : Math.min(1, this.mapMoveElapsed / this.mapMoveDuration);
            const eased = progress * progress * (3 - 2 * progress);
            const x =
                this.mapMoveStartX +
                (this.mapMoveTargetX - this.mapMoveStartX) * eased;
            const y =
                this.mapMoveStartY +
                (this.mapMoveTargetY - this.mapMoveStartY) * eased;
            this.mapPlayerSprite.node.setPosition(x, y, 0);
            this.mapPlayerFrameIndex = Math.floor(this.mapMoveElapsed / 0.12) % 4;
            this.applyMapPlayerFrame();
            this.followMapPlayer();

            if (progress >= 1) {
                this.mapPlayerMoving = false;
                this.mapPlayerFrameIndex = 0;
                this.mapPlayerFrameElapsed = 0;
                this.applyMapPlayerFrame();
                this.handleMapArrival(this.mapDestinationLocation);
                this.mapDestinationLocation = '';
            }
        }

        if (
            this.mapJoystickActive &&
            !this.mapPlayerMoving &&
            this.mapPlayerSprite
        ) {
            const current = this.mapPlayerSprite.node.position;
            const speed = 58 * deltaTime;
            const x = Math.min(280, Math.max(-280, current.x + this.mapJoystickX * speed));
            const y = Math.min(380, Math.max(-380, current.y + this.mapJoystickY * speed));
            this.mapPlayerSprite.node.setPosition(x, y, 0);
            const horizontal = Math.abs(this.mapJoystickX) >= Math.abs(this.mapJoystickY);
            if (horizontal) {
                this.mapMoveRow = 1;
                this.mapPlayerSprite.node.setScale(
                    this.mapJoystickX > 0 ? -1 : 1,
                    1,
                    1,
                );
            } else {
                this.mapMoveRow = this.mapJoystickY > 0 ? 3 : 0;
                this.mapPlayerSprite.node.setScale(1, 1, 1);
            }
            this.mapPlayerFrameElapsed += deltaTime;
            this.mapPlayerFrameIndex = Math.floor(this.mapPlayerFrameElapsed / 0.145) % 4;
            this.applyMapPlayerFrame();
            this.followMapPlayer();
        }
    }

    public start(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.SHOW_ALL);
        void this.preloadCoreMapBundles();
        void this.boot();
    }

    public render(node: StoryNode, save: LocalSave, chapter: ChapterData): void {
        this.activeSave = save;
        this.activeChapter = chapter;
        this.maybeShowAnnouncement(save);
        if (
            save.root_roll_locked &&
            save.nodeId === chapter.start_node &&
            !this.initialHubShown
        ) {
            this.initialHubShown = true;
            this.renderMapHub(save, chapter);
            return;
        }

        this.updateStatus(save, chapter);
        this.loadBackground(chapter.background ?? '');
        this.hideActionLayers();

        if (node.type === 'narration' || node.type === 'say') {
            this.renderText(node);
            this.showContinue(() => this.engine?.continue());
            this.renderTutorialOverlay();
            return;
        }

        if (node.type === 'choice') {
            this.renderText(node);
            this.renderChoices(node);
            this.renderTutorialOverlay();
            return;
        }

        if (node.type === 'battle') {
            this.renderBattle(node, save);
            this.renderTutorialOverlay();
            return;
        }

        if (node.type === 'reward') {
            this.renderReward(node);
            this.showContinue(() => this.engine?.continue());
            this.renderTutorialOverlay();
            return;
        }

        if (node.type === 'ad') {
            this.renderAd(node);
            this.renderTutorialOverlay();
            return;
        }

        if (node.type === 'end') {
            this.renderEnd(node);
            this.renderTutorialOverlay();
            return;
        }

        this.renderText({
            type: 'narration',
            text: `未处理的节点类型：${node.type}`,
        });
        this.showContinue(() => this.engine?.continue());
        this.renderTutorialOverlay();
    }

    public renderHome(save: LocalSave, chapter: ChapterData): void {
        this.renderMapHub(save, chapter);
    }

    public showError(message: string): void {
        this.initialHubShown = true;
        this.hideActionLayers();
        if (this.speakerLabel) {
            this.speakerLabel.string = '提示';
        }
        if (this.bodyLabel) {
            this.bodyLabel.string = message;
            this.bodyLabel.color = COLORS.danger;
        }
    }

    public renderRootSelection(save: LocalSave, chapter: ChapterData): void {
        if (!this.rootLayer) {
            return;
        }

        this.hideActionLayers();
        this.hideVisuals();
        this.loadBackground(chapter.background ?? '');
        this.rootLayer.removeAllChildren();
        this.rootLayer.active = true;
        this.updateStatus(save, chapter);

        this.createPanel(
            this.rootLayer,
            'RootPanel',
            CONTENT_WIDTH,
            DESIGN_HEIGHT - MOBILE_CANVAS.safeTop - MOBILE_CANVAS.safeBottom,
            0,
            CENTER_Y,
            COLORS.panel,
        );
        this.createLabel(
            this.rootLayer,
            'RootTitle',
            '灵根初测',
            25,
            CONTENT_WIDTH - 24,
            42,
            0,
            350,
            COLORS.ink,
        );
        const subtitle = this.createLabel(
            this.rootLayer,
            'RootSubtitle',
            '三种资质同时显现，选择一种作为你的起点',
            15,
            CONTENT_WIDTH - 28,
            40,
            0,
            308,
            COLORS.muted,
        );
        subtitle.enableWrapText = true;

        const candidates = save.spiritual_root_candidates ?? [];
        candidates.forEach((candidate, index) => {
            this.createRootCandidateCard(this.rootLayer as Node, candidate, index);
        });

        const rerollState = this.engine?.getRootRerollState() ?? {
            freeRemaining: 3,
            adRequired: false,
            canReroll: true,
        };
        const rerollLabel = !rerollState.canReroll
            ? '刷新次数已用尽'
            : rerollState.adRequired
              ? '刷新灵根 · 看广告保证稀有'
              : `刷新灵根 · 免费剩余 ${rerollState.freeRemaining} 次`;
        const rerollButton = this.createButton(
            this.rootLayer,
            'RootRerollButton',
            rerollLabel,
            0,
            -258,
            CONTENT_WIDTH - 36,
            46,
            rerollState.adRequired ? COLORS.ember : COLORS.panelAlt,
            () => this.handleRootReroll(),
        );
        const rerollControl = rerollButton.getComponent(Button);
        if (rerollControl) {
            rerollControl.interactable = rerollState.canReroll;
        }
        const rerollHint = this.createLabel(
            this.rootLayer,
            'RootRerollHint',
            rerollState.adRequired
                ? '看完后可以再刷一次，至少会出地灵根。'
                : '最多能刷 4 次，第 4 次需要看广告。',
            12,
            CONTENT_WIDTH - 32,
            32,
            0,
            -300,
            COLORS.muted,
        );
        rerollHint.enableWrapText = true;
        const footnote = this.createLabel(
            this.rootLayer,
            'RootFootnote',
            '锁定后会记进存档，重启或重玩也不会重新生成。',
            13,
            CONTENT_WIDTH - 28,
            44,
            0,
            -348,
            COLORS.muted,
        );
        footnote.enableWrapText = true;
        this.prepareTutorialOffer(save);
        this.renderTutorialOverlay();
        this.maybeShowAnnouncement(save);
    }

    private prepareTutorialOffer(save: LocalSave): void {
        this.tutorialOfferOpen = false;
        if (!save.root_roll_locked) {
            save.tutorialEnabled = false;
            save.tutorialStep = '';
            SaveManager.save(save);
            return;
        }
        if (
            save.tutorialStep === 'root_select' ||
            (save.tutorialStep as string) === 'root_draw' ||
            (save.tutorialStep as string) === 'root_lock'
        ) {
            save.tutorialEnabled = false;
            save.tutorialStep = '';
            SaveManager.save(save);
        }
    }

    private tutorialStartStep(save: LocalSave): TutorialStep {
        if (!save.root_roll_locked) {
            return '';
        }
        return 'system_map';
    }

    private startPostRootTutorial(save: LocalSave): void {
        if (
            !save.root_roll_locked ||
            save.tutorialSkipped ||
            save.tutorialComplete
        ) {
            return;
        }
        this.tutorialOfferOpen = false;
        save.tutorialOfferSeen = true;
        save.tutorialEnabled = true;
        save.tutorialStep = 'system_map';
        SaveManager.save(save);
        this.activeSave = save;
    }

    private setTutorialStep(step: TutorialStep): void {
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save) {
            return;
        }
        save.tutorialOfferSeen = true;
        save.tutorialEnabled = Boolean(step);
        save.tutorialStep = step;
        if (step) {
            save.tutorialComplete = false;
            save.tutorialSkipped = false;
        }
        SaveManager.save(save);
        this.activeSave = save;
        this.renderTutorialOverlay();
    }

    private startTutorial(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save) {
            return;
        }
        this.tutorialOfferOpen = false;
        save.tutorialOfferSeen = true;
        save.tutorialEnabled = true;
        save.tutorialComplete = false;
        save.tutorialSkipped = false;
        save.tutorialStep = this.tutorialStartStep(save);
        SaveManager.save(save);
        this.activeSave = save;
        this.renderTutorialOverlay();
    }

    private skipTutorial(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        this.tutorialOfferOpen = false;
        if (save) {
            save.tutorialOfferSeen = true;
            save.tutorialEnabled = false;
            save.tutorialStep = '';
            save.tutorialComplete = false;
            save.tutorialSkipped = true;
            SaveManager.save(save);
        }
        this.hideTutorialOverlay();
    }

    private finishTutorialPhase(message = ''): void {
        const save = this.activeSave ?? this.engine?.getSave();
        this.tutorialOfferOpen = false;
        if (save) {
            save.tutorialOfferSeen = true;
            save.tutorialEnabled = false;
            save.tutorialStep = '';
            save.tutorialComplete =
                save.tutorialChapter1GuideDone &&
                save.tutorialChapter2GuideDone;
            save.tutorialSkipped = false;
            SaveManager.save(save);
        }
        this.hideTutorialOverlay();
        if (message && this.mapHintLabel) {
            this.mapHintLabel.string = message;
        }
    }

    private finishTutorial(message = ''): void {
        const save = this.activeSave ?? this.engine?.getSave();
        this.tutorialOfferOpen = false;
        if (save) {
            save.tutorialOfferSeen = true;
            save.tutorialEnabled = false;
            save.tutorialStep = '';
            save.tutorialComplete = true;
            save.tutorialSkipped = false;
            SaveManager.save(save);
        }
        this.hideTutorialOverlay();
        if (message && this.mapHintLabel) {
            this.mapHintLabel.string = message;
        }
    }

    private finishChapterGuide(chapter: 'chapter1' | 'chapter2'): void {
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save || save.tutorialSkipped) {
            return;
        }
        if (chapter === 'chapter1') {
            save.tutorialChapter1GuideDone = true;
        } else {
            save.tutorialChapter2GuideDone = true;
        }
        this.finishTutorialPhase(
            chapter === 'chapter1'
                ? '第一章看完了：任务和人物入口都记下了。'
                : '第二章看完了：背包和淬炼台入口都记下了。',
        );
    }

    private stopMainlineIntro(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save) {
            return;
        }
        save.tutorialEnabled = false;
        save.tutorialStep = '';
        SaveManager.save(save);
        this.hideTutorialOverlay();
    }

    private startPendingChapterGuide(save: LocalSave): void {
        if (
            save.tutorialSkipped ||
            !save.tutorialOfferSeen ||
            save.tutorialComplete
        ) {
            return;
        }
        const chapter2Complete =
            save.completedChapters.indexOf('qi_02') >= 0 ||
            save.flags.main_chapter2_complete === true;
        const chapter1Complete =
            save.completedChapters.indexOf('qi_01') >= 0 ||
            save.flags.main_chapter1_complete === true;
        if (!save.tutorialChapter2GuideDone && chapter2Complete) {
            this.setTutorialStep('chapter2_bag');
            return;
        }
        if (!save.tutorialChapter1GuideDone && chapter1Complete) {
            this.setTutorialStep('chapter1_tasks');
        }
    }

    private advanceTutorial(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        const step = save?.tutorialStep as TutorialStep | undefined;
        if (!save || !save.tutorialEnabled || !step) {
            return;
        }

        const systemNext: Partial<Record<Exclude<TutorialStep, ''>, TutorialStep>> = {
            system_map: 'system_character',
            system_character: 'system_summon',
            system_summon: 'system_bag',
            system_bag: 'system_tower',
            system_tower: '',
        };
        if (Object.prototype.hasOwnProperty.call(systemNext, step)) {
            const next = systemNext[step] ?? '';
            if (!next) {
                this.finishTutorial('系统说明已完成，可自由探索。');
                return;
            }
            this.setTutorialStep(next);
            this.openSystemTutorialPanel(next);
            return;
        }

        if (step === 'root_select' && !save.root_roll_locked) {
            if (this.mapHintLabel) {
                this.mapHintLabel.string =
                    '先点一张灵根卡；选好后会自动进入下一步。';
            }
            return;
        }
        if (step === 'map_task' && !this.mapTaskExpanded) {
            return;
        }
        if (step === 'map_move') {
            this.stopMainlineIntro();
            return;
        }
        if (step === 'chapter1_tasks') {
            if (!this.mapTaskExpanded) {
                return;
            }
            this.setTutorialStep('chapter1_character');
            return;
        }
        if (step === 'chapter1_character') {
            if (!this.characterLayer?.active) {
                return;
            }
            this.finishChapterGuide('chapter1');
            return;
        }
        if (step === 'chapter2_bag') {
            this.setTutorialStep('chapter2_forge');
            return;
        }
        if (step === 'chapter2_forge') {
            this.finishChapterGuide('chapter2');
            return;
        }
        const next: Partial<Record<Exclude<TutorialStep, ''>, TutorialStep>> = {
            root_select: 'map_task',
            map_task: 'map_move',
        };
        this.setTutorialStep(next[step] ?? '');
    }

    private openSystemTutorialPanel(step: TutorialStep): void {
        switch (step) {
            case 'system_map':
                this.openMapScene();
                return;
            case 'system_character':
                this.openCharacterPanel();
                return;
            case 'system_summon':
                this.openSummonPanel();
                return;
            case 'system_bag':
                this.openBagPanel();
                return;
            case 'system_tower':
                this.openTowerPanel();
                return;
            default:
                return;
        }
    }

    private tutorialCopy(step: TutorialStep): {
        title: string;
        body: string;
        focus: string;
    } {
        const copy: Record<Exclude<TutorialStep, ''>, {
            title: string;
            body: string;
            focus: string;
        }> = {
            root_select: {
                title: '基础操作 · 选择灵根',
                body: '候选灵根、重抽和锁定都由你自己操作。可以点击任意灵根卡，也可以先重抽；前三次刷新免费，第 4 次刷新需要完整观看广告，并保证出现地灵根。',
                focus: 'root',
            },
            system_map: {
                title: '系统说明 · 地图、任务与药圃',
                body: '地图是探索主界面：区域和地点用于推进事件，任务栏记录当前目标；抵达后山后可进入药圃播种、照料和收获。',
                focus: 'map',
            },
            system_character: {
                title: '系统说明 · 修炼与突破',
                body: '人物页用于积累修为、查看属性和执行突破。修为达到阶段要求后，先看清条件再进行突破。',
                focus: 'character',
            },
            system_summon: {
                title: '系统说明 · 招募与伙伴',
                body: '招募页用于抽取和管理伙伴，培养入口可以提升好感与互动；契片商店可兑换培养所需的伙伴资源。',
                focus: 'summon',
            },
            system_bag: {
                title: '系统说明 · 背包与淬炼台',
                body: '背包集中管理装备、材料和线索；装备可以进入淬炼台生成词条，并选择替换或保留结果。',
                focus: 'bag',
            },
            system_tower: {
                title: '系统说明 · 无名塔与奇遇',
                body: '无名塔提供逐层挑战和奇遇事件，地图上的 PVE 挑战点也能用于战斗与装备获取。',
                focus: 'tower',
            },
            map_task: {
                title: '基础操作 · 看任务',
                body: '进入山门后，地图右侧的任务栏会告诉你当前目标。点击任务栏展开目标详情。',
                focus: 'task',
            },
            map_move: {
                title: '基础操作 · 进入主线',
                body: '在任务详情中点击“前往”，抵达目标地点后点击“走近看看”进入主线。进入主线后不再弹操作引导。',
                focus: 'west',
            },
            chapter1_tasks: {
                title: '第一章完成 · 任务栏目',
                body: '这里可以查看当前主线和支线目标。点击任务栏展开详情，再选择前往或进入线索。',
                focus: 'task',
            },
            chapter1_character: {
                title: '第一章完成 · 人物栏目',
                body: '点击底部“人物”查看属性、修为、法宝和人物关系；修炼与突破也在这里操作。',
                focus: 'character',
            },
            chapter2_bag: {
                title: '第二章完成 · 背包栏目',
                body: '点击底部“背包”查看已获得的武器、材料和任务道具。',
                focus: 'bag',
            },
            chapter2_forge: {
                title: '第二章完成 · 淬炼台',
                body: '在背包中进入淬炼台。武器可以反复重淬，生成新词条后再选择替换或保留。',
                focus: 'forge',
            },
        };
        return step ? copy[step] : { title: '', body: '', focus: '' };
    }

    private tutorialTarget(focus: string): Node | null {
        if (focus === 'root') {
            return this.rootLayer;
        }
        if (focus === 'map') {
            return this.mapSceneLayer ??
                this.mapLayer?.getChildByName('HubNavigation') ??
                null;
        }
        if (focus === 'task') {
            return this.mapTaskPanel;
        }
        if (focus === 'bag') {
            return this.mapLayer
                ?.getChildByName('HubNavigation')
                ?.getChildByName('BagTabButton') ?? null;
        }
        if (focus === 'forge') {
            return (this.characterLayer?.active
                ? this.characterLayer.getChildByName('ForgeButton')
                : this.bagLayer?.getChildByName('BagForgeButton')) ??
                this.characterLayer?.getChildByName('ForgeButton') ??
                this.bagLayer?.getChildByName('BagForgeButton') ??
                null;
        }
        if (focus === 'west') {
            return this.eventPromptLayer?.active
                ? this.eventPromptLayer.getChildByName('EnterEventButton') ??
                    this.mapSceneLayer?.getChildByName('WestCorridorLocation') ??
                    null
                : this.mapSceneLayer?.getChildByName('WestCorridorLocation') ?? null;
        }
        if (focus === 'character') {
            return this.mapLayer
                ?.getChildByName('HubNavigation')
                ?.getChildByName('CharacterTabButton') ?? null;
        }
        if (focus === 'summon') {
            return this.mapLayer
                ?.getChildByName('HubNavigation')
                ?.getChildByName('SummonTabButton') ?? null;
        }
        if (focus === 'tower') {
            return this.activityLayer?.active
                ? this.activityLayer
                : this.mapLayer?.getChildByName('HubNavigation') ?? null;
        }
        return null;
    }

    private createTutorialFocus(target: Node): void {
        if (!this.tutorialLayer || !this.root) {
            return;
        }
        const rootTransform = this.root.getComponent(UITransform);
        const targetTransform = target.getComponent(UITransform);
        if (!rootTransform || !targetTransform) {
            return;
        }
        const local = rootTransform.convertToNodeSpaceAR(target.worldPosition);
        const frame = new Node('TutorialFocus');
        this.tutorialLayer.addChild(frame);
        frame.setPosition(local);
        const width = targetTransform.contentSize.width + 12;
        const height = targetTransform.contentSize.height + 12;
        frame.addComponent(UITransform).setContentSize(width, height);
        const graphics = frame.addComponent(Graphics);
        graphics.lineWidth = 3;
        graphics.strokeColor = COLORS.jade;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.stroke();
        this.tutorialFocusNode = frame;
        this.tutorialFocusElapsed = 0;
    }

    private renderTutorialOverlay(): void {
        if (!this.tutorialLayer) {
            return;
        }
        this.hideTutorialOverlay();
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save) {
            return;
        }
        const legacyRootStep = ['root_draw', 'root_select', 'root_lock'].includes(
            save.tutorialStep as string,
        );
        if (!save.root_roll_locked) {
            if (save.tutorialEnabled || save.tutorialStep || this.tutorialOfferOpen) {
                this.tutorialOfferOpen = false;
                save.tutorialEnabled = false;
                save.tutorialStep = '';
                SaveManager.save(save);
            }
            return;
        }
        if (legacyRootStep) {
            this.startPostRootTutorial(save);
        }
        const step = save.tutorialEnabled
            ? (save.tutorialStep as TutorialStep)
            : '';
        if (!step) {
            return;
        }
        const copy = this.tutorialCopy(step);
        if (!copy.title) {
            this.hideTutorialOverlay();
            return;
        }
        this.tutorialLayer.active = true;
        const target = this.tutorialTarget(copy.focus);
        if (target) {
            this.createTutorialFocus(target);
        }
        const tutorialPanelY =
            copy.focus === 'root'
                ? 330
                : copy.focus === 'task'
                  ? -244
                  : 266;
        this.createPanel(
            this.tutorialLayer,
            'TutorialGuidePanel',
            CONTENT_WIDTH - 28,
            176,
            0,
            tutorialPanelY,
            new Color(7, 17, 24, 242),
        );
        const title = this.createLabel(
            this.tutorialLayer,
            'TutorialGuideTitle',
            copy.title,
            18,
            CONTENT_WIDTH - 42,
            30,
            0,
            tutorialPanelY + 64,
            COLORS.ember,
        );
        title.enableWrapText = true;
        const body = this.createLabel(
            this.tutorialLayer,
            'TutorialGuideBody',
            copy.body,
            13,
            CONTENT_WIDTH - 42,
            80,
            0,
            tutorialPanelY + 20,
            COLORS.ink,
        );
        body.enableWrapText = true;
        this.createButton(
            this.tutorialLayer,
            'TutorialGuideSkip',
            '跳过引导',
            -82,
            tutorialPanelY - 68,
            142,
            40,
            COLORS.panelAlt,
            () => this.skipTutorial(),
        );
        this.createButton(
            this.tutorialLayer,
            'TutorialGuideNext',
            step === 'map_move' ||
                step === 'system_tower' ||
                step === 'chapter1_character' ||
                step === 'chapter2_forge'
                ? '知道了'
                : '下一步',
            82,
            tutorialPanelY - 68,
            142,
            40,
            COLORS.jade,
            () => this.advanceTutorial(),
        );
    }

    private hideTutorialOverlay(): void {
        if (!this.tutorialLayer) {
            return;
        }
        this.tutorialLayer.active = false;
        this.tutorialLayer.removeAllChildren();
        this.tutorialFocusNode = null;
        this.tutorialFocusElapsed = 0;
    }

    private handleRootReroll(): void {
        const state = this.engine?.getRootRerollState();
        if (!state?.canReroll) {
            return;
        }
        if (!state.adRequired) {
            this.engine?.rerollSpiritualRoots(false);
            return;
        }

        this.openRewardedAction({
            placement: 'root_reroll_4th',
            title: '刷新灵根',
            body: '前三次免费刷新已经用尽，看广告后可以再刷新一次灵根。',
            reward: '立即刷新一次，并保证候选中至少出现地灵根。',
            onComplete: () => {
                this.engine?.rerollSpiritualRoots(true);
            },
        });
    }

    private async boot(): Promise<void> {
        this.buildUi();
        this.engine = new StoryEngine(this);
        await this.engine.load('qi_01');
    }

    private async preloadCoreMapBundles(): Promise<void> {
        try {
            await MapBundleManager.preload([
                'world_map',
                'common_items',
                'map_outer',
            ]);
        } catch (error) {
            // The graybox can still load legacy resources while bundles are
            // being configured in the Cocos editor.
            console.warn('[MapBundleManager] core preload skipped', error);
        }
    }

    public async enterMapBundle(bundleId: MapBundleId): Promise<boolean> {
        if (bundleId === this.activeMapBundleId) {
            this.mapBundleError = '';
            this.worldMapRetryRegion = null;
            this.updateWorldMapLoadState();
            return true;
        }
        if (this.mapBundleLoading) {
            return false;
        }

        this.mapBundleLoading = true;
        this.mapBundleError = '';
        this.setWorldMapRegionButtonsEnabled(false);
        this.updateWorldMapLoadState();
        if (this.mapHintLabel) {
            this.mapHintLabel.string = '正在打开区域……';
        }
        try {
            await MapBundleManager.load(bundleId);
            MapBundleManager.releaseAreaBundles(bundleId);
            this.activeMapBundleId = bundleId;
            this.mapBundleError = '';
            return true;
        } catch (error) {
            this.mapBundleError = '这里暂时进不去，请稍后再试。';
            if (this.mapHintLabel) {
                this.mapHintLabel.string = this.mapBundleError;
            }
            console.warn(
                `[MapBundleManager] failed to enter ${bundleId}`,
                error,
            );
            return false;
        } finally {
            this.mapBundleLoading = false;
            this.setWorldMapRegionButtonsEnabled(true);
            this.updateWorldMapLoadState();
        }
    }

    private buildUi(): void {
        const scene = director.getScene();
        if (!scene) {
            return;
        }

        if (scene.getComponentsInChildren(Camera).length === 0) {
            const cameraNode = new Node('Camera');
            scene.addChild(cameraNode);
            cameraNode.addComponent(Camera);
        }

        let canvasNode = scene.getChildByName('Canvas');
        if (!canvasNode) {
            canvasNode = new Node('Canvas');
            scene.addChild(canvasNode);
            canvasNode.addComponent(Canvas);
        }

        this.root = new Node('GrayboxRoot');
        canvasNode.addChild(this.root);
        const rootTransform = this.root.addComponent(UITransform);
        rootTransform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);

        this.createPanel(
            this.root,
            'Background',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            COLORS.background,
        );
        this.backgroundSprite = this.createSprite(
            this.root,
            'BackgroundArt',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            CENTER_Y,
        );

        this.createPanel(
            this.root,
            'Header',
            CONTENT_WIDTH,
            80,
            0,
            355,
            COLORS.panel,
        );
        this.portraitSprite = this.createSprite(
            this.root,
            'PortraitArt',
            150,
            160,
            0,
            360,
        );
        this.chapterLabel = this.createLabel(
            this.root,
            'ChapterLabel',
            '',
            18,
            CONTENT_WIDTH,
            28,
            0,
            372,
            COLORS.jade,
        );
        this.statusLabel = this.createLabel(
            this.root,
            'StatusLabel',
            '',
            13,
            CONTENT_WIDTH,
            24,
            0,
            339,
            COLORS.muted,
        );

        this.createPanel(
            this.root,
            'StoryPanel',
            CONTENT_WIDTH,
            420,
            0,
            70,
            COLORS.panel,
        );
        this.speakerLabel = this.createLabel(
            this.root,
            'SpeakerLabel',
            '旁白',
            18,
            CONTENT_WIDTH,
            32,
            0,
            226,
            COLORS.ember,
        );
        this.bodyLabel = this.createLabel(
            this.root,
            'BodyLabel',
            '',
            20,
            CONTENT_WIDTH,
            220,
            0,
            120,
            COLORS.ink,
        );
        this.bodyLabel.enableWrapText = true;
        this.promptLabel = this.createLabel(
            this.root,
            'PromptLabel',
            '',
            16,
            CONTENT_WIDTH,
            90,
            0,
            -48,
            COLORS.muted,
        );
        this.promptLabel.enableWrapText = true;

        this.choiceLayer = new Node('ChoiceLayer');
        this.root.addChild(this.choiceLayer);
        this.battleLayer = new Node('BattleLayer');
        this.root.addChild(this.battleLayer);
        this.adLayer = new Node('AdLayer');
        this.root.addChild(this.adLayer);
        this.adLayer.addComponent(UITransform).setContentSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
        );
        this.adLayer.on(
            Node.EventType.TOUCH_START,
            (event: EventTouch) => {
                event.propagationStopped = true;
            },
            this,
        );
        this.adLayer.on(
            Node.EventType.TOUCH_MOVE,
            (event: EventTouch) => {
                event.propagationStopped = true;
            },
            this,
        );
        this.adLayer.on(
            Node.EventType.TOUCH_END,
            (event: EventTouch) => {
                event.propagationStopped = true;
            },
            this,
        );
        this.adLayer.on(
            Node.EventType.TOUCH_CANCEL,
            (event: EventTouch) => {
                event.propagationStopped = true;
            },
            this,
        );
        this.rootLayer = new Node('SpiritualRootLayer');
        this.root.addChild(this.rootLayer);
        this.rootLayer.active = false;

        this.eventPromptLayer = new Node('EventPromptLayer');
        this.root.addChild(this.eventPromptLayer);
        this.eventPromptLayer.active = false;

        this.settingsLayer = new Node('EventSettingsLayer');
        this.root.addChild(this.settingsLayer);
        this.settingsLayer.active = false;

        this.mapLayer = new Node('MapHubLayer');
        this.root.addChild(this.mapLayer);
        this.mapLayer.active = false;
        this.buildMapHub();

        this.battleStageLabel = this.createLabel(
            this.battleLayer,
            'BattleStageLabel',
            '',
            18,
            CONTENT_WIDTH,
            34,
            0,
            195,
            COLORS.ember,
        );
        this.battleHpLabel = this.createLabel(
            this.battleLayer,
            'BattleHpLabel',
            '',
            20,
            CONTENT_WIDTH,
            38,
            0,
            155,
            COLORS.ink,
        );
        this.battlePlayerHpLabel = this.createLabel(
            this.battleLayer,
            'BattlePlayerHpLabel',
            '',
            14,
            CONTENT_WIDTH,
            28,
            0,
            124,
            COLORS.jade,
        );
        this.battleManaLabel = this.createLabel(
            this.battleLayer,
            'BattleManaLabel',
            '',
            13,
            CONTENT_WIDTH,
            28,
            0,
            96,
            COLORS.ink,
        );
        this.battleEnemySprite = this.createSprite(
            this.battleLayer,
            'BattleEnemyArt',
            150,
            150,
            0,
            65,
        );
        this.battleEnemyIntentLabel = this.createLabel(
            this.battleLayer,
            'BattleEnemyIntentLabel',
            '',
            13,
            CONTENT_WIDTH - 24,
            32,
            0,
            -18,
            COLORS.ink,
        );
        this.battleEnemyIntentLabel.enableWrapText = true;
        this.battleEnemyStatusLabel = this.createLabel(
            this.battleLayer,
            'BattleEnemyStatusLabel',
            '',
            12,
            CONTENT_WIDTH - 24,
            28,
            0,
            -48,
            COLORS.jade,
        );
        this.battleEnemyStatusLabel.enableWrapText = true;

        this.rewardItemSprite = this.createSprite(
            this.root,
            'RewardItemArt',
            82,
            82,
            140,
            92,
        );

        this.continueButton = this.createButton(
            this.root,
            'ContinueButton',
            '继续',
            0,
            -374,
            CONTENT_WIDTH,
            58,
            COLORS.jade,
            () => this.continueHandler?.(),
        );
        this.continueButton.active = false;

        this.tutorialLayer = new Node('TutorialLayer');
        this.root.addChild(this.tutorialLayer);
        this.tutorialLayer.addComponent(UITransform).setContentSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
        );
        this.tutorialLayer.on(
            Node.EventType.TOUCH_START,
            this.handleTutorialOfferTouch,
            this,
        );
        this.tutorialLayer.on(
            Node.EventType.TOUCH_MOVE,
            this.handleTutorialOfferTouch,
            this,
        );
        this.tutorialLayer.on(
            Node.EventType.TOUCH_END,
            this.handleTutorialOfferTouch,
            this,
        );
        this.tutorialLayer.on(
            Node.EventType.TOUCH_CANCEL,
            this.handleTutorialOfferTouch,
            this,
        );
        this.tutorialLayer.active = false;

        this.announcementLayer = new Node('AnnouncementLayer');
        this.root.addChild(this.announcementLayer);
        this.announcementLayer.addComponent(UITransform).setContentSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
        );
        this.announcementLayer.on(
            Node.EventType.TOUCH_START,
            this.handleAnnouncementTouch,
            this,
        );
        this.announcementLayer.on(
            Node.EventType.TOUCH_MOVE,
            this.handleAnnouncementTouch,
            this,
        );
        this.announcementLayer.on(
            Node.EventType.TOUCH_END,
            this.handleAnnouncementTouch,
            this,
        );
        this.announcementLayer.on(
            Node.EventType.TOUCH_CANCEL,
            this.handleAnnouncementTouch,
            this,
        );
        this.announcementLayer.active = false;
    }

    private handleTutorialOfferTouch(event: EventTouch): void {
        if (this.tutorialOfferOpen) {
            event.propagationStopped = true;
        }
    }

    private handleAnnouncementTouch(event: EventTouch): void {
        event.propagationStopped = true;
    }

    private maybeShowAnnouncement(save: LocalSave): void {
        if (
            !this.announcementLayer ||
            save.announcementSeenVersion === ANNOUNCEMENT_VERSION ||
            this.announcementDismissedThisSession ||
            this.announcementLayer.active
        ) {
            return;
        }

        this.showAnnouncement();
    }

    private showAnnouncement(): void {
        if (!this.announcementLayer || !this.root) {
            return;
        }

        this.announcementLayer.removeAllChildren();
        this.announcementLayer.active = true;
        this.announcementLayer.setSiblingIndex(this.root.children.length - 1);

        const backdrop = this.createPanel(
            this.announcementLayer,
            'AnnouncementBackdrop',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            new Color(4, 11, 16, 224),
        );
        backdrop.on(
            Node.EventType.TOUCH_START,
            this.handleAnnouncementTouch,
            this,
        );
        backdrop.on(
            Node.EventType.TOUCH_MOVE,
            this.handleAnnouncementTouch,
            this,
        );
        backdrop.on(
            Node.EventType.TOUCH_END,
            this.handleAnnouncementTouch,
            this,
        );
        backdrop.on(
            Node.EventType.TOUCH_CANCEL,
            this.handleAnnouncementTouch,
            this,
        );

        this.createPanel(
            this.announcementLayer,
            'AnnouncementPanel',
            CONTENT_WIDTH - 4,
            770,
            0,
            CENTER_Y,
            new Color(24, 38, 47, 255),
        );
        this.createPanel(
            this.announcementLayer,
            'AnnouncementAccent',
            56,
            4,
            -128,
            349,
            COLORS.ember,
        );
        this.createLabel(
            this.announcementLayer,
            'AnnouncementKicker',
            '本次更新',
            12,
            CONTENT_WIDTH - 40,
            22,
            0,
            350,
            COLORS.jade,
        );
        this.createLabel(
            this.announcementLayer,
            'AnnouncementTitle',
            '岚川修行 · 更新公告',
            25,
            CONTENT_WIDTH - 34,
            42,
            0,
            310,
            COLORS.ink,
        );
        this.createLabel(
            this.announcementLayer,
            'AnnouncementVersion',
            '公告版本 · 2026 年 10 月 9 日 · v4',
            12,
            CONTENT_WIDTH - 44,
            24,
            0,
            275,
            COLORS.muted,
        );

        const copy = this.createLabel(
            this.announcementLayer,
            'AnnouncementCopy',
            [
                '本次更新围绕“剧情推进、伙伴招募、修行培养”展开。',
                '',
                '01  剧情新增',
                '第一至第六章主线正式接入，灰牌入山、无名档案与内门封录等线索会在选择和调查中逐步展开。',
                '',
                '02  伙伴招募',
                '招募台独立开放，许照棠、苏晚潮、关砚秋、叶沉星会随剧情解锁。单抽 24 灵石，十连 216 灵石；人物基础出率为男性 3%、女性 1%，新存档第 1 次招募优先回应 1 名未招募伙伴，连续 29 次未出人物时第 30 次必得人物。',
                '',
                '03  伙伴培养',
                '角色面板支持静修、突破、好感成长和伙伴编队；最多 3 名伙伴出战，互动、礼物与支援会持续影响修行。',
                '',
                '04  装备与挑战',
                '法宝词条、淬炼、无名塔奇遇、委托与坊市经济循环加入，探索与成长都有新的目标。',
                '',
                '05  存档与体验',
                '三档本地存档、可用时的云端同步，以及移动端地图和资源分包体验同步优化；招募五连、静修、淬炼、复起与结算翻倍的激励广告奖励已统一接入。',
            ].join('\n'),
            14,
            CONTENT_WIDTH - 38,
            492,
            0,
            43,
            COLORS.ink,
        );
        copy.enableWrapText = true;
        copy.lineHeight = 20;

        const save = this.activeSave ?? this.engine?.getSave();
        const updateRewardMessage = save
            ? SummonSystem.updateRewardUnavailableReason(save)
            : '更新奖励将在进入游戏后到账。';
        this.createLabel(
            this.announcementLayer,
            'AnnouncementReward',
            updateRewardMessage
                ? `更新奖励\n${updateRewardMessage}`
                : '更新奖励\n免费十连抽 ×1（每位玩家仅可领取一次）',
            14,
            CONTENT_WIDTH - 42,
            42,
            0,
            -225,
            updateRewardMessage ? COLORS.muted : COLORS.jade,
        ).enableWrapText = true;
        const rewardButton = this.createButton(
            this.announcementLayer,
            'AnnouncementRewardClaim',
            updateRewardMessage ? '已领取' : '领取免费十连抽',
            0,
            -278,
            CONTENT_WIDTH - 42,
            44,
            updateRewardMessage ? COLORS.panelAlt : COLORS.ember,
            () => {
                const latest = this.activeSave ?? this.engine?.getSave();
                if (!latest) {
                    return;
                }
                const result = SummonSystem.claimUpdateReward(latest);
                this.activeSave = latest;
                this.showAnnouncement();
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
            },
        );
        const rewardControl = rewardButton.getComponent(Button);
        if (rewardControl) {
            rewardControl.interactable = !updateRewardMessage;
        }

        this.createButton(
            this.announcementLayer,
            'AnnouncementClose',
            '我知道了，进入修行',
            0,
            -344,
            CONTENT_WIDTH - 42,
            52,
            COLORS.jade,
            () => this.closeAnnouncement(),
        );
    }

    private closeAnnouncement(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        const rewardClaimed = Boolean(
            save && SummonSystem.updateRewardUnavailableReason(save),
        );
        this.announcementDismissedThisSession = true;
        if (save && rewardClaimed) {
            save.announcementSeenVersion = ANNOUNCEMENT_VERSION;
            SaveManager.save(save);
            this.activeSave = save;
        }
        if (this.announcementLayer) {
            this.announcementLayer.active = false;
            this.announcementLayer.removeAllChildren();
        }
    }

    private buildMapHub(): void {
        if (!this.mapLayer) {
            return;
        }

        this.createPanel(
            this.mapLayer,
            'MapBackdrop',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            COLORS.background,
        );

        this.mapViewport = new Node('MapViewport');
        this.mapLayer.addChild(this.mapViewport);
        this.mapViewport.addComponent(UITransform).setContentSize(CONTENT_WIDTH, 682);
        this.mapViewport.setPosition(0, 12, 0);
        this.mapViewport.addComponent(Mask);

        this.createPanel(
            this.mapViewport,
            'MapFrame',
            CONTENT_WIDTH,
            682,
            0,
            0,
            new Color(22, 35, 39, 235),
        );

        this.mapSceneLayer = new Node('MapSceneLayer');
        this.mapViewport.addChild(this.mapSceneLayer);
        this.mapSceneLayer.addComponent(UITransform).setContentSize(620, 840);
        this.mapSceneLayer.setPosition(0, 0, 0);
        this.mapSceneLayer.active = false;

        const mapBackground = this.createSprite(
            this.mapSceneLayer,
            'OuterCourtyardMap',
            612,
            788,
            0,
            0,
        );
        this.mapBackgroundSprite = mapBackground;

        this.createLabel(
            this.mapSceneLayer,
            'MapTitle',
            '外门区域',
            21,
            CONTENT_WIDTH - 30,
            32,
            0,
            352,
            COLORS.ink,
        );
        this.createLabel(
            this.mapSceneLayer,
            'MapSubTitle',
            '点击地点，小人会沿路径移动',
            13,
            CONTENT_WIDTH - 30,
            24,
            0,
            325,
            COLORS.muted,
        );
        this.regionStatusLabel = this.createLabel(
            this.mapSceneLayer,
            'RegionStatusLabel',
            '区域：岚川院外院',
            13,
            CONTENT_WIDTH - 30,
            24,
            0,
            300,
            COLORS.jade,
        );
        this.createButton(
            this.mapSceneLayer,
            'TowerQuickButton',
            '无名塔',
            -118,
            256,
            94,
            38,
            COLORS.panelAlt,
            () => this.openTowerPanel(),
        );
        this.createButton(
            this.mapSceneLayer,
            'MarketQuickButton',
            '坊市',
            0,
            256,
            94,
            38,
            COLORS.ember,
            () => this.openMarketPanel(),
        );
        this.createButton(
            this.mapSceneLayer,
            'CommissionQuickButton',
            '委托',
            118,
            256,
            94,
            38,
            COLORS.panelAlt,
            () => this.openCommissionPanel(),
        );
        this.mapLocationLabel = this.createLabel(
            this.mapSceneLayer,
            'MapLocationLabel',
            '当前位置：山门石阶',
            15,
            CONTENT_WIDTH - 30,
            28,
            0,
            -316,
            COLORS.jade,
        );
        this.mapHintLabel = this.createLabel(
            this.mapSceneLayer,
            'MapHintLabel',
            '主线任务：前往西廊，寻找失窃的引气诀。',
            14,
            CONTENT_WIDTH - 30,
            38,
            0,
            -344,
            COLORS.ink,
        );
        this.mapHintLabel.enableWrapText = true;

        this.mapPlayerSprite = this.createSprite(
            this.mapSceneLayer,
            'MapPlayer',
            58,
            58,
            0,
            -226,
        );
        this.loadMapPlayer();

        this.createMapLocation(
            'GateLocation',
            'icon_map_gate',
            '山门',
            0,
            -226,
            '当前位置：山门石阶',
            '已抵达山门，可返回主线入口。',
        );
        this.createMapLocation(
            'WestCorridorLocation',
            'icon_map_west_corridor',
            '西廊',
            112,
            -42,
            '西廊：旧引气诀失窃处',
            '主线：调查西廊的脚印与残留灵息。',
            'west',
        );
        this.createMapLocation(
            'LibraryLocation',
            'icon_map_library',
            '藏书阁',
            -112,
            66,
            '藏书阁：功法与线索',
            '可查阅功法，也可能遇到新的支线委托。',
        );
        this.createMapLocation(
            'MarketLocation',
            'icon_map_market',
            '坊市',
            112,
            196,
            '坊市：交易和法宝淬炼',
            '支线：为摊主找回一盏旧铜灯。',
            'market',
        );
        this.createMapLocation(
            'HerbGardenLocation',
            'icon_map_herb_garden',
            '后山药圃',
            -100,
            -150,
            '后山药圃：种下回气草',
            '这里可以播种、照料，等药草成熟后再回来收获。',
            'herb',
        );

        this.regionEventNode = new Node('RegionEventLocation');
        this.mapSceneLayer.addChild(this.regionEventNode);
        this.regionEventNode.addComponent(UITransform).setContentSize(190, 86);
        this.regionEventNode.setPosition(0, -20, 0);
        const regionEventButton = this.createButton(
            this.regionEventNode,
            'RegionEventButton',
            '调查本区域',
            0,
            0,
            180,
            54,
            COLORS.ember,
            () => {
                const region = GameContentRegistry.region(this.activeRegionId);
                if (region) {
                    this.moveMapPlayerTo(
                        0,
                        -20,
                        `当前位置：${region.label}`,
                        region.subtitle,
                        region.entryLocationId,
                    );
                }
            },
        );
        const regionEventLabel = regionEventButton
            .getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (regionEventLabel) {
            regionEventLabel.fontSize = 13;
        }
        this.regionEventNode.active = false;

        this.createQuestMarker(
            this.mapSceneLayer,
            'MainQuestMarker',
            'marker_main_quest',
            132,
            -18,
        );
        this.createQuestMarker(
            this.mapSceneLayer,
            'SideQuestMarker',
            'marker_side_quest',
            132,
            218,
        );

        this.bindMapDrag();
        this.mapTaskPanel = new Node('MapTaskPanel');
        this.mapLayer.addChild(this.mapTaskPanel);
        this.renderMapTaskPanel();
        this.buildMapJoystick();
        this.buildWorldMap();

        this.characterLayer = new Node('CharacterLayer');
        this.mapLayer.addChild(this.characterLayer);
        this.characterLayer.active = false;
        this.buildCharacterPanel();

        this.bagLayer = new Node('BagLayer');
        this.mapLayer.addChild(this.bagLayer);
        this.bagLayer.active = false;
        this.buildBagPanel();

        this.activityLayer = new Node('ActivityLayer');
        this.mapLayer.addChild(this.activityLayer);
        this.activityLayer.addComponent(UITransform).setContentSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
        );
        const consumeActivityTouch = (event: EventTouch): void => {
            event.propagationStopped = true;
        };
        this.activityLayer.on(
            Node.EventType.TOUCH_START,
            consumeActivityTouch,
            this,
        );
        this.activityLayer.on(
            Node.EventType.TOUCH_MOVE,
            consumeActivityTouch,
            this,
        );
        this.activityLayer.on(
            Node.EventType.TOUCH_END,
            consumeActivityTouch,
            this,
        );
        this.activityLayer.on(
            Node.EventType.TOUCH_CANCEL,
            consumeActivityTouch,
            this,
        );
        this.activityLayer.active = false;

        const navPanel = this.createPanel(
            this.mapLayer,
            'HubNavigation',
            CONTENT_WIDTH,
            58,
            0,
            -390,
            new Color(25, 39, 51, 250),
        );
        this.createButton(
            navPanel,
            'MapTabButton',
            '地图',
            -144,
            0,
            60,
            44,
            COLORS.jade,
            () => this.openMapScene(),
        );
        this.createButton(
            navPanel,
            'CharacterTabButton',
            '人物',
            -72,
            0,
            60,
            44,
            COLORS.panelAlt,
            () => this.openCharacterPanel(),
        );
        this.createButton(
            navPanel,
            'SummonTabButton',
            '招募',
            0,
            0,
            60,
            44,
            COLORS.ember,
            () => this.openSummonPanel(),
        );
        this.createButton(
            navPanel,
            'BagTabButton',
            '背包',
            72,
            0,
            60,
            44,
            COLORS.panelAlt,
            () => this.openBagPanel(),
        );
        this.createButton(
            navPanel,
            'StoryTabButton',
            '主线',
            144,
            0,
            60,
            44,
            COLORS.ember,
            () => this.openStoryFromHub(),
        );
        this.createButton(
            this.mapSceneLayer,
            'WorldMapButton',
            '区域地图',
            -122,
            352,
            104,
            34,
            COLORS.panelAlt,
            () => this.openWorldMap(),
        );
        this.createButton(
            this.mapSceneLayer,
            'EventSettingsButton',
            '行程设置',
            122,
            352,
            104,
            34,
            COLORS.panelAlt,
            () => this.openEventSettings(),
        );
    }

    private buildWorldMap(): void {
        if (!this.mapLayer) {
            return;
        }
        this.worldMapLayer = new Node('WorldMapLayer');
        this.mapLayer.addChild(this.worldMapLayer);
        this.worldMapLayer.active = false;
        this.createPanel(
            this.worldMapLayer,
            'WorldMapBackdrop',
            CONTENT_WIDTH,
            682,
            0,
            12,
            new Color(14, 25, 31, 250),
        );
        this.createLabel(
            this.worldMapLayer,
            'WorldMapTitle',
            '岚川院区域大地图',
            23,
            CONTENT_WIDTH - 24,
            36,
            0,
            310,
            COLORS.ink,
        );
        this.createLabel(
            this.worldMapLayer,
            'WorldMapHint',
            '想去哪里，先看看它是否已经对你开门。',
            13,
            CONTENT_WIDTH - 24,
            28,
            0,
            278,
            COLORS.muted,
        );
        this.worldMapStatusLabel = this.createLabel(
            this.worldMapLayer,
            'WorldMapStatus',
            '点一个区域就能出发。',
            12,
            CONTENT_WIDTH - 24,
            26,
            0,
            242,
            COLORS.muted,
        );

        GAME_REGIONS.forEach((region, index) => {
            const row = Math.floor(index / 2);
            const column = index % 2;
            const button = this.createButton(
                this.worldMapLayer as Node,
                `Region_${region.id}`,
                `${region.label}\n${region.subtitle}`,
                column === 0 ? -90 : 90,
                170 - row * 112,
                156,
                86,
                COLORS.panelAlt,
                () => this.enterRegion(region),
            );
            const label = button
                .getChildByName('ButtonLabel')
                ?.getComponent(Label);
            if (label) {
                label.fontSize = 13;
                label.lineHeight = 18;
                label.enableWrapText = true;
            }
            this.worldMapRegionButtons.set(region.id, button);
        });
        this.worldMapRetryButton = this.createButton(
            this.worldMapLayer,
            'WorldMapRetry',
            '重试加载',
            0,
            -158,
            180,
            42,
            COLORS.ember,
            () => {
                const region = this.worldMapRetryRegion;
                if (region) {
                    void this.enterRegion(region);
                }
            },
        );
        this.worldMapRetryButton.active = false;
        this.createButton(
            this.worldMapLayer,
            'WorldMapBack',
            '返回行动地图',
            0,
            -292,
            180,
            48,
            COLORS.jade,
            () => this.openMapScene(),
        );
        this.updateWorldMapLoadState();
    }

    private setWorldMapRegionButtonsEnabled(enabled: boolean): void {
        this.worldMapRegionButtons.forEach((node) => {
            const button = node.getComponent(Button);
            if (button) {
                button.interactable = enabled;
            }
        });
    }

    private updateWorldMapLoadState(): void {
        if (this.worldMapStatusLabel) {
            if (this.mapBundleLoading) {
                this.worldMapStatusLabel.string = '正在打开区域……';
                this.worldMapStatusLabel.color = COLORS.ember;
            } else if (this.mapBundleError) {
                this.worldMapStatusLabel.string = '这里暂时进不去，可以再试一次。';
                this.worldMapStatusLabel.color = COLORS.danger;
            } else {
                this.worldMapStatusLabel.string = '点一个区域就能出发。';
                this.worldMapStatusLabel.color = COLORS.muted;
            }
        }
        if (this.worldMapRetryButton) {
            this.worldMapRetryButton.active =
                !this.mapBundleLoading &&
                Boolean(this.mapBundleError && this.worldMapRetryRegion);
        }
    }

    private getRegionUnlockHint(region: RegionConfig): string {
        if (this.activeSave) {
            const lockReason = GameContentRegistry.getRegionLockReason(
                this.activeSave,
                region,
            );
            if (lockReason) {
                return `还差：${lockReason}`;
            }
        }
        switch (region.requiredUnlock) {
            case 'qi_02':
                return '还差：完成第二章';
            case 'qi_03':
                return '还差：完成第三章';
            case 'qi_04':
                return '还差：完成第四章';
            case 'qi_05':
                return '还差：完成第五章';
            case 'qi_06':
                return '还差：完成第六章';
            default:
                return region.requiredUnlock
                    ? `还差：完成${region.requiredUnlock}`
                    : '';
        }
    }

    private buildCharacterPanel(): void {
        if (!this.characterLayer) {
            return;
        }

        this.createPanel(
            this.characterLayer,
            'CharacterBackdrop',
            CONTENT_WIDTH,
            DESIGN_HEIGHT - MOBILE_CANVAS.safeTop - MOBILE_CANVAS.safeBottom,
            0,
            0,
            COLORS.panel,
        );
        this.createLabel(
            this.characterLayer,
            'CharacterTitle',
            '修行面板',
            22,
            CONTENT_WIDTH - 24,
            34,
            0,
            350,
            COLORS.ink,
        );
        this.createLabel(
            this.characterLayer,
            'CharacterSubtitle',
            '修为满了以后，这里会告诉你下一步怎么突破',
            13,
            CONTENT_WIDTH - 24,
            24,
            0,
            322,
            COLORS.muted,
        );

        const radarNode = new Node('RadarChart');
        this.characterLayer.addChild(radarNode);
        const radarTransform = radarNode.addComponent(UITransform);
        radarTransform.setContentSize(280, 220);
        radarNode.setPosition(0, 135, 0);
        this.radarGraphics = radarNode.addComponent(Graphics);
        this.radarValueLabel = this.createLabel(
            this.characterLayer,
            'RadarValueLabel',
            '锁定灵根后生成六维数据',
            13,
            250,
            24,
            0,
            16,
            COLORS.muted,
        );
        this.characterSystemLabel = this.createLabel(
            this.characterLayer,
            'CharacterSystemLabel',
            '修为进度：炼气 1 层  0 / 100\n成长路线：全境界养成已开启\n圆满目标：修为还没圆满',
            12,
            CONTENT_WIDTH - 20,
            48,
            0,
            -172,
            COLORS.muted,
        );
        this.characterSystemLabel.enableWrapText = true;

        const statRows = [
            ['stat_cultivation', '攻击', -110, -6],
            ['stat_spirit', '灵力', 110, -6],
            ['stat_body', '防御', -110, -56],
            ['stat_mind', '心境', 110, -56],
            ['stat_insight', '洞察', -110, -106],
            ['stat_fate', '气运', 110, -106],
        ] as const;
        statRows.forEach(([assetId, label, x, y]) => {
            const row = this.createPanel(
                this.characterLayer as Node,
                `Stat_${label}`,
                142,
                44,
                x,
                y,
                new Color(36, 54, 63, 235),
            );
            const icon = this.createSprite(row, `${label}Icon`, 30, 30, -48, 0);
            this.loadUiAsset(assetId, icon);
            this.createLabel(
                row,
                `${label}Label`,
                label,
                14,
                76,
                26,
                16,
                0,
                COLORS.ink,
            );
        });

        this.createButton(
            this.characterLayer,
            'CultivateButton',
            '静修一次',
            -120,
            -238,
            104,
            52,
            COLORS.jade,
            () => this.cultivateOnce(),
        );
        this.createButton(
            this.characterLayer,
            'BreakthroughButton',
            '突破/目标',
            0,
            -238,
            104,
            52,
            COLORS.panelAlt,
            () => this.breakthroughOnce(),
        );
        this.createButton(
            this.characterLayer,
            'ForgeButton',
            '温养法宝',
            120,
            -238,
            104,
            52,
            COLORS.ember,
            () => this.forgeOnce(),
        );
        this.cultivationAdButton = this.createButton(
            this.characterLayer,
            'CultivationAdButton',
            '静修助益',
            -120,
            -304,
            104,
            42,
            COLORS.panelAlt,
            () => this.watchCultivationAd(),
        );
        const cultivationAdLabel = this.cultivationAdButton
            .getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (cultivationAdLabel) {
            cultivationAdLabel.fontSize = 12;
            cultivationAdLabel.lineHeight = 16;
            cultivationAdLabel.enableWrapText = true;
        }
        this.forgeMaterialAdButton = this.createButton(
            this.characterLayer,
            'ForgeMaterialAdButton',
            '材料补给',
            120,
            -304,
            104,
            42,
            COLORS.panelAlt,
            () => this.watchForgeMaterialAd(),
        );
        const forgeMaterialAdLabel = this.forgeMaterialAdButton
            .getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (forgeMaterialAdLabel) {
            forgeMaterialAdLabel.fontSize = 12;
            forgeMaterialAdLabel.lineHeight = 16;
            forgeMaterialAdLabel.enableWrapText = true;
        }
        this.forgePendingLabel = this.createLabel(
            this.characterLayer,
            'ForgePendingLabel',
            '',
            12,
            CONTENT_WIDTH - 24,
            42,
            0,
            -326,
            COLORS.ember,
        );
        this.forgePendingLabel.enableWrapText = true;
        this.forgePendingLabel.node.active = false;
        this.forgeAcceptButton = this.createButton(
            this.characterLayer,
            'ForgeAcceptButton',
            '替换新词条',
            -70,
            -378,
            130,
            40,
            COLORS.jade,
            () => this.applyForgePending(true),
        );
        this.forgeRejectButton = this.createButton(
            this.characterLayer,
            'ForgeRejectButton',
            '保留原词条',
            70,
            -378,
            130,
            40,
            COLORS.panelAlt,
            () => this.applyForgePending(false),
        );
        this.createButton(
            this.characterLayer,
            'MainQuestFromCharacter',
            '进入主线',
            0,
            -378,
            220,
            42,
            COLORS.ember,
            () => this.openStoryFromHub(),
        );
        this.updateCharacterActionLabels();
    }

    private buildBagPanel(): void {
        if (!this.bagLayer) {
            return;
        }
        this.createPanel(
            this.bagLayer,
            'BagBackdrop',
            CONTENT_WIDTH,
            DESIGN_HEIGHT - MOBILE_CANVAS.safeTop - MOBILE_CANVAS.safeBottom,
            0,
            0,
            COLORS.panel,
        );
        this.createLabel(
            this.bagLayer,
            'BagTitle',
            '背包',
            22,
            CONTENT_WIDTH - 24,
            34,
            0,
            350,
            COLORS.ink,
        );
        const hint = this.createLabel(
            this.bagLayer,
            'BagHint',
            '装备可按品质、温养等级或部位整理；锁定物品不会被出售或重淬。',
            13,
            CONTENT_WIDTH - 26,
            42,
            0,
            316,
            COLORS.muted,
        );
        hint.enableWrapText = true;
        this.createButton(
            this.bagLayer,
            'BagEquipmentTab',
            '装备',
            -120,
            270,
            104,
            36,
            COLORS.jade,
            () => this.selectBagView('equipment'),
        );
        this.createButton(
            this.bagLayer,
            'BagConsumablesTab',
            '消耗品',
            0,
            270,
            104,
            36,
            COLORS.panelAlt,
            () => this.selectBagView('consumables'),
        );
        this.createButton(
            this.bagLayer,
            'BagMaterialsTab',
            '材料',
            120,
            270,
            104,
            36,
            COLORS.panelAlt,
            () => this.selectBagView('materials'),
        );
        this.bagInventoryLabel = this.createLabel(
            this.bagLayer,
            'BagInventoryLabel',
            '背包为空',
            13,
            CONTENT_WIDTH - 36,
            226,
            0,
            124,
            COLORS.ink,
        );
        this.bagInventoryLabel.enableWrapText = true;
        this.bagStatusLabel = this.createLabel(
            this.bagLayer,
            'BagStatusLabel',
            '',
            12,
            CONTENT_WIDTH - 30,
            38,
            0,
            -6,
            COLORS.jade,
        );
        this.bagStatusLabel.enableWrapText = true;
        this.createButton(
            this.bagLayer,
            'BagSortButton',
            '排序：品质',
            -120,
            -58,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagSort(),
        );
        this.createButton(
            this.bagLayer,
            'BagSlotButton',
            '部位：全部',
            0,
            -58,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagSlotFilter(),
        );
        this.createButton(
            this.bagLayer,
            'BagQualityButton',
            '品质：全部',
            120,
            -58,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagQualityFilter(),
        );
        this.createButton(
            this.bagLayer,
            'BagSelectionButton',
            '切换装备',
            -120,
            -104,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagSelection(),
        );
        this.createButton(
            this.bagLayer,
            'BagEquipButton',
            '装备/替换',
            0,
            -104,
            104,
            38,
            COLORS.jade,
            () => this.equipSelectedEquipment(),
        );
        this.createButton(
            this.bagLayer,
            'BagLockButton',
            '锁定/解锁',
            120,
            -104,
            104,
            38,
            COLORS.panelAlt,
            () => this.toggleSelectedEquipmentLock(),
        );
        this.createButton(
            this.bagLayer,
            'BagSellButton',
            '出售',
            -120,
            -150,
            104,
            38,
            COLORS.ember,
            () => this.sellSelectedEquipment(),
        );
        this.createButton(
            this.bagLayer,
            'BagFillSpiritButton',
            '回气散补满',
            -120,
            -104,
            104,
            38,
            COLORS.jade,
            () => this.fillSpiritWithPowder(),
        );
        this.createButton(
            this.bagLayer,
            'BagCraftPowderButton',
            '制回气散',
            120,
            -104,
            104,
            38,
            COLORS.panelAlt,
            () => this.craftPowderFromHerbs(),
        );
        this.createButton(
            this.bagLayer,
            'BagMarketButton',
            '去坊市',
            0,
            -196,
            104,
            38,
            COLORS.ember,
            () => this.openMarketPanel(),
        );
        this.createButton(
            this.bagLayer,
            'BagWarmButton',
            '温养 +1',
            0,
            -150,
            104,
            38,
            COLORS.jade,
            () => this.warmSelectedEquipment(),
        );
        this.createButton(
            this.bagLayer,
            'BagRerollButton',
            '重淬词条',
            120,
            -150,
            104,
            38,
            COLORS.ember,
            () => this.rerollSelectedEquipment(),
        );
        this.createButton(
            this.bagLayer,
            'BagAffixButton',
            '切换词条位',
            -58,
            -196,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagAffixIndex(),
        );
        this.createButton(
            this.bagLayer,
            'BagStatusFilterButton',
            '状态：全部',
            58,
            -196,
            104,
            38,
            COLORS.panelAlt,
            () => this.cycleBagStatusFilter(),
        );
        this.createButton(
            this.bagLayer,
            'BagBackButton',
            '返回地图',
            0,
            -258,
            170,
            42,
            COLORS.panelAlt,
            () => this.openMapScene(),
        );
        this.createButton(
            this.bagLayer,
            'BagUseOneButton',
            '使用 1 个',
            -120,
            -58,
            104,
            38,
            COLORS.jade,
            () => this.usePowder(1),
        );
        this.createButton(
            this.bagLayer,
            'BagUseFiveButton',
            '使用 5 个',
            0,
            -58,
            104,
            38,
            COLORS.jade,
            () => this.usePowder(5),
        );
        this.createButton(
            this.bagLayer,
            'BagUseTenButton',
            '使用 10 个',
            120,
            -58,
            104,
            38,
            COLORS.jade,
            () => this.usePowder(10),
        );
        this.createButton(
            this.bagLayer,
            'BagUseHerbButton',
            '使用回气草',
            0,
            -104,
            104,
            38,
            COLORS.jade,
            () => this.useHerb(1),
        );
        this.bagPowderInput = this.createNumericInput(
            this.bagLayer,
            'BagPowderQuantityInput',
            '数量',
            -82,
            -150,
            96,
            38,
            '1',
        );
        this.createButton(
            this.bagLayer,
            'BagUseInputButton',
            '按数量使用',
            78,
            -150,
            136,
            38,
            COLORS.jade,
            () => this.usePowderFromInput(),
        );
    }

    private buildMapJoystick(): void {
        if (!this.mapLayer) {
            return;
        }
        this.mapJoystick = this.createPanel(
            this.mapLayer,
            'MovementJoystick',
            94,
            94,
            -CONTENT_WIDTH / 2 + 62,
            -270,
            new Color(7, 17, 24, 128),
        );
        this.mapJoystickThumb = this.createPanel(
            this.mapJoystick,
            'JoystickThumb',
            38,
            38,
            0,
            0,
            new Color(84, 174, 143, 220),
        );
        this.bindMapJoystick();
    }

    private bindMapJoystick(): void {
        if (!this.mapJoystick) {
            return;
        }
        this.mapJoystick.on(
            Node.EventType.TOUCH_START,
            (event: EventTouch) => {
                this.mapJoystickActive = true;
                this.setMapJoystickVector(event);
            },
            this,
        );
        this.mapJoystick.on(
            Node.EventType.TOUCH_MOVE,
            (event: EventTouch) => this.setMapJoystickVector(event),
            this,
        );
        const stop = (): void => {
            this.mapJoystickActive = false;
            this.mapJoystickX = 0;
            this.mapJoystickY = 0;
            this.mapPlayerFrameElapsed = 0;
            this.mapPlayerFrameIndex = 0;
            this.applyMapPlayerFrame();
            this.mapJoystickThumb?.setPosition(0, 0, 0);
        };
        this.mapJoystick.on(Node.EventType.TOUCH_END, stop, this);
        this.mapJoystick.on(Node.EventType.TOUCH_CANCEL, stop, this);
    }

    private setMapJoystickVector(event: EventTouch): void {
        if (!this.mapJoystick) {
            return;
        }
        const center = this.mapJoystick.worldPosition;
        const location = event.getLocation();
        const maxDistance = 28;
        const dx = location.x - center.x;
        const dy = location.y - center.y;
        const distance = Math.hypot(dx, dy);
        const ratio = distance > maxDistance ? maxDistance / distance : 1;
        const x = dx * ratio;
        const y = dy * ratio;
        const normalizedDistance = Math.min(1, distance / maxDistance);
        const deadZone = 0.14;
        const activeDistance = normalizedDistance <= deadZone
            ? 0
            : (normalizedDistance - deadZone) / (1 - deadZone);
        const vectorScale = distance === 0 ? 0 : activeDistance / normalizedDistance;
        this.mapJoystickX = (x / maxDistance) * vectorScale;
        this.mapJoystickY = (y / maxDistance) * vectorScale;
        this.mapJoystickThumb?.setPosition(x, y, 0);
    }

    private followMapPlayer(): void {
        if (!this.mapSceneLayer || !this.mapViewport || !this.mapPlayerSprite) {
            return;
        }
        const viewportTransform = this.mapViewport.getComponent(UITransform);
        const worldTransform = this.mapSceneLayer.getComponent(UITransform);
        if (!viewportTransform || !worldTransform) {
            return;
        }
        const maxX = Math.max(
            0,
            (worldTransform.contentSize.width - viewportTransform.contentSize.width) / 2,
        );
        const maxY = Math.max(
            0,
            (worldTransform.contentSize.height - viewportTransform.contentSize.height) / 2,
        );
        const playerPosition = this.mapPlayerSprite.node.position;
        const x = Math.min(maxX, Math.max(-maxX, -playerPosition.x));
        const y = Math.min(maxY, Math.max(-maxY, -playerPosition.y));
        this.mapSceneLayer.setPosition(x, y, 0);
    }

    private bindMapDrag(): void {
        if (!this.mapViewport || !this.mapSceneLayer) {
            return;
        }

        this.mapViewport.on(
            Node.EventType.TOUCH_START,
            (event: EventTouch) => {
                const location = event.getLocation();
                const current = this.mapSceneLayer?.position;
                this.mapDragging = true;
                this.mapDragMoved = false;
                this.mapDragStartX = location.x;
                this.mapDragStartY = location.y;
                this.mapDragOriginX = current?.x ?? 0;
                this.mapDragOriginY = current?.y ?? 0;
            },
            this,
        );
        this.mapViewport.on(
            Node.EventType.TOUCH_MOVE,
            (event: EventTouch) => {
                if (!this.mapDragging || !this.mapSceneLayer) {
                    return;
                }
                const location = event.getLocation();
                const dx = location.x - this.mapDragStartX;
                const dy = location.y - this.mapDragStartY;
                if (Math.abs(dx) + Math.abs(dy) > 6) {
                    this.mapDragMoved = true;
                }
                this.applyMapPan(
                    this.mapDragOriginX + dx,
                    this.mapDragOriginY + dy,
                );
            },
            this,
        );
        const finishDrag = (): void => {
            this.mapDragging = false;
        };
        this.mapViewport.on(Node.EventType.TOUCH_END, finishDrag, this);
        this.mapViewport.on(Node.EventType.TOUCH_CANCEL, finishDrag, this);
    }

    private applyMapPan(x: number, y: number): void {
        if (!this.mapSceneLayer || !this.mapViewport) {
            return;
        }
        const viewportTransform = this.mapViewport.getComponent(UITransform);
        if (!viewportTransform) {
            return;
        }
        const viewportSize = viewportTransform.contentSize;
        const worldTransform = this.mapSceneLayer.getComponent(UITransform);
        const worldSize = worldTransform?.contentSize ?? viewportSize;
        const maxX = Math.max(0, (worldSize.width - viewportSize.width) / 2);
        const maxY = Math.max(0, (worldSize.height - viewportSize.height) / 2);
        const clampedX = Math.min(maxX, Math.max(-maxX, x));
        const clampedY = Math.min(maxY, Math.max(-maxY, y));
        this.mapSceneLayer.setPosition(clampedX, clampedY, 0);
    }

    private renderMapTaskPanel(): void {
        if (!this.mapLayer || !this.mapTaskPanel) {
            return;
        }

        const pendingEvent = this.activeSave
            ? EventRouter.pending(this.activeSave)
            : null;
        const nextEvent = this.activeSave
            ? GameContentRegistry.nextAvailableEvent(this.activeSave)
            : null;
        const capGoal = this.activeSave
            ? ProgressionSystem.initializeGoalState(this.activeSave)
            : null;
        const capTaskActive = Boolean(capGoal?.atCap);
        const capTaskProgress = capGoal
            ?.conditions
            .filter((condition) => !condition.complete)
            .map((condition) => `○ ${condition.label}`)
            .join(' · ');
        const width = 162;
        const expanded = this.mapTaskExpanded;
        const atHerbGarden = expanded && this.isAtHerbGarden();
        const height = expanded ? (atHerbGarden ? 372 : 184) : 54;
        const transform =
            this.mapTaskPanel.getComponent(UITransform) ??
            this.mapTaskPanel.addComponent(UITransform);
        transform.setContentSize(width, height);
        this.mapTaskPanel.setPosition(
            CONTENT_WIDTH / 2 - width / 2 - 8,
            12 + 682 / 2 - height / 2 - 10,
            0,
        );

        let background = this.mapTaskPanel.getComponent(Graphics);
        if (!background) {
            background = this.mapTaskPanel.addComponent(Graphics);
        }
        background.clear();
        background.fillColor = new Color(7, 17, 24, 132);
        background.rect(-width / 2, -height / 2, width, height);
        background.fill();

        this.mapTaskPanel.removeAllChildren();
        const summary = this.createButton(
            this.mapTaskPanel,
            'TaskSummary',
            capTaskActive
                ? `圆满目标\n${capGoal?.title ?? '突破准备'}`
                : pendingEvent
                ? `待处理\n${pendingEvent.title}`
                : '主线\n就在这里',
            0,
            height / 2 - 27,
            width,
            54,
            new Color(0, 0, 0, 0),
            () => {
                this.mapTaskPanel?.getChildByName('TaskDetail')
                    ? this.collapseMapTask()
                    : this.expandMapTask();
            },
        );
        const summaryLabel = summary
            .getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (summaryLabel) {
            summaryLabel.fontSize = 13;
            summaryLabel.lineHeight = 18;
            summaryLabel.enableWrapText = true;
        }

        if (!expanded) {
            return;
        }

        const detail = new Node('TaskDetail');
        this.mapTaskPanel.addChild(detail);
            this.createLabel(
            detail,
            'TaskDetailText',
            capTaskActive
                ? capGoal?.description ??
                    '修为已经满了，完成突破目标就能继续。'
                : pendingEvent?.summary ??
                    nextEvent?.summary ??
                    '跟着地图上的标记走，故事会在那边继续。',
            13,
            width - 18,
            70,
            0,
            12,
            COLORS.ink,
        ).enableWrapText = true;
        this.createLabel(
            detail,
            'TaskReward',
            capTaskActive
                ? capTaskProgress || '目标都完成了，可以开始突破。'
                : '奖励：灵石 +12 · 修为 +8',
            12,
            width - 18,
            26,
            0,
            -38,
            COLORS.jade,
        );
        this.createButton(
            detail,
            'TaskAction',
            capTaskActive
                ? '查看目标'
                : pendingEvent
                ? '走近看看'
                : nextEvent
                  ? `前往${nextEvent.title}`
                  : '查看地图',
            0,
            -68,
            width - 26,
            34,
            COLORS.ember,
            () => {
                this.collapseMapTask();
                if (capTaskActive) {
                    this.openGoalPanel();
                    return;
                }
                if (pendingEvent) {
                    this.startRoutedEvent(pendingEvent.id);
                    return;
                }
                if (nextEvent) {
                    this.navigateToEvent(nextEvent);
                    return;
                }
                this.openMapScene();
            },
        );

        if (atHerbGarden && this.activeSave) {
            const plot = this.activeSave.herbPlot;
            const stageLabels: Record<HerbPlotStage, string> = {
                0: '待播种',
                1: '新芽初生',
                2: '枝叶舒展',
                3: '成熟可收',
            };
            const actionLabels: Record<HerbPlotStage, string> = {
                0: '播种',
                1: '照料',
                2: '照料',
                3: '收获',
            };
            const gardenLabel = this.createLabel(
                detail,
                'HerbPlotTitle',
                `后山药圃 · ${stageLabels[plot.stage]}`,
                13,
                width - 18,
                24,
                0,
                -112,
                COLORS.jade,
            );
            gardenLabel.enableWrapText = true;
            const gardenHint = this.createLabel(
                detail,
                'HerbPlotHint',
                plot.tutorialSeen
                    ? '播种 → 照料 → 生长 → 收获'
                    : '第一次来？先播种，再照料，等它成熟后回来收获。',
                11,
                width - 18,
                42,
                0,
                -145,
                COLORS.muted,
            );
            gardenHint.enableWrapText = true;
            this.createButton(
                detail,
                'HerbPlotAction',
                actionLabels[plot.stage],
                0,
                -202,
                width - 26,
                38,
                COLORS.jade,
                () => this.tendHerbPlot(),
            );
            const gardenAdReason = EconomySystem.gardenAdUnavailableReason(
                this.activeSave,
            );
            const gardenAdButton = this.createButton(
                detail,
                'HerbPlotAdAction',
                gardenAdReason
                    ? gardenAdReason
                    : '看广告 · 立即完成并额外获得回气草 ×1',
                0,
                -250,
                width - 26,
                38,
                COLORS.ember,
                () => this.watchGardenAd(),
            );
            const gardenAdControl = gardenAdButton.getComponent(Button);
            if (gardenAdControl) {
                gardenAdControl.interactable = !gardenAdReason;
            }
            this.setButtonLabelStyle(gardenAdButton, 11, 14);
        }
    }

    private isAtHerbGarden(): boolean {
        if (
            this.activeRegionId !== 'map_outer' ||
            !this.mapPlayerSprite
        ) {
            return false;
        }
        const position = this.mapPlayerSprite.node.position;
        return Math.hypot(position.x + 100, position.y + 150) <= 38;
    }

    private tendHerbPlot(): void {
        if (!this.activeSave || !this.isAtHerbGarden()) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '回到后山药圃再照料。');
            return;
        }

        const save = this.activeSave;
        save.herbPlot.tutorialSeen = true;
        const result = EconomySystem.tendHerbPlot(save);
        this.mapHintLabel && (this.mapHintLabel.string = result.message);
        this.updateRadarChart(save);
        this.updateCharacterSystemLabel(save);
        this.updateBagPanel(save);
        this.renderMapTaskPanel();
    }

    private watchGardenAd(): void {
        const save = this.activeSave;
        if (!save || !this.isAtHerbGarden()) {
            return;
        }
        const unavailable = EconomySystem.gardenAdUnavailableReason(save);
        if (unavailable) {
            this.mapHintLabel && (this.mapHintLabel.string = unavailable);
            return;
        }
        this.openRewardedAction({
            placement: 'garden_instant_care',
            title: '药圃即时照料',
            body: '观看广告后，当前药圃直接完成本轮照料并立即收获，不需要等待。',
            reward: '回气草额外 +1；每日不限次数。',
            onComplete: () => {
                const result = EconomySystem.claimGardenAd(save);
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.updateBagPanel(save);
                this.renderMapTaskPanel();
            },
        });
    }

    private navigateToEvent(event: {
        title: string;
        summary: string;
        mapId: GameRegionId;
        locationId: string;
    }): void {
        if (event.mapId !== this.activeRegionId) {
            const region = GameContentRegistry.region(event.mapId);
            if (region) {
                void this.enterRegion(region);
            }
            return;
        }

        const locations: Record<string, {
            x: number;
            y: number;
            label: string;
        }> = {
            west: {
                x: 112,
                y: -42,
                label: '西廊：旧引气诀失窃处',
            },
            herb: {
                x: -100,
                y: -150,
                label: '药圃：黑根病扩散处',
            },
        };
        const target = locations[event.locationId];
        if (target) {
            this.moveMapPlayerTo(
                target.x,
                target.y,
                target.label,
                event.summary,
                event.locationId,
            );
            return;
        }
        const region = GameContentRegistry.region(event.mapId);
        this.moveMapPlayerTo(
            0,
            -20,
            `当前位置：${region?.label ?? '区域入口'}`,
            event.summary,
            region?.entryLocationId ?? event.locationId,
        );
    }

    private expandMapTask(): void {
        this.mapTaskExpanded = true;
        this.renderMapTaskPanel();
        const save = this.activeSave;
        if (save?.tutorialEnabled && save.tutorialStep === 'map_task') {
            this.setTutorialStep('map_move');
        } else if (
            save?.tutorialEnabled &&
            save.tutorialStep === 'chapter1_tasks'
        ) {
            this.setTutorialStep('chapter1_character');
        }
    }

    private collapseMapTask(): void {
        this.mapTaskExpanded = false;
        this.renderMapTaskPanel();
    }

    private renderMapHub(save: LocalSave, chapter: ChapterData): void {
        this.activeSave = save;
        this.activeChapter = chapter;
        this.activeRegionId =
            (save.currentMapId as GameRegionId) ?? 'map_outer';
        this.hideActionLayers();
        if (!this.mapLayer || !this.mapSceneLayer || !this.characterLayer) {
            return;
        }

        this.mapLayer.active = true;
        this.mapSceneLayer.active = true;
        this.characterLayer.active = false;
        this.bagLayer && (this.bagLayer.active = false);
        this.activityLayer && (this.activityLayer.active = false);
        if (this.worldMapLayer) {
            this.worldMapLayer.active = false;
        }
        const region = GameContentRegistry.region(this.activeRegionId);
        this.regionStatusLabel &&
            (this.regionStatusLabel.string =
                `区域：${region?.label ?? '岚川院外院'}`);
        this.mapLocationLabel &&
            (this.mapLocationLabel.string =
                this.activeRegionId === 'map_outer'
                    ? '当前位置：山门石阶'
                    : `当前位置：${region?.label ?? '区域入口'}`);
        this.mapHintLabel &&
            (this.mapHintLabel.string =
                region?.subtitle ??
                '主线任务：前往西廊，寻找失窃的引气诀。');
        this.applyRegionVisibility();
        this.loadMapBackground();
        this.updateRadarChart(save);
        this.updateBagPanel(save);
        this.renderTutorialOverlay();
        this.maybeShowAnnouncement(save);
    }

    private openMapScene(): void {
        if (
            !this.mapLayer ||
            !this.mapSceneLayer ||
            !this.characterLayer
        ) {
            return;
        }
        this.mapLayer.active = true;
        this.mapSceneLayer.active = true;
        this.characterLayer.active = false;
        this.bagLayer && (this.bagLayer.active = false);
        this.activityLayer && (this.activityLayer.active = false);
        if (this.worldMapLayer) {
            this.worldMapLayer.active = false;
        }
        this.updateWorldMapLoadState();
        this.applyRegionVisibility();
        this.renderTutorialOverlay();
    }

    private openWorldMap(): void {
        if (!this.mapLayer || !this.worldMapLayer || !this.mapSceneLayer) {
            return;
        }
        this.mapLayer.active = true;
        this.mapSceneLayer.active = false;
        this.worldMapLayer.active = true;
        this.characterLayer && (this.characterLayer.active = false);
        this.bagLayer && (this.bagLayer.active = false);
        this.activityLayer && (this.activityLayer.active = false);
        this.setWorldMapRegionButtonsEnabled(!this.mapBundleLoading);
        this.updateWorldMapLoadState();
        this.renderTutorialOverlay();
    }

    private async enterRegion(region: RegionConfig): Promise<void> {
        if (!this.activeSave) {
            return;
        }
        if (this.mapBundleLoading) {
            return;
        }
        this.worldMapRetryRegion = region;
        if (!GameContentRegistry.isRegionUnlocked(this.activeSave, region)) {
            this.worldMapRetryRegion = null;
            this.updateWorldMapLoadState();
            if (this.worldMapStatusLabel) {
                this.worldMapStatusLabel.string =
                    this.getRegionUnlockHint(region) ||
                    `${region.label}还没对你开放。`;
                this.worldMapStatusLabel.color = COLORS.muted;
            }
            return;
        }
        const loaded = await this.enterMapBundle(region.bundleId);
        if (!loaded) {
            return;
        }
        this.worldMapRetryRegion = null;
        this.activeRegionId = region.id;
        this.activeSave.currentMapId = region.id;
        this.activeSave.mapPositions[region.id] ??= { x: 0, y: -80 };
        SaveManager.save(this.activeSave);
        this.openMapScene();
        if (this.regionStatusLabel) {
            this.regionStatusLabel.string = `区域：${region.label}`;
        }
        if (this.mapLocationLabel) {
            this.mapLocationLabel.string = `当前位置：${region.label}`;
        }
        if (this.mapHintLabel) {
            this.mapHintLabel.string = region.subtitle;
        }
        this.applyRegionVisibility();
        this.loadMapBackground();
    }

    private applyRegionVisibility(): void {
        const isOuter = this.activeRegionId === 'map_outer';
        this.mapLocationNodes.forEach((node) => {
            node.active = isOuter;
        });
        if (this.regionEventNode) {
            this.regionEventNode.active = !isOuter;
        }
        if (this.mapPlayerSprite && this.activeSave) {
            const position = this.activeSave.mapPositions[this.activeRegionId];
            if (position) {
                this.mapPlayerSprite.node.setPosition(position.x, position.y, 0);
                this.followMapPlayer();
            }
        }
    }

    private handleMapArrival(locationId: string): void {
        if (!locationId || !this.activeSave) {
            return;
        }
        if (locationId === 'herb') {
            this.mapTaskExpanded = true;
            if (!this.activeSave.herbPlot.tutorialSeen) {
                this.mapHintLabel &&
                    (this.mapHintLabel.string =
                        '第一次来后山药圃？先播种，再照料，等成熟后回来收获。');
            }
        }
        if (locationId === 'market') {
            this.openMarketPanel();
            return;
        }
        const result = EventRouter.arrive(
            this.activeSave,
            this.activeRegionId,
            locationId,
        );
        if (result.status === 'none' || !result.event) {
            this.mapHintLabel &&
                (this.mapHintLabel.string =
                    locationId === 'herb' && !this.activeSave.herbPlot.tutorialSeen
                        ? '第一次来后山药圃？先播种，再照料，等成熟后回来收获。'
                        : '这里暂时没有新线索。换个地方走走，或回地图看看下一步。');
            this.renderMapTaskPanel();
            return;
        }
        if (result.status === 'auto') {
            this.startRoutedEvent(result.event.id);
            return;
        }
        if (result.status === 'confirm') {
            this.showEventPrompt(result.event);
            return;
        }
        this.mapHintLabel &&
            (this.mapHintLabel.string = `线索已记录：${result.event.title}，可在任务栏中进入。`);
        this.renderMapTaskPanel();
    }

    private startRoutedEvent(eventId: string): void {
        const event = GameContentRegistry.event(eventId);
        if (!event || !this.activeSave) {
            return;
        }
        if (!GameContentRegistry.isEventUnlocked(this.activeSave, event)) {
            const lockReason = GameContentRegistry.getEventLockReason(
                this.activeSave,
                event,
            );
            if (this.mapHintLabel) {
                this.mapHintLabel.string = lockReason
                    ? `还差：${lockReason}`
                    : '这条线索还没到时候。';
            }
            this.renderMapTaskPanel();
            return;
        }
        this.activeSave.pendingEventId = '';
        SaveManager.save(this.activeSave);
        this.storyStartedFromMap = true;
        this.mapLayer && (this.mapLayer.active = false);
        this.eventPromptLayer && (this.eventPromptLayer.active = false);
        if (
            this.activeSave.tutorialEnabled &&
            this.activeSave.tutorialStep === 'map_move'
        ) {
            this.stopMainlineIntro();
        }
        void this.engine?.startChapterFromMap(event.chapterId);
    }

    private showEventPrompt(event: {
        title: string;
        summary: string;
        id: string;
    }): void {
        if (!this.eventPromptLayer) {
            return;
        }
        this.eventPromptLayer.removeAllChildren();
        this.eventPromptLayer.active = true;
        this.createPanel(
            this.eventPromptLayer,
            'EventPromptPanel',
            CONTENT_WIDTH - 18,
            216,
            0,
            34,
            new Color(7, 17, 24, 246),
        );
        this.createLabel(
            this.eventPromptLayer,
            'EventPromptTitle',
            `发现新的线索：${event.title}`,
            20,
            CONTENT_WIDTH - 48,
            34,
            0,
            94,
            COLORS.ember,
        );
        const summary = this.createLabel(
            this.eventPromptLayer,
            'EventPromptSummary',
            event.summary,
            15,
            CONTENT_WIDTH - 48,
            62,
            0,
            38,
            COLORS.ink,
        );
        summary.enableWrapText = true;
        this.createButton(
            this.eventPromptLayer,
            'EnterEventButton',
            '走近看看',
            -82,
            -54,
            142,
            48,
            COLORS.jade,
            () => this.startRoutedEvent(event.id),
        );
        this.createButton(
            this.eventPromptLayer,
            'LaterEventButton',
            '稍后再说',
            82,
            -54,
            142,
            48,
            COLORS.panelAlt,
            () => {
                this.eventPromptLayer &&
                    (this.eventPromptLayer.active = false);
            },
        );
    }

    private openEventSettings(): void {
        if (!this.settingsLayer || !this.activeSave) {
            return;
        }
        this.hideTutorialOverlay();
        this.mapSceneLayer && (this.mapSceneLayer.active = false);
        this.worldMapLayer && (this.worldMapLayer.active = false);
        this.characterLayer && (this.characterLayer.active = false);
        this.settingsLayer.removeAllChildren();
        this.settingsLayer.active = true;
        const activeSlot = SaveManager.getActiveSlot();
        const summaries = SaveManager.getSlotSummaries();
        this.createPanel(
            this.settingsLayer,
            'SettingsPanel',
            CONTENT_WIDTH,
            798,
            0,
            0,
            COLORS.panel,
        );
        this.createLabel(
            this.settingsLayer,
            'SettingsTitle',
            '设置与存档',
            24,
            CONTENT_WIDTH - 24,
            34,
            0,
            360,
            COLORS.ink,
        );
        this.createLabel(
            this.settingsLayer,
            'SettingsHint',
            '实时保存已开启，手动存档与新建修行都在这里完成。',
            14,
            CONTENT_WIDTH - 24,
            30,
            0,
            328,
            COLORS.muted,
        );
        this.createLabel(
            this.settingsLayer,
            'SaveSectionLabel',
            `存档  ·  现在用的是第 ${activeSlot + 1} 档`,
            15,
            CONTENT_WIDTH - 24,
            28,
            0,
            278,
            COLORS.ember,
        );
        this.createLabel(
            this.settingsLayer,
            'SaveSectionHint',
            '点读取会切到对应进度；空档位可以直接开始新的修行。',
            12,
            CONTENT_WIDTH - 24,
            28,
            0,
            250,
            COLORS.muted,
        );
        const slotX = [-112, 0, 112];
        summaries.forEach((summary, index) => {
            const isActive = summary.slotIndex === activeSlot;
            const chapterLabel = summary.locked
                ? '观看广告解锁'
                : summary.hasSave
                  ? summary.chapterId === 'qi_01'
                      ? '主线 · 第 1 章'
                      : summary.chapterId || '已有修行'
                  : '空档位';
            const statusLabel = summary.locked
                ? '已解锁'
                : summary.hasSave
                  ? isActive
                      ? '当前使用'
                      : '点击读取'
                  : '另开新档';
            const card = this.createButton(
                this.settingsLayer as Node,
                `SaveSlot_${index + 1}`,
                `存档位 ${index + 1}\n${chapterLabel}\n${statusLabel}`,
                slotX[index],
                174,
                104,
                112,
                summary.locked
                    ? COLORS.ember
                    : isActive
                      ? COLORS.jade
                      : summary.hasSave
                        ? COLORS.panelAlt
                        : COLORS.background,
                () => {
                    if (summary.locked) {
                        this.settingsLayer &&
                            (this.settingsLayer.active = false);
                        this.openRewardedAction({
                            placement: 'save_slot_3_unlock',
                            title: '解锁第三存档位',
                            body: '第三档可以单独保存另一条修行进度。',
                            reward: '看完后就能一直使用第三档。',
                            onComplete: () => {
                                SaveManager.unlockThirdSlot();
                                this.openEventSettings();
                            },
                        });
                        return;
                    }
                    this.settingsLayer &&
                        (this.settingsLayer.active = false);
                    if (summary.hasSave) {
                        void this.engine?.switchSaveSlot(index);
                    } else {
                        void this.engine?.createNewSaveSlot(index);
                    }
                },
            );
            const label = card
                .getChildByName('ButtonLabel')
                ?.getComponent(Label);
            if (label) {
                label.fontSize = 12;
                label.lineHeight = 18;
                label.enableWrapText = true;
            }
        });
        this.createButton(
            this.settingsLayer,
            'ManualSaveButton',
            `手动保存  ·  第 ${activeSlot + 1} 档`,
            0,
            88,
            286,
            42,
            COLORS.ember,
            () => {
                if (this.activeSave) {
                    SaveManager.save(this.activeSave);
                }
                this.openEventSettings();
            },
        );
        this.createLabel(
            this.settingsLayer,
            'ModeSectionLabel',
            '抵达事件设置',
            15,
            CONTENT_WIDTH - 24,
            28,
            0,
            36,
            COLORS.ember,
        );
        const modes = [
            ['auto', '自动走近', '抵达线索地点后直接走近。'],
            ['confirm', '到达后确认', '抵达后弹出提示，由你决定是否走近。'],
            ['manual', '稍后再走近', '先把线索留在任务栏，不打断移动。'],
        ] as const;
        modes.forEach(([mode, title, description], index) => {
            const button = this.createButton(
                this.settingsLayer as Node,
                `EventMode_${mode}`,
                `${title}\n${description}`,
                0,
                -28 - index * 62,
                CONTENT_WIDTH - 34,
                52,
                this.activeSave?.eventTriggerMode === mode
                    ? COLORS.jade
                    : COLORS.panelAlt,
                () => {
                    if (this.activeSave) {
                        EventRouter.setMode(this.activeSave, mode);
                    }
                    this.openEventSettings();
                },
            );
            const label = button
                .getChildByName('ButtonLabel')
                ?.getComponent(Label);
            if (label) {
                label.fontSize = 14;
                label.lineHeight = 20;
                label.enableWrapText = true;
            }
        });
        this.createButton(
            this.settingsLayer,
            'TutorialReplayButton',
            '重新查看新手引导',
            0,
            -230,
            240,
            42,
            COLORS.jade,
            () => this.restartTutorialFromSettings(),
        );
        this.createButton(
            this.settingsLayer,
            'SettingsBack',
            '返回地图',
            0,
            -334,
            180,
            48,
            COLORS.ember,
            () => {
                this.settingsLayer &&
                    (this.settingsLayer.active = false);
                this.openMapScene();
            },
        );
    }

    private restartTutorialFromSettings(): void {
        const save = this.activeSave ?? this.engine?.getSave();
        if (!save) {
            return;
        }
        save.tutorialOfferSeen = true;
        save.tutorialEnabled = true;
        save.tutorialComplete = false;
        save.tutorialSkipped = false;
        save.tutorialStep = this.tutorialStartStep(save);
        this.tutorialOfferOpen = false;
        SaveManager.save(save);
        this.activeSave = save;
        if (this.settingsLayer) {
            this.settingsLayer.active = false;
        }
        if (this.activeChapter) {
            this.renderMapHub(save, this.activeChapter);
        } else {
            this.openMapScene();
            this.renderTutorialOverlay();
        }
    }

    private openCharacterPanel(): void {
        if (!this.activeSave || !this.mapLayer || !this.mapSceneLayer || !this.characterLayer) {
            return;
        }
        this.mapLayer.active = true;
        this.mapSceneLayer.active = false;
        this.characterLayer.active = true;
        this.bagLayer && (this.bagLayer.active = false);
        this.activityLayer && (this.activityLayer.active = false);
        this.worldMapLayer && (this.worldMapLayer.active = false);
        this.updateRadarChart(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        if (
            this.activeSave.tutorialEnabled &&
            this.activeSave.tutorialStep === 'chapter1_character'
        ) {
            this.finishChapterGuide('chapter1');
            return;
        }
        this.renderTutorialOverlay();
    }

    private openBagPanel(): void {
        if (!this.activeSave || !this.mapLayer || !this.mapSceneLayer) {
            return;
        }
        this.mapLayer.active = true;
        this.mapSceneLayer.active = false;
        this.characterLayer && (this.characterLayer.active = false);
        this.bagLayer && (this.bagLayer.active = true);
        this.worldMapLayer && (this.worldMapLayer.active = false);
        this.activityLayer && (this.activityLayer.active = false);
        this.updateBagPanel(this.activeSave);
        if (
            this.activeSave.tutorialEnabled &&
            this.activeSave.tutorialStep === 'chapter2_bag'
        ) {
            this.setTutorialStep('chapter2_forge');
            return;
        }
        this.renderTutorialOverlay();
    }

    private prepareActivityPanel(
        title: string,
        subtitle: string,
        panelColor: Color = COLORS.panel,
    ): Node | null {
        if (
            !this.activeSave ||
            !this.mapLayer ||
            !this.mapSceneLayer ||
            !this.activityLayer
        ) {
            return null;
        }
        this.mapLayer.active = true;
        this.mapSceneLayer.active = false;
        this.characterLayer && (this.characterLayer.active = false);
        this.bagLayer && (this.bagLayer.active = false);
        this.worldMapLayer && (this.worldMapLayer.active = false);
        this.activityLayer.active = true;
        this.activityLayer.setSiblingIndex(this.mapLayer.children.length - 1);
        this.activityLayer.removeAllChildren();

        this.createPanel(
            this.activityLayer,
            'ActivityBackdrop',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            new Color(7, 17, 24, 248),
        );
        this.createPanel(
            this.activityLayer,
            'ActivityPanel',
            CONTENT_WIDTH,
            DESIGN_HEIGHT - MOBILE_CANVAS.safeTop - MOBILE_CANVAS.safeBottom,
            0,
            0,
            panelColor,
        );
        this.createLabel(
            this.activityLayer,
            'ActivityTitle',
            title,
            23,
            CONTENT_WIDTH - 28,
            36,
            0,
            350,
            COLORS.ink,
        );
        const subtitleLabel = this.createLabel(
            this.activityLayer,
            'ActivitySubtitle',
            subtitle,
            13,
            CONTENT_WIDTH - 30,
            38,
            0,
            314,
            COLORS.muted,
        );
        subtitleLabel.enableWrapText = true;
        this.createButton(
            this.activityLayer,
            'ActivityBackButton',
            '返回地图',
            0,
            -365,
            170,
            42,
            COLORS.panelAlt,
            () => this.openMapScene(),
        );
        return this.activityLayer;
    }

    private openTowerPanel(
        message = '',
        recommendation?: ForgeRecommendation | null,
    ): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const forgeRecommendation = recommendation === undefined
            ? this.pendingForgeRecommendation
            : recommendation;
        const layer = this.prepareActivityPanel(
            '无名塔',
            '塔层按顺序一次性推进；成功后本层永久关闭。重复获取装备请前往地图 PVE 挑战点。',
        );
        if (!layer) {
            return;
        }
        const floors = TowerSystem.floors();
        this.towerSelectedFloor = Math.max(
            1,
            Math.min(floors.length, this.towerSelectedFloor),
        );
        const config = TowerSystem.floor(this.towerSelectedFloor);
        if (!config) {
            return;
        }
        const firstClear = save.tower.firstClearFloors.indexOf(config.floor) >= 0;
        const gate = TowerSystem.canChallenge(save, config.floor);
        const adventure = TowerSystem.activeAdventure(save);
        const activeFloor = save.tower.activeFloor;
        const progress = this.createLabel(
            layer,
            'TowerProgress',
            `最高通关：第 ${save.tower.bestFloor} 层  ·  首通灵石总计 ${TowerSystem.firstClearLingShiTotal()}  ·  下次减耗祝佑 ${save.tower.blessing}`,
            13,
            CONTENT_WIDTH - 32,
            42,
            0,
            262,
            COLORS.jade,
        );
        progress.enableWrapText = true;
        const detail = this.createLabel(
            layer,
            'TowerDetail',
            `第 ${config.floor} 层 · ${config.title}\n` +
                `要求：炼气 ${config.minStage} 层、主线 ${config.requiredChapter}${config.trialRequired ? '、凝境试炼' : ''}\n` +
                `首通奖励：${TowerSystem.firstClearRewardSummary(config)}\n` +
                `${firstClear
                    ? '这一层已经打过了，不能重复挑战；想刷装备就去地图上的 PVE 挑战点。'
                    : '打过一次后这一层会关掉，输了可以再来。'}\n` +
                `挑战消耗 ${TowerSystem.currentSpiritCost(save, config.floor)} 灵力，胜利返还 ${config.spiritRefund} 灵力`,
            15,
            CONTENT_WIDTH - 40,
            112,
            0,
            176,
            COLORS.ink,
        );
        detail.enableWrapText = true;
        this.createButton(
            layer,
            'TowerPreviousButton',
            '上一层',
            -92,
            88,
            132,
            42,
            COLORS.panelAlt,
            () => {
                this.towerSelectedFloor = Math.max(1, this.towerSelectedFloor - 1);
                this.openTowerPanel(message);
            },
        );
        this.createButton(
            layer,
            'TowerNextButton',
            '下一层',
            92,
            88,
            132,
            42,
            COLORS.panelAlt,
            () => {
                this.towerSelectedFloor = Math.min(
                    floors.length,
                    this.towerSelectedFloor + 1,
                );
                this.openTowerPanel(message);
            },
        );

        if (activeFloor !== null) {
            const activeConfig = TowerSystem.floor(activeFloor);
            this.createLabel(
                layer,
                'TowerResumeHint',
                `第 ${activeFloor} 层还没结算，继续挑战不会再扣灵力。`,
                13,
                CONTENT_WIDTH - 32,
                34,
                0,
                26,
                COLORS.ember,
            );
            this.createButton(
                layer,
                'TowerResumeButton',
                '继续这一层',
                0,
                -28,
                200,
                48,
                COLORS.ember,
                () => {
                    if (activeConfig) {
                        this.startTowerBattle(activeConfig.floor, activeConfig.enemyId);
                    }
                },
            );
        } else {
            this.createLabel(
                layer,
                'TowerGateHint',
                gate.message,
                13,
                CONTENT_WIDTH - 32,
                34,
                0,
                26,
                gate.allowed ? COLORS.jade : COLORS.danger,
            );
            this.createButton(
                layer,
                'TowerChallengeButton',
                firstClear ? '本层已通关' : `挑战第 ${config.floor} 层`,
                0,
                -28,
                200,
                48,
                gate.allowed && !firstClear ? COLORS.ember : COLORS.panelAlt,
                () => {
                    const result = TowerSystem.begin(save, config.floor);
                    if (!result.success || !result.enemyId) {
                        this.openTowerPanel(result.message);
                        return;
                    }
                    this.startTowerBattle(config.floor, result.enemyId);
                },
            );
        }

        if (adventure) {
            const adventureText = this.createLabel(
                layer,
                'TowerAdventure',
                `奇遇 · ${adventure.title}\n${adventure.description}`,
                14,
                CONTENT_WIDTH - 40,
                60,
                0,
                -112,
                COLORS.ink,
            );
            adventureText.enableWrapText = true;
            adventure.options.forEach((option, index) => {
                this.createButton(
                    layer,
                    `TowerAdventure_${option.id}`,
                    option.label,
                    index === 0 ? -92 : 92,
                    -192,
                    160,
                    48,
                    index === 0 ? COLORS.jade : COLORS.ember,
                    () => {
                        const result = TowerSystem.resolveAdventure(save, option.id);
                        this.openTowerPanel(result.message);
                    },
                );
            });
        } else {
            this.createLabel(
                layer,
                'TowerMessage',
                message ||
                    TowerSystem.archiveBranchSummary(save) ||
                    '塔中每一层都可从敌方意图中读出应对方式。',
                13,
                CONTENT_WIDTH - 38,
                78,
                0,
                -132,
                message ? COLORS.jade : COLORS.muted,
            ).enableWrapText = true;
        }

        if (forgeRecommendation) {
            const tip = this.createLabel(
                layer,
                'TowerForgeRecommendation',
                forgeRecommendation.message,
                13,
                CONTENT_WIDTH - 38,
                48,
                0,
                -254,
                COLORS.jade,
            );
            tip.enableWrapText = true;
            this.createButton(
                layer,
                'TowerForgeRecommendationGo',
                forgeRecommendation.action === 'warm'
                    ? '前往温养'
                    : '前往重淬',
                -88,
                -314,
                148,
                36,
                COLORS.jade,
                () => this.openBagForForgeRecommendation(forgeRecommendation),
            );
            this.createButton(
                layer,
                'TowerForgeRecommendationDismiss',
                '暂不处理',
                88,
                -314,
                148,
                36,
                COLORS.panelAlt,
                () => {
                    this.pendingForgeRecommendation = null;
                    this.openTowerPanel(message, null);
                },
            );
        }
    }

    private startTowerBattle(floor: number, enemyId: string): void {
        const save = this.activeSave;
        const config = TowerSystem.floor(floor);
        if (!save || !config) {
            return;
        }
        this.startExternalBattle(
            enemyId,
            `无名塔第 ${floor} 层 · ${config.title}`,
            (victory) => {
                const latest = this.activeSave;
                if (!latest) {
                    return;
                }
                const result = TowerSystem.settle(latest, victory);
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.pendingForgeRecommendation =
                    result.forgeRecommendation ??
                    this.pendingForgeRecommendation;
                this.openTowerPanel(result.message, result.forgeRecommendation);
            },
        );
    }

    private openBagForForgeRecommendation(
        recommendation: ForgeRecommendation,
    ): void {
        this.pendingForgeRecommendation = null;
        this.bagView = 'equipment';
        this.bagSlotFilter = 'all';
        this.bagQualityFilter = 'all';
        this.bagStatusFilter = 'all';
        this.bagSelectedEquipmentId = recommendation.equipmentId;
        this.bagSelectedAffixIndex = 0;
        this.openBagPanel();
        this.setBagMessage(
            `${recommendation.message} 请在下方执行${recommendation.action === 'warm' ? '温养 +1' : '重淬词条'}。`,
        );
    }

    private openSummonPanel(message = ''): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        SummonSystem.ensure(save);
        const layer = this.prepareActivityPanel(
            '潮契招募',
            '主线只会把伙伴带到你面前；招募台消耗灵石，契印回应后才算正式入队。',
            new Color(25, 39, 51, 215),
        );
        if (!layer) {
            return;
        }

        const pool = SummonSystem.pool(save);
        const definitions = CompanionSystem.definitions();
        const recruitedCount = CompanionSystem.recruited(save).length;
        const activeNames = CompanionSystem.active(save)
            .map((state) => CompanionSystem.getDefinition(state.npcId)?.name)
            .filter(Boolean)
            .join('、');
        const recruitedCompanions = CompanionSystem.recruited(save);
        if (
            !recruitedCompanions.some(
                (state) => state.npcId === this.companionSelectedNpcId,
            )
        ) {
            this.companionSelectedNpcId =
                recruitedCompanions[0]?.npcId ?? '';
        }
        const selectedCompanion = this.companionSelectedNpcId
            ? CompanionSystem.getDefinition(this.companionSelectedNpcId)
            : null;
        const freshCount = pool.filter((definition) => {
            const state = CompanionSystem.getState(save, definition.npcId);
            return !state?.recruited;
        }).length;
        const poolText = pool.length
            ? `现在能遇见：${pool
                  .map((definition) => {
                      const state = CompanionSystem.getState(
                          save,
                          definition.npcId,
                      );
                      return state?.recruited
                          ? `${definition.name}·已拥有·同契${state.duplicateCount}`
                          : `${definition.name}·待引契`;
                  })
                  .join('  ')}`
            : '暂时还没有伙伴。沿着主线走下去，招募台会逐渐开放新的契印。';
        const poolUnlockHint = pool.length
            ? '解锁规则：完成「灰牌入山」后，首位伙伴会在第一章结算时自动加入，并开放外院招募池；后续伙伴随主线逐个解锁。'
            : '招募池尚未开放：请先完成「灰牌入山」。第一章结算会自动加入首位伙伴，并同时开放外院灰牌招募池；不需要先抽到人物。';
        const lockedNames = definitions
            .filter((definition) => !SummonSystem.isUnlocked(save, definition.npcId))
            .map((definition) => definition.name)
            .join('、');

        const summonBackground = this.createSprite(
            layer,
            'SummonBackground',
            CONTENT_WIDTH,
            DESIGN_HEIGHT - MOBILE_CANVAS.safeTop - MOBILE_CANVAS.safeBottom,
            0,
            0,
        );
        summonBackground.color = new Color(255, 255, 255, 105);
        this.loadSpriteFrame(
            'bg_recruitment_ritual',
            'system_summon',
            (frame) => {
                summonBackground.spriteFrame = frame;
                summonBackground.node.active = true;
            },
        );

        const summonLight = this.createSprite(
            layer,
            'SummonDrawLight',
            208,
            208,
            0,
            144,
        );
        summonLight.color = new Color(255, 255, 255, 155);
        this.loadSpriteFrame(
            'fx_recruitment_draw_light',
            'system_summon',
            (frame) => {
                summonLight.spriteFrame = frame;
                summonLight.node.active = true;
            },
        );

        pool.slice(0, 3).forEach((definition, index) => {
            const x = (index - (Math.min(pool.length, 3) - 1) / 2) * 112;
            const portrait = definition.portrait
                ? this.createSprite(
                      layer,
                      `SummonPortrait_${definition.npcId}`,
                      52,
                      68,
                      x,
                      145,
                  )
                : null;
            if (portrait && definition.portrait) {
                portrait.color = new Color(255, 255, 255, 255);
                this.loadSpriteFrame(
                    definition.portrait,
                    undefined,
                    (frame) => {
                        portrait.spriteFrame = frame;
                        portrait.node.active = true;
                    },
                );
            }
            const frame = this.createSprite(
                layer,
                `SummonFrame_${definition.npcId}`,
                52,
                68,
                x,
                145,
            );
            this.loadSpriteFrame(
                definition.npcId === 'ye_chen_xing'
                    ? 'frame_recruitment_heritage'
                    : 'frame_recruitment_rare',
                'system_summon',
                (spriteFrame) => {
                    frame.spriteFrame = spriteFrame;
                    frame.node.active = true;
                },
            );
        });

        const resources = this.createLabel(
            layer,
            'SummonResources',
            `灵石 ${EconomySystem.getLingShi(save)}  ·  免费十连 ${save.summon.freeTenDraws}  ·  已招募 ${recruitedCount}/${definitions.length}`,
            15,
            CONTENT_WIDTH - 30,
            30,
            0,
            255,
            COLORS.jade,
        );
        resources.enableWrapText = true;

        const poolLabel = this.createLabel(
            layer,
            'SummonPool',
            `${poolUnlockHint}\n${poolText}\n还没开：${lockedNames || '无'}`,
            13,
            CONTENT_WIDTH - 32,
            66,
            0,
            203,
            COLORS.ink,
        );
        poolLabel.enableWrapText = true;

        const pityLabel = this.createLabel(
            layer,
            'SummonPity',
            `连续未出人物：${save.summon.pityCount}/${SUMMON_PITY_LIMIT}（第${SUMMON_PITY_LIMIT}次人物保底）  ·  总引契 ${save.summon.totalDraws}次`,
            13,
            CONTENT_WIDTH - 34,
            50,
            0,
            133,
            COLORS.muted,
        );
        pityLabel.enableWrapText = true;

        const activeLabel = this.createLabel(
            layer,
            'SummonActive',
            `现在同行：${activeNames || '还没有'}  ·  最多 3 人  ·  还没遇到 ${freshCount} 人`,
            13,
            CONTENT_WIDTH - 34,
            34,
            0,
            75,
            COLORS.jade,
        );
        activeLabel.enableWrapText = true;

        const singleButton = this.createButton(
            layer,
            'SummonSingleButton',
            `单抽\n${SUMMON_SINGLE_COST} 灵石`,
            -92,
            -84,
            150,
            56,
            COLORS.jade,
            () => {
                const result = SummonSystem.draw(save, 1);
                this.openSummonPanel(result.message);
            },
        );
        this.setButtonLabelStyle(singleButton, 14, 18);
        const singleControl = singleButton.getComponent(Button);
        if (singleControl) {
            singleControl.interactable =
                pool.length > 0 &&
                EconomySystem.canAfford(save, SUMMON_SINGLE_COST);
        }

        const tenButton = this.createButton(
            layer,
            'SummonTenButton',
            save.summon.freeTenDraws > 0
                ? `免费十连\n剩余 ×${save.summon.freeTenDraws}`
                : `十连\n${SUMMON_TEN_COST} 灵石`,
            92,
            -84,
            150,
            56,
            COLORS.ember,
            () => {
                const result = SummonSystem.draw(
                    save,
                    10,
                    save.summon.freeTenDraws > 0,
                );
                this.openSummonPanel(result.message);
            },
        );
        this.setButtonLabelStyle(tenButton, 14, 18);
        const tenControl = tenButton.getComponent(Button);
        if (tenControl) {
            tenControl.interactable =
                pool.length > 0 &&
                (save.summon.freeTenDraws > 0 ||
                    EconomySystem.canAfford(save, SUMMON_TEN_COST));
        }

        const poolAdReason =
            SummonSystem.currentPoolUnlockAdUnavailableReason(save);
        const poolAdButton = this.createButton(
            layer,
            'SummonPoolAdButton',
            poolAdReason
                ? poolAdReason
                : '看广告 · 解锁当前全部卡池',
            0,
            -145,
            250,
            40,
            COLORS.ember,
            () => this.watchCurrentPoolUnlockAd(),
        );
        poolAdButton.getComponent(Button)!.interactable = !poolAdReason;
        this.setButtonLabelStyle(poolAdButton, 12, 16);

        const companionTargetButton = this.createButton(
            layer,
            'CompanionFavorTargetButton',
            selectedCompanion
                ? `伙伴：${selectedCompanion.name}\n点击切换`
                : '伙伴培养\n招募后开放',
            -76,
            -200,
            132,
            46,
            COLORS.panelAlt,
            () => this.cycleCompanionFavorTarget(),
        );
        const companionAdButton = this.createButton(
            layer,
            'CompanionFavorAdButton',
            selectedCompanion
                ? '看广告 · 好感 +5'
                : '看广告 · 好感 +5',
            76,
            -200,
            132,
            46,
            COLORS.jade,
            () => {
                if (this.companionSelectedNpcId) {
                    this.watchCompanionFavorAd(this.companionSelectedNpcId);
                }
            },
        );
        companionTargetButton.getComponent(Button)!.interactable =
            recruitedCompanions.length > 1;
        companionAdButton.getComponent(Button)!.interactable =
            Boolean(selectedCompanion);
        this.setButtonLabelStyle(companionTargetButton, 12, 15);
        this.setButtonLabelStyle(companionAdButton, 12, 15);

        const ruleLabel = this.createLabel(
            layer,
            'SummonRules',
            `人物分项出率：男性 ${Math.round(SUMMON_MALE_RATE * 100)}%、女性 ${Math.round(SUMMON_FEMALE_RATE * 100)}%；人物总出率取当前奖池最高档 ${Math.round(Math.max(SUMMON_MALE_RATE, SUMMON_FEMALE_RATE) * 100)}%；新存档第 1 次招募优先回应 1 名未招募伙伴，之后连续 29 次未出人物时第 30 次必得人物。重复契印会变成同契记忆，并给对应伙伴加 1 点好感。抽到新伙伴会自动进队，队伍满 3 人后只放进背包，不会替换队友。`,
            12,
            CONTENT_WIDTH - 34,
            50,
            0,
            -255,
            COLORS.muted,
        );
        ruleLabel.enableWrapText = true;

        const messageLabel = this.createLabel(
            layer,
            'SummonMessage',
            message ||
            '招募台只能递出契印。主线让你遇见他们，是否同行，由每个人自己回应。',
            13,
            CONTENT_WIDTH - 36,
            48,
            0,
            -316,
            message ? COLORS.jade : COLORS.muted,
        );
        messageLabel.enableWrapText = true;
    }

    private watchCurrentPoolUnlockAd(): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const unavailable =
            SummonSystem.currentPoolUnlockAdUnavailableReason(save);
        if (unavailable) {
            this.openSummonPanel(unavailable);
            return;
        }
        this.openRewardedAction({
            placement: 'summon_current_pools_unlock',
            title: '解锁当前卡池',
            body: '完整观看广告后，直接解锁当前版本已经满足剧情前置的全部伙伴卡池。',
            reward: '只解锁已满足前置的卡池，不跳过未开放剧情；每个存档仅限一次。',
            onComplete: () => {
                const result = SummonSystem.claimCurrentPoolUnlockAd(save);
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.openSummonPanel(result.message);
            },
        });
    }

    private cycleCompanionFavorTarget(): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const recruited = CompanionSystem.recruited(save);
        if (recruited.length <= 1) {
            return;
        }
        const currentIndex = recruited.findIndex(
            (state) => state.npcId === this.companionSelectedNpcId,
        );
        this.companionSelectedNpcId =
            recruited[(currentIndex + 1 + recruited.length) % recruited.length]
                .npcId;
        this.openSummonPanel();
    }

    private watchCompanionFavorAd(npcId: string): void {
        const save = this.activeSave;
        const state = save ? CompanionSystem.getState(save, npcId) : null;
        if (!save || !state?.recruited) {
            this.openSummonPanel('先招募这名伙伴，再进行培养或赠礼结算。');
            return;
        }
        this.openRewardedAction({
            placement: 'companion_favor_settlement',
            title: '伙伴培养 / 赠礼结算',
            body: '完整观看广告后，为当前选中的伙伴追加一次培养结算奖励。',
            reward: '好感度 +5；每次结算都可以领取。',
            onComplete: () => {
                const result = CompanionSystem.claimFavorAd(save, npcId);
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.openSummonPanel(result.message);
            },
        });
    }

    private openMarketPanel(message = ''): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const powderOffer = MARKET_OFFERS.find(
            (offer) => offer.id === 'market_hui_qi_powder',
        );
        const materialOffer = MARKET_OFFERS.find(
            (offer) => offer.id === 'market_tempering_material',
        );
        if (!powderOffer || !materialOffer) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '坊市货架还没准备好，请稍后再试。');
            return;
        }
        const powderRemaining = EconomySystem.marketRemaining(
            save,
            powderOffer.id,
        );
        const materialRemaining = EconomySystem.marketRemaining(
            save,
            materialOffer.id,
        );
        const layer = this.prepareActivityPanel(
            '坊市',
            '货架会随修为、主线和爬塔进度补货；药圃种出的回气草也能拿来卖。',
        );
        if (!layer) {
            return;
        }
        const materials = EquipmentForgeSystem.temperingMaterialCount(save);
        const resourceLabel = this.createLabel(
            layer,
            'MarketResources',
            `灵石 ${EconomySystem.getLingShi(save)}  ·  淬炼材料 ${materials}\n回气散 ${save.inventory.hui_qi_powder ?? 0}  ·  回气草 ${save.inventory.homegrown_herb ?? 0}`,
            14,
            CONTENT_WIDTH - 30,
            48,
            0,
            260,
            COLORS.jade,
        );
        resourceLabel.enableWrapText = true;
        this.createLabel(
            layer,
            'MarketOffersTitle',
            '药材摊',
            17,
            CONTENT_WIDTH - 30,
            28,
            0,
            214,
            COLORS.ink,
        );
        const buyPowderButton = this.createButton(
            layer,
            'BuyPowderButton',
            `${powderOffer.name}\n${powderOffer.cost}灵石 余${powderRemaining}/${powderOffer.limitPerRound}`,
            -94,
            154,
            154,
            62,
            COLORS.jade,
            () => {
                const result = EconomySystem.buyMarketItem(save, 'market_hui_qi_powder');
                this.openMarketPanel(result.message);
            },
        );
        this.setButtonLabelStyle(buyPowderButton, 13, 18);
        const buyMaterialButton = this.createButton(
            layer,
            'BuyMaterialButton',
            `${materialOffer.name}\n${materialOffer.cost}灵石 余${materialRemaining}/${materialOffer.limitPerRound}`,
            94,
            154,
            154,
            62,
            COLORS.ember,
            () => {
                const result = EconomySystem.buyMarketItem(
                    save,
                    'market_tempering_material',
                );
                this.openMarketPanel(result.message);
            },
        );
        this.setButtonLabelStyle(buyMaterialButton, 13, 18);
        this.createLabel(
            layer,
            'MarketCraftTitle',
            '药材摊 · 草药循环',
            17,
            CONTENT_WIDTH - 30,
            28,
            0,
            78,
            COLORS.ink,
        );
        this.createButton(
            layer,
            'MarketCraftButton',
            '用全部药草制回气散',
            0,
            28,
            252,
            44,
            COLORS.panelAlt,
            () => {
                const available = Math.floor(
                    Number(save.inventory.homegrown_herb ?? 0) / 2,
                );
                const result = EconomySystem.craftHuiQiPowder(save, available);
                this.openMarketPanel(result.message);
            },
        );
        this.createButton(
            layer,
            'MarketSellHerbsButton',
            '出售全部回气草',
            0,
            -28,
            252,
            44,
            COLORS.ember,
            () => {
                const result = EconomySystem.sellHerbs(
                    save,
                    Number(save.inventory.homegrown_herb ?? 0),
                );
                this.openMarketPanel(result.message);
            },
        );
        this.createLabel(
            layer,
            'MarketForgeTitle',
            '淬炼铺',
            17,
            CONTENT_WIDTH - 30,
            28,
            0,
            -86,
            COLORS.ink,
        );
        this.createButton(
            layer,
            'MarketForgeButton',
            '打开温养 / 重淬',
            0,
            -126,
            220,
            40,
            COLORS.ember,
            () => {
                this.bagView = 'equipment';
                this.openBagPanel();
            },
        );
        this.createButton(
            layer,
            'MarketGardenButton',
            `后山药圃 · ${save.herbPlot.stage === 3 ? '采收' : '照料'}`,
            0,
            -180,
            210,
            40,
            COLORS.jade,
            () => {
                this.openMapScene();
                this.moveMapPlayerTo(
                    -100,
                    -150,
                    '后山药圃：种下回气草',
                    '这里可以播种、照料，等药草成熟后再回来收获。',
                    'herb',
                );
            },
        );
        this.createButton(
            layer,
            'MarketCommissionButton',
            '委托处 · 查看外院委托',
            0,
            -234,
            236,
            40,
            COLORS.ember,
            () => this.openCommissionPanel(),
        );
        this.createLabel(
            layer,
            'MarketMessage',
            message || '灵石主要靠爬塔首通、做委托和卖东西获得，静修不会直接给灵石。',
            13,
            CONTENT_WIDTH - 38,
            50,
            0,
            -302,
            message ? COLORS.jade : COLORS.muted,
        ).enableWrapText = true;
    }

    private openCommissionPanel(message = ''): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const layer = this.prepareActivityPanel(
            '外院委托',
            '委托会花灵力，但能稳定拿到灵石、材料和回气草；药圃种的回气草也能交到这里。',
        );
        if (!layer) {
            return;
        }
        const access = CommissionSystem.accessMessage(save);
        if (access) {
            this.createLabel(
                layer,
                'CommissionLocked',
                access,
                16,
                CONTENT_WIDTH - 42,
                72,
                0,
                154,
                COLORS.danger,
            ).enableWrapText = true;
            this.createButton(
                layer,
                'CommissionStoryButton',
                '进入主线',
                0,
                66,
                196,
                46,
                COLORS.ember,
                () => this.openStoryFromHub(),
            );
            return;
        }

        const activeCommission = save.commissions.activeCommissionId
            ? CommissionSystem.commission(save.commissions.activeCommissionId)
            : null;
        if (activeCommission) {
            const activeDetail = this.createLabel(
                layer,
                'CommissionActiveDetail',
                `当前正在处理「${activeCommission.title}」\n${activeCommission.description}\n` +
                    '灵力已在接取时扣除；完成或失败结算前，不能接取或刷新其他委托。',
                16,
                CONTENT_WIDTH - 42,
                118,
                0,
                174,
                COLORS.ink,
            );
            activeDetail.enableWrapText = true;
            this.createButton(
                layer,
                'CommissionResumeButton',
                '继续当前委托',
                0,
                52,
                204,
                48,
                COLORS.ember,
                () => {
                    this.startCommissionBattle(
                        activeCommission.id,
                        activeCommission.enemyId,
                    );
                },
            );
            this.createLabel(
                layer,
                'CommissionActiveHint',
                '中断后返回此处可无额外消耗继续；失败会结算本次委托。',
                13,
                CONTENT_WIDTH - 42,
                48,
                0,
                -32,
                COLORS.muted,
            ).enableWrapText = true;
            this.createLabel(
                layer,
                'CommissionMessage',
                message || '当前委托结算后可接取下一份或刷新列表。',
                13,
                CONTENT_WIDTH - 42,
                48,
                0,
                -166,
                message ? COLORS.jade : COLORS.muted,
            ).enableWrapText = true;
            return;
        }

        const commissions = CommissionSystem.list(save);
        if (!commissions.length) {
            this.createLabel(
                layer,
                'CommissionEmpty',
                '现在没有能接的委托，可以刷新列表。',
                15,
                CONTENT_WIDTH - 42,
                48,
                0,
                156,
                COLORS.muted,
            );
        } else {
            this.commissionSelectedIndex =
                ((this.commissionSelectedIndex % commissions.length) +
                    commissions.length) %
                commissions.length;
            const selected = commissions[this.commissionSelectedIndex];
            const detail = this.createLabel(
                layer,
                'CommissionDetail',
                `「${selected.title}」\n${selected.description}\n` +
                    `消耗 ${selected.spiritCost} 灵力  ·  奖励 ${selected.lingShi} 灵石、淬炼材料 ×${selected.material}、回气草 ×${selected.herbs}`,
                16,
                CONTENT_WIDTH - 42,
                118,
                0,
                180,
                COLORS.ink,
            );
            detail.enableWrapText = true;
            this.createButton(
                layer,
                'CommissionPreviousButton',
                '上一份',
                -92,
                86,
                132,
                42,
                COLORS.panelAlt,
                () => {
                    this.commissionSelectedIndex -= 1;
                    this.openCommissionPanel(message);
                },
            );
            this.createButton(
                layer,
                'CommissionNextButton',
                '下一份',
                92,
                86,
                132,
                42,
                COLORS.panelAlt,
                () => {
                    this.commissionSelectedIndex += 1;
                    this.openCommissionPanel(message);
                },
            );
            this.createButton(
                layer,
                'CommissionAcceptButton',
                '接取并出发',
                0,
                24,
                204,
                48,
                COLORS.ember,
                () => {
                    const result = CommissionSystem.begin(save, selected.id);
                    if (!result.success || !result.enemyId) {
                        this.openCommissionPanel(result.message);
                        return;
                    }
                    this.startCommissionBattle(selected.id, result.enemyId);
                },
            );
        }

        this.createButton(
            layer,
            'CommissionHerbDeliveryButton',
            '交付回气草 ×2',
            0,
            -124,
            224,
            42,
            COLORS.jade,
            () => {
                const result = CommissionSystem.deliverHerbs(save);
                this.openCommissionPanel(result.message);
            },
        );
        this.createButton(
            layer,
            'CommissionRefreshButton',
            save.economy.commissionRefreshCount > 0
                ? '刷新委托（6 灵石）'
                : '今日首次刷新免费',
            0,
            -194,
            224,
            44,
            COLORS.panelAlt,
            () => {
                const result = CommissionSystem.refresh(save);
                this.commissionSelectedIndex = 0;
                this.openCommissionPanel(result.message);
            },
        );
        this.createLabel(
            layer,
            'CommissionMessage',
            message || `灵石 ${EconomySystem.getLingShi(save)}  ·  今日刷新 ${save.economy.commissionRefreshCount} 次  ·  药圃交付 ${save.commissions.herbDeliveryCount} 次`,
            13,
            CONTENT_WIDTH - 42,
            48,
            0,
            -266,
            message ? COLORS.jade : COLORS.muted,
        ).enableWrapText = true;
    }

    private startCommissionBattle(commissionId: string, enemyId: string): void {
        const commission = CommissionSystem.commission(commissionId);
        if (!commission) {
            return;
        }
        this.startExternalBattle(
            enemyId,
            `委托 · ${commission.title}`,
            (victory) => {
                const save = this.activeSave;
                if (!save) {
                    return;
                }
                const result = CommissionSystem.settle(save, victory);
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                if (result.success && result.commissionId) {
                    this.openCommissionSettlementPanel(
                        result.message,
                        result.commissionId,
                    );
                } else {
                    this.openCommissionPanel(result.message);
                }
            },
        );
    }

    private openCommissionSettlementPanel(
        message: string,
        commissionId: string,
    ): void {
        const save = this.activeSave;
        const commission = CommissionSystem.commission(commissionId);
        if (!save || !commission) {
            this.openCommissionPanel(message);
            return;
        }
        const layer = this.prepareActivityPanel(
            '委托完成结算',
            `「${commission.title}」已完成，剧情旗标不参与翻倍。`,
        );
        if (!layer) {
            return;
        }
        const reward = this.createLabel(
            layer,
            'CommissionSettlementReward',
            `基础奖励：${commission.lingShi} 灵石 · 淬炼材料 ×${commission.material} · 回气草 ×${commission.herbs}`,
            16,
            CONTENT_WIDTH - 38,
            60,
            0,
            205,
            COLORS.ink,
        );
        reward.enableWrapText = true;
        const reason = EconomySystem.commissionRewardAdUnavailableReason(
            save,
            commissionId,
        );
        const button = this.createButton(
            layer,
            'CommissionRewardAdButton',
            reason
                ? reason
                : '看广告 · 灵石、材料、药材翻倍',
            0,
            88,
            CONTENT_WIDTH - 42,
            48,
            COLORS.ember,
            () => this.watchCommissionRewardAd(commissionId),
        );
        const control = button.getComponent(Button);
        if (control) {
            control.interactable = !reason;
        }
        this.setButtonLabelStyle(button, 13, 17);
        this.createLabel(
            layer,
            'CommissionSettlementMessage',
            message,
            14,
            CONTENT_WIDTH - 42,
            80,
            0,
            -8,
            COLORS.jade,
        ).enableWrapText = true;
        this.createLabel(
            layer,
            'CommissionRewardAdLimit',
            `每日最多 3 次 · 今日已用 ${save.economy.commissionRewardAdCount} 次`,
            12,
            CONTENT_WIDTH - 42,
            32,
            0,
            -92,
            COLORS.muted,
        );
        this.createButton(
            layer,
            'CommissionSettlementBack',
            '继续委托',
            0,
            -176,
            190,
            44,
            COLORS.panelAlt,
            () => this.openCommissionPanel(),
        );
    }

    private watchCommissionRewardAd(commissionId: string): void {
        const save = this.activeSave;
        const commission = CommissionSystem.commission(commissionId);
        if (!save || !commission) {
            return;
        }
        const reason = EconomySystem.commissionRewardAdUnavailableReason(
            save,
            commissionId,
        );
        if (reason) {
            this.openCommissionSettlementPanel(reason, commissionId);
            return;
        }
        this.openRewardedAction({
            placement: 'commission_reward_double',
            title: '委托奖励翻倍',
            body: '完整观看广告后，当前委托的灵石、淬炼材料和药材奖励各额外获得一份。',
            reward: '剧情旗标不翻倍；每日最多 3 次。',
            onComplete: () => {
                const result = EconomySystem.claimCommissionRewardAd(
                    save,
                    commissionId,
                    commission.lingShi,
                    commission.material,
                    commission.herbs,
                );
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.openCommissionSettlementPanel(result.message, commissionId);
            },
        });
    }

    private openGoalPanel(message = ''): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const goal = ProgressionSystem.initializeGoalState(save);
        const layer = this.prepareActivityPanel(
            goal.title,
            goal.description,
        );
        if (!layer) {
            return;
        }
        if (goal.atCap) {
            ProgressionSystem.acknowledgeCapNotice(save);
        }
        const conditions = goal.conditions
            .map((condition) => `${condition.complete ? '✓' : '○'} ${condition.label}`)
            .join('\n');
        const conditionLabel = this.createLabel(
            layer,
            'GoalConditions',
            conditions,
            16,
            CONTENT_WIDTH - 44,
            160,
            0,
            172,
            COLORS.ink,
        );
        conditionLabel.enableWrapText = true;

        if (goal.storyHook) {
            const storyHookLabel = this.createLabel(
                layer,
                'GoalStoryHook',
                goal.storyStatus === 'coming_soon'
                    ? `剧情状态：${goal.storyHook}`
                    : goal.storyHook,
                13,
                CONTENT_WIDTH - 42,
                54,
                0,
                -116,
                COLORS.muted,
            );
            storyHookLabel.enableWrapText = true;
        }

        const trialStats = save.cultivationGoal.trialStats;
        if (
            save.cultivation.realmId === 'qi_refining' &&
            save.cultivation.stage === 5 &&
            trialStats.attempts > 0
        ) {
            this.createLabel(
                layer,
                'GoalTrialStats',
                `试炼记录：试了 ${trialStats.attempts} 次 · 最好打到 ${trialStats.clearedSegments}/3 段 · 一共挨了 ${trialStats.totalDamageTaken} 点伤`,
                13,
                CONTENT_WIDTH - 42,
                34,
                0,
                -80,
                COLORS.muted,
            ).enableWrapText = true;
        }

        const trialSegment = ProgressionSystem.currentTrialSegment(save);
        if (goal.canStartTrial && trialSegment) {
            this.createButton(
                layer,
                'GoalTrialButton',
                trialSegment.phase === 1
                    ? '开始凝境试炼'
                    : `继续试炼 · 第 ${trialSegment.phase}/3 段`,
                0,
                38,
                220,
                50,
                COLORS.ember,
                () => this.startCondensationTrial(),
            );
        } else if (goal.canBreakthrough) {
            this.createButton(
                layer,
                'GoalBreakthroughButton',
                '开始突破',
                0,
                38,
                220,
                50,
                COLORS.jade,
                () => {
                    const success = ProgressionSystem.breakthrough(save);
                    const resultMessage = success
                        ? `突破成功：${save.cultivation.realmLabel} ${save.cultivation.stage} 层。`
                        : '突破条件还没满足。';
                    this.mapHintLabel && (this.mapHintLabel.string = resultMessage);
                    this.updateRadarChart(save);
                    this.updateCharacterSystemLabel(save);
                    this.openCharacterPanel();
                },
            );
        } else {
            const towerIncomplete = goal.conditions.some(
                (condition) =>
                    condition.id === 'tower_floor_8' && !condition.complete,
            );
            this.createButton(
                layer,
                'GoalPrimaryAction',
                towerIncomplete ? '前往无名塔' : '返回修行',
                0,
                38,
                220,
                50,
                towerIncomplete ? COLORS.ember : COLORS.panelAlt,
                () => {
                    if (towerIncomplete) {
                        this.openTowerPanel();
                    } else {
                        this.openCharacterPanel();
                    }
                },
            );
            if (
                goal.conditions.some(
                    (condition) =>
                        condition.id === 'qi05_mainline' && !condition.complete,
                )
            ) {
                this.createButton(
                    layer,
                    'GoalStoryAction',
                    '进入主线',
                    0,
                    -24,
                    220,
                    44,
                    COLORS.ember,
                    () => this.openStoryFromHub(),
                );
            }
        }
        this.createLabel(
            layer,
            'GoalMessage',
            message || '修为满了以后，下一步目标会留在这里，不会让你白白静修。',
            13,
            CONTENT_WIDTH - 42,
            64,
            0,
            -144,
            message ? COLORS.jade : COLORS.muted,
        ).enableWrapText = true;
    }

    private startCondensationTrial(): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const unavailable = ProgressionSystem.trialStartUnavailableReason(save);
        if (unavailable) {
            this.openGoalPanel(unavailable);
            return;
        }
        const segment = ProgressionSystem.startCondensationTrial(save);
        if (!segment) {
            this.openGoalPanel('凝境试炼还没满足条件。');
            return;
        }
        this.startExternalBattle(
            segment.enemyId,
            segment.title,
            (victory, state) => {
                const latest = this.activeSave;
                if (!latest) {
                    return;
                }
                const result = ProgressionSystem.resolveCondensationTrial(
                    latest,
                    victory,
                    state,
                );
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.updateCharacterSystemLabel(latest);
                if (result.success) {
                    this.openGoalPanel(result.message);
                } else {
                    this.openBreakthroughFailurePanel(result.message);
                }
            },
        );
    }

    private openBreakthroughFailurePanel(message = ''): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const layer = this.prepareActivityPanel(
            '突破失败结算',
            '本次凝境试炼失败，完整观看广告可返还本次消耗灵力的 100%。',
        );
        if (!layer) {
            return;
        }
        const failedPhase = save.cultivationGoal.lastFailedTrialPhase;
        const spiritCost = save.cultivationGoal.lastFailedTrialSpiritCost;
        this.createLabel(
            layer,
            'BreakthroughFailureSummary',
            `失败阶段：第 ${failedPhase}/3 段\n本次消耗：灵力 ×${spiritCost}`,
            16,
            CONTENT_WIDTH - 42,
            70,
            0,
            190,
            COLORS.ink,
        ).enableWrapText = true;

        const reason =
            ProgressionSystem.breakthroughFailureAdUnavailableReason(save);
        const adButton = this.createButton(
            layer,
            'BreakthroughFailureAdButton',
            reason ? reason : '看广告 · 返还 100% 试炼灵力',
            0,
            80,
            CONTENT_WIDTH - 42,
            50,
            COLORS.ember,
            () => this.watchBreakthroughFailureAd(),
        );
        const adControl = adButton.getComponent(Button);
        if (adControl) {
            adControl.interactable = !reason;
        }
        this.setButtonLabelStyle(adButton, 13, 17);

        this.createLabel(
            layer,
            'BreakthroughFailureMessage',
            message || '试炼进度已经重置，先处理本次失败结算。',
            14,
            CONTENT_WIDTH - 42,
            74,
            0,
            -10,
            message ? COLORS.jade : COLORS.muted,
        ).enableWrapText = true;
        this.createButton(
            layer,
            'BreakthroughFailureBack',
            '返回突破目标',
            0,
            -142,
            190,
            44,
            COLORS.panelAlt,
            () => this.openGoalPanel(),
        );
    }

    private watchBreakthroughFailureAd(): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        const unavailable =
            ProgressionSystem.breakthroughFailureAdUnavailableReason(save);
        if (unavailable) {
            this.openBreakthroughFailurePanel(unavailable);
            return;
        }
        this.openRewardedAction({
            placement: 'breakthrough_failure_refund',
            title: '突破失败补偿',
            body: '完整观看广告后，返还本次凝境试炼实际消耗的全部灵力。',
            reward: '返还 100% 试炼灵力；每次失败结算仅限一次。',
            onComplete: () => {
                const result = ProgressionSystem.claimBreakthroughFailureAd(
                    save,
                    'refund',
                );
                this.mapHintLabel && (this.mapHintLabel.string = result.message);
                this.updateCharacterSystemLabel(save);
                this.openGoalPanel(result.message);
            },
        });
    }

    private openStoryFromHub(): void {
        if (this.activeSave) {
            const event = EventRouter.pending(this.activeSave) ??
                GameContentRegistry.nextAvailableEvent(this.activeSave);
            if (event) {
                this.startRoutedEvent(event.id);
                return;
            }
        }
        this.mapHintLabel &&
            (this.mapHintLabel.string = '现在没有能直接进入的主线，先去地图上走走。');
    }

    private updateCharacterSystemLabel(save: LocalSave): void {
        if (!this.characterSystemLabel) {
            return;
        }
        const cultivation = save.cultivation;
        const weapon = save.equipment.find((item) => item.equipped);
        const materials = EquipmentForgeSystem.temperingMaterialCount(save);
        const goal = ProgressionSystem.initializeGoalState(save);
        const goalState = !goal.atCap
            ? `修为未满（${cultivation.cultivation}/${cultivation.cultivationCap}）`
            : goal.canBreakthrough
              ? '可立即突破'
              : goal.canStartTrial
                ? '可挑战凝境试炼'
                : '目标未完成';
        const nextRealm = ProgressionSystem.nextRealm(save);
        const nextRealmText = nextRealm
            ? `下一境界：${nextRealm.label}（${nextRealm.storyStatus === 'coming_soon' ? '剧情敬请期待' : '剧情已开放'}）`
            : '已到达当前境界系统终点';
        this.characterSystemLabel.string =
            `修为进度：${cultivation.realmLabel} ${cultivation.stage} 层  ` +
            `${cultivation.cultivation} / ${cultivation.cultivationCap}\n` +
            `成长阶位：第 ${ProgressionSystem.realmRank(save)} 阶  ·  ${nextRealmText}\n` +
            `主装备：${weapon?.name ?? '暂无'}  ·  淬炼材料 ${materials}  ·  灵石 ${EconomySystem.getLingShi(save)}\n` +
            `圆满目标：${goalState}  ·  无名塔最高第 ${save.tower.bestFloor} 层`;
        this.updateCharacterActionLabels();
    }

    private updateBagPanel(save: LocalSave): void {
        if (!this.bagInventoryLabel) {
            return;
        }
        EquipmentForgeSystem.ensureStarterEquipment(save);
        const equipmentEntries = this.visibleBagEquipment(save);
        if (
            this.bagView === 'equipment' &&
            !equipmentEntries.some(
                (equipment) => equipment.id === this.bagSelectedEquipmentId,
            )
        ) {
            this.bagSelectedEquipmentId = equipmentEntries[0]?.id ?? '';
            this.bagSelectedAffixIndex = 0;
        }
        const selected = equipmentEntries.find(
            (equipment) => equipment.id === this.bagSelectedEquipmentId,
        );
        const displayEquipment = equipmentEntries.slice(0, 5);
        if (
            selected &&
            !displayEquipment.some((item) => item.id === selected.id)
        ) {
            if (displayEquipment.length < 5) {
                displayEquipment.push(selected);
            } else {
                displayEquipment[displayEquipment.length - 1] = selected;
            }
        }
        const equipmentLines = displayEquipment.map((item) => {
            const marker = item.id === this.bagSelectedEquipmentId ? '▶' : '·';
            const equipped = item.equipped ? '【装】' : '';
            const locked = item.locked ? '【锁】' : '';
            return `${marker}${equipped}${locked}${QUALITY_LABELS[item.quality]} ${SLOT_LABELS[item.slot]} ${item.name} +${item.refineLevel}`;
        });
        const comparison = selected
            ? InventorySystem.compareEquipment(save, selected.id)
            : null;
        const contextualRecommendation = selected
            ? InventorySystem.contextualRecommendation(
                save,
                selected.id,
                this.bagRecommendationContext(save),
            )
            : null;
        const saleEstimate = selected
            ? InventorySystem.estimateEquipmentSale(selected)
            : null;
        const selectedDetail = selected
            ? [
                  `选中：${InventorySystem.formatStats(selected)} · 基础浮动 ${Math.round((selected.baseRoll ?? 1) * 100)}% · 词条 ${selected.affixes.length}/${QUALITY_AFFIX_LIMIT[selected.quality]}`,
                  comparison
                      ? InventorySystem.formatComparison(comparison)
                      : '',
                  contextualRecommendation
                      ? InventorySystem.formatContextualRecommendation(
                          contextualRecommendation,
                      )
                      : '',
                  saleEstimate
                      ? `回收估价：品质 ${saleEstimate.qualityBase} + 属性 ${saleEstimate.statValue} + 词条 ${saleEstimate.affixValue} = ${saleEstimate.price} 灵石${saleEstimate.capped ? `（品质上限 ${saleEstimate.cap}）` : ''}`
                      : '',
              ].filter(Boolean).join('\n')
            : '当前筛选下没有装备。';
        const powder = Math.max(0, Number(save.inventory.hui_qi_powder ?? 0));
        const herbs = Math.max(0, Number(save.inventory.homegrown_herb ?? 0));
        const materials = Math.max(
            0,
            Number(save.inventory.tempering_material ?? 0),
        );
        const longTermItems = Object.keys(save.inventory)
            .filter((itemId) =>
                itemId !== 'tempering_material' &&
                Number(save.inventory[itemId]) > 0 &&
                ITEM_DEFINITIONS[itemId] &&
                ITEM_DEFINITIONS[itemId].category !== 'consumable',
            )
            .map((itemId) =>
                `${ITEM_DEFINITIONS[itemId].name} ×${Math.floor(Number(save.inventory[itemId]))}`,
            );
        if (this.bagView === 'equipment') {
            this.bagInventoryLabel.string = [
                `装备（${BAG_SORT_LABELS[this.bagSortMode]}排序 · ${this.bagSlotFilter === 'all' ? '全部部位' : SLOT_LABELS[this.bagSlotFilter]} · ${this.bagQualityFilter === 'all' ? '全部品质' : QUALITY_LABELS[this.bagQualityFilter]} · ${BAG_STATUS_LABELS[this.bagStatusFilter]}）`,
                equipmentLines.length > 0
                    ? equipmentLines.join('\n')
                    : '暂无装备',
                '',
                selectedDetail,
            ].join('\n');
        } else if (this.bagView === 'consumables') {
            this.bagInventoryLabel.string = [
                '消耗品',
                `回气散 ×${powder}  · 每个恢复 8 点灵力`,
                `回气草 ×${herbs}  · 每株恢复 5 点灵力`,
                '',
                `当前灵力：${save.cultivation.spirit}/${save.cultivation.spiritCap}`,
                save.herbPlot.insightCharge > 0
                    ? '药圃余香已积蓄：下一场战斗洞察 +1。'
                    : '药圃暂未积蓄洞察增益。',
                `回气草可出售（2 灵石/株），或每 2 株制成 1 份回气散；每第 4 次采收额外产出淬炼材料。`,
            ].join('\n');
        } else {
            this.bagInventoryLabel.string = [
                '材料与凭证',
                `淬炼材料 ×${materials}`,
                longTermItems.length > 0
                    ? longTermItems.join(' · ')
                    : '暂无其他长期物品',
                `灵石 ${EconomySystem.getLingShi(save)}`,
                '',
                '淬炼材料用于温养与重淬；灵石用于坊市补给、温养和重淬。',
                '出售闲置装备、药草，完成委托与无名塔首通可获得灵石。',
            ].join('\n');
        }
        if (this.bagStatusLabel) {
            const affix = selected?.affixes[this.bagSelectedAffixIndex];
            const affixLimit = selected
                ? QUALITY_AFFIX_LIMIT[selected.quality]
                : 0;
            this.bagStatusLabel.string = this.bagView === 'equipment'
                ? selected
                    ? `${selected.name}${selected.locked ? '已锁定' : ''} · ${affix ? `当前词条位：${this.bagSelectedAffixIndex + 1}/${affixLimit} · ${affix.label} ${affix.tier}阶` : affixLimit > 0 ? `当前词条槽：0/${affixLimit}，重淬可以加上第一条` : '当前词条槽：0/0，该品质不可重淬'}。替换同部位装备会拆解旧温养并返还 80% 材料。`
                    : '可切换筛选条件或通过塔层获得装备。'
                : this.bagView === 'consumables'
                  ? save.cultivation.spirit >= save.cultivation.spiritCap
                    ? '灵力已充盈，回气物品暂不可使用。'
                    : powder <= 0 && herbs <= 0
                      ? '当前没有可用回气物品，可通过坊市、药圃或制作补充。'
                      : '批量使用会按缺失灵力自动止损，不会浪费回气散。'
                  : '材料页只展示长期资源，避免与装备操作混在一起。';
        }
        this.setButtonText(
            this.bagLayer,
            'BagSortButton',
            `排序：${BAG_SORT_LABELS[this.bagSortMode]}`,
        );
        this.setButtonText(
            this.bagLayer,
            'BagSlotButton',
            `部位：${this.bagSlotFilter === 'all' ? '全部' : SLOT_LABELS[this.bagSlotFilter]}`,
        );
        this.setButtonText(
            this.bagLayer,
            'BagQualityButton',
            `品质：${this.bagQualityFilter === 'all' ? '全部' : QUALITY_LABELS[this.bagQualityFilter]}`,
        );
        this.setButtonText(
            this.bagLayer,
            'BagAffixButton',
            selected?.affixes.length
                ? `词条位 ${this.bagSelectedAffixIndex + 1}/${QUALITY_AFFIX_LIMIT[selected.quality]}`
                : `词条槽 0/${selected ? QUALITY_AFFIX_LIMIT[selected.quality] : 0}`,
        );
        this.setButtonText(
            this.bagLayer,
            'BagStatusFilterButton',
            `状态：${BAG_STATUS_LABELS[this.bagStatusFilter]}`,
        );
        this.setButtonText(
            this.bagLayer,
            'BagWarmButton',
            save.flags.free_warm_used === true ? '温养 +1' : '首次温养免费',
        );
        this.setButtonText(
            this.bagLayer,
            'BagEquipmentTab',
            this.bagView === 'equipment' ? '【装备】' : '装备',
        );
        this.setButtonText(
            this.bagLayer,
            'BagConsumablesTab',
            this.bagView === 'consumables' ? '【消耗品】' : '消耗品',
        );
        this.setButtonText(
            this.bagLayer,
            'BagMaterialsTab',
            this.bagView === 'materials' ? '【材料】' : '材料',
        );
        this.setBagControlActive(
            [
                'BagSortButton',
                'BagSlotButton',
                'BagQualityButton',
                'BagSelectionButton',
                'BagEquipButton',
                'BagLockButton',
                'BagSellButton',
                'BagWarmButton',
                'BagRerollButton',
                'BagAffixButton',
                'BagStatusFilterButton',
            ],
            this.bagView === 'equipment',
        );
        this.setBagControlActive(
            [
                'BagUseOneButton',
                'BagUseFiveButton',
                'BagUseTenButton',
                'BagFillSpiritButton',
                'BagUseHerbButton',
                'BagCraftPowderButton',
                'BagPowderQuantityInput',
                'BagUseInputButton',
            ],
            this.bagView === 'consumables',
        );
        this.setBagControlActive(
            ['BagMarketButton'],
            this.bagView !== 'equipment',
        );
        const missingSpirit = Math.max(
            0,
            save.cultivation.spiritCap - save.cultivation.spirit,
        );
        const powderUsable = this.bagView === 'consumables' &&
            missingSpirit > 0 &&
            powder > 0;
        const herbUsable = this.bagView === 'consumables' &&
            missingSpirit > 0 &&
            herbs > 0;
        this.setBagControlInteractable(
            [
                'BagUseOneButton',
                'BagUseFiveButton',
                'BagUseTenButton',
                'BagFillSpiritButton',
                'BagUseInputButton',
            ],
            powderUsable,
        );
        this.setBagControlInteractable(
            ['BagUseHerbButton'],
            herbUsable,
        );
        this.setBagControlInteractable(
            ['BagCraftPowderButton'],
            this.bagView === 'consumables' && herbs >= 2,
        );
        if (this.bagPowderInput) {
            this.bagPowderInput.enabled = powderUsable;
        }
        if (this.bagPowderInput && !this.bagPowderInput.string.trim()) {
            this.bagPowderInput.string = '1';
        }
    }

    private visibleBagEquipment(save: LocalSave) {
        return InventorySystem.listEquipment(save, {
            slot: this.bagSlotFilter,
            quality: this.bagQualityFilter,
            status: this.bagStatusFilter,
            sort: this.bagSortMode,
        });
    }

    private selectedBagEquipment() {
        const save = this.activeSave;
        if (!save) {
            return null;
        }
        return this.visibleBagEquipment(save).find(
            (equipment) => equipment.id === this.bagSelectedEquipmentId,
        ) ?? null;
    }

    private setButtonText(
        parent: Node | null,
        name: string,
        text: string,
    ): void {
        const label = parent
            ?.getChildByName(name)
            ?.getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (label) {
            label.string = text;
        }
    }

    private setBagControlActive(names: string[], active: boolean): void {
        names.forEach((name) => {
            const node = this.bagLayer?.getChildByName(name);
            if (node) {
                node.active = active;
            }
        });
    }

    private setBagControlInteractable(
        names: string[],
        interactable: boolean,
    ): void {
        names.forEach((name) => {
            const node = this.bagLayer?.getChildByName(name);
            const control = node?.getComponent(Button);
            if (control) {
                control.interactable = interactable;
            }
            const label = node
                ?.getChildByName('ButtonLabel')
                ?.getComponent(Label);
            if (label) {
                label.color = interactable ? COLORS.ink : COLORS.muted;
            }
        });
    }

    private bagRecommendationContext(
        save: LocalSave,
    ): EquipmentRecommendationContext {
        const intents = this.battleState?.enemyIntents ?? [];
        if (intents.indexOf('obscure') >= 0) {
            return 'resist_obscure';
        }
        if (intents.indexOf('mana_drain') >= 0) {
            return 'recover_mana';
        }
        if (intents.indexOf('barrier') >= 0) {
            return 'break_barrier';
        }
        if (
            intents.indexOf('charge') >= 0 ||
            intents.indexOf('armor_break') >= 0 ||
            save.cultivationGoal.trialState === 'available'
        ) {
            return 'break_charge';
        }
        return 'balanced';
    }

    private setBagMessage(message: string): void {
        if (this.bagStatusLabel) {
            this.bagStatusLabel.string = message;
        }
        if (this.mapHintLabel) {
            this.mapHintLabel.string = message;
        }
    }

    private selectBagView(view: BagView): void {
        this.bagView = view;
        if (this.activeSave) {
            this.updateBagPanel(this.activeSave);
        }
    }

    private cycleBagSort(): void {
        const current = BAG_SORT_MODES.indexOf(this.bagSortMode);
        this.bagSortMode =
            BAG_SORT_MODES[(current + 1) % BAG_SORT_MODES.length];
        if (this.activeSave) {
            this.recordBagFilterChange('sort');
            this.updateBagPanel(this.activeSave);
        }
    }

    private cycleBagSlotFilter(): void {
        const current = BAG_SLOT_FILTERS.indexOf(this.bagSlotFilter);
        this.bagSlotFilter =
            BAG_SLOT_FILTERS[(current + 1) % BAG_SLOT_FILTERS.length];
        this.bagSelectedEquipmentId = '';
        this.bagSelectedAffixIndex = 0;
        if (this.activeSave) {
            this.recordBagFilterChange('slot');
            this.updateBagPanel(this.activeSave);
        }
    }

    private cycleBagQualityFilter(): void {
        const current = BAG_QUALITY_FILTERS.indexOf(this.bagQualityFilter);
        this.bagQualityFilter =
            BAG_QUALITY_FILTERS[(current + 1) % BAG_QUALITY_FILTERS.length];
        this.bagSelectedEquipmentId = '';
        this.bagSelectedAffixIndex = 0;
        if (this.activeSave) {
            this.recordBagFilterChange('quality');
            this.updateBagPanel(this.activeSave);
        }
    }

    private cycleBagStatusFilter(): void {
        const current = BAG_STATUS_FILTERS.indexOf(this.bagStatusFilter);
        this.bagStatusFilter =
            BAG_STATUS_FILTERS[(current + 1) % BAG_STATUS_FILTERS.length];
        this.bagSelectedEquipmentId = '';
        this.bagSelectedAffixIndex = 0;
        if (this.activeSave) {
            this.recordBagFilterChange('status');
            this.updateBagPanel(this.activeSave);
        }
    }

    private recordBagFilterChange(change: string): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        TelemetryService.record(save, 'inventory_sort_changed', {
            change,
            sort: this.bagSortMode,
            slot: this.bagSlotFilter,
            quality: this.bagQualityFilter,
            status: this.bagStatusFilter,
        });
        SaveManager.save(save);
    }

    private cycleBagSelection(): void {
        if (!this.activeSave) {
            return;
        }
        const entries = this.visibleBagEquipment(this.activeSave);
        if (!entries.length) {
            this.setBagMessage('当前筛选下没有可选择的装备。');
            return;
        }
        const current = entries.findIndex(
            (equipment) => equipment.id === this.bagSelectedEquipmentId,
        );
        const next = entries[(current + 1) % entries.length];
        this.bagSelectedEquipmentId = next.id;
        this.bagSelectedAffixIndex = 0;
        this.updateBagPanel(this.activeSave);
    }

    private cycleBagAffixIndex(): void {
        const selected = this.selectedBagEquipment();
        if (!selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        if (!selected.affixes.length) {
            this.setBagMessage(`${selected.name}还没有词条，重淬会直接加上第一条。`);
            return;
        }
        this.bagSelectedAffixIndex =
            (this.bagSelectedAffixIndex + 1) % selected.affixes.length;
        if (this.activeSave) {
            this.updateBagPanel(this.activeSave);
        }
    }

    private equipSelectedEquipment(): void {
        const save = this.activeSave;
        const selected = this.selectedBagEquipment();
        if (!save || !selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        const result = InventorySystem.equip(save, selected.id);
        this.setBagMessage(result.message);
        this.updateBagPanel(save);
        this.updateCharacterSystemLabel(save);
    }

    private toggleSelectedEquipmentLock(): void {
        const save = this.activeSave;
        const selected = this.selectedBagEquipment();
        if (!save || !selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        const result = InventorySystem.toggleLock(save, selected.id);
        this.setBagMessage(result.message);
        this.updateBagPanel(save);
    }

    private sellSelectedEquipment(): void {
        const save = this.activeSave;
        const selected = this.selectedBagEquipment();
        if (!save || !selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        const result = InventorySystem.sellEquipment(save, selected.id);
        this.setBagMessage(result.message);
        this.updateBagPanel(save);
        this.updateCharacterSystemLabel(save);
    }

    private fillSpiritWithPowder(): void {
        if (!this.activeSave) {
            return;
        }
        const result = InventorySystem.fillSpiritWithPowder(this.activeSave);
        this.setBagMessage(result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
    }

    private usePowder(count: number): void {
        if (!this.activeSave) {
            return;
        }
        const result = InventorySystem.useConsumable(
            this.activeSave,
            'hui_qi_powder',
            count,
        );
        this.setBagMessage(result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
    }

    private usePowderFromInput(): void {
        const rawValue = this.bagPowderInput?.string.trim() ?? '';
        const count = Number(rawValue);
        if (!Number.isInteger(count) || count <= 0) {
            this.setBagMessage('请输入大于 0 的整数数量。');
            return;
        }
        this.usePowder(count);
    }

    private useHerb(count: number): void {
        if (!this.activeSave) {
            return;
        }
        const result = InventorySystem.useConsumable(
            this.activeSave,
            'homegrown_herb',
            count,
        );
        this.setBagMessage(result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
    }

    private craftPowderFromHerbs(): void {
        if (!this.activeSave) {
            return;
        }
        const count = Math.floor(
            Number(this.activeSave.inventory.homegrown_herb ?? 0) / 2,
        );
        const result = EconomySystem.craftHuiQiPowder(this.activeSave, count);
        this.setBagMessage(result.message);
        this.updateBagPanel(this.activeSave);
    }

    private warmSelectedEquipment(): void {
        const save = this.activeSave;
        const selected = this.selectedBagEquipment();
        if (!save || !selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        const result = EquipmentForgeSystem.warm(save, selected.id);
        this.setBagMessage(result.message);
        this.updateBagPanel(save);
        this.updateCharacterSystemLabel(save);
    }

    private rerollSelectedEquipment(): void {
        const save = this.activeSave;
        const selected = this.selectedBagEquipment();
        if (!save || !selected) {
            this.setBagMessage('请先选择一件装备。');
            return;
        }
        const replaceIndex = selected.affixes.length > 0
            ? this.bagSelectedAffixIndex
            : -1;
        const result = EquipmentForgeSystem.startReroll(
            save,
            selected.id,
            replaceIndex,
        );
        this.setBagMessage(result.message);
        this.updateBagPanel(save);
        this.updateCharacterSystemLabel(save);
        if (result.success && result.pending) {
            this.openCharacterPanel();
        }
    }

    private cultivateOnce(): void {
        if (!this.activeSave) {
            return;
        }
        const result = ProgressionSystem.cultivate(this.activeSave);
        EquipmentForgeSystem.ensureStarterEquipment(this.activeSave);
        RelationshipSystem.refresh(this.activeSave);
        if (this.mapHintLabel) {
            this.mapHintLabel.string = result.atCap
                ? '修为已圆满，静修不再继续累加，请查看当前突破目标。'
                : `静修完成：修为 +${result.cultivationGained}，灵力 +${result.spiritRecovered}。`;
        }
        this.updateRadarChart(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        if (result.atCap) {
            this.openGoalPanel(
                result.newlyCapped
                    ? '修为已达上限，新的成长目标已开启。'
                    : '当前修为已圆满，请完成目标后突破。',
            );
        }
        this.renderTutorialOverlay();
    }

    private breakthroughOnce(): void {
        if (!this.activeSave) {
            return;
        }
        const goal = ProgressionSystem.initializeGoalState(this.activeSave);
        if (!goal.atCap || !goal.canBreakthrough) {
            this.openGoalPanel(
                goal.atCap
                    ? '突破前仍有目标未完成。'
                    : `当前修为不足，还需修炼至 ${this.activeSave.cultivation.cultivationCap}。`,
            );
            return;
        }
        const success = ProgressionSystem.breakthrough(this.activeSave);
        this.mapHintLabel &&
            (this.mapHintLabel.string = success
                ? `突破成功：${this.activeSave.cultivation.realmLabel} ${this.activeSave.cultivation.stage} 层。`
                : '突破条件还没满足，请查看圆满目标。');
        this.updateRadarChart(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        this.renderTutorialOverlay();
    }

    private forgeOnce(): void {
        if (!this.activeSave) {
            return;
        }
        if (this.activeSave.forgePending) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '请先选择新词条是替换还是保留。');
            this.updateForgePendingUi(this.activeSave);
            return;
        }
        EquipmentForgeSystem.ensureStarterEquipment(this.activeSave);
        const weapon = this.activeSave.equipment.find((item) => item.equipped);
        if (!weapon) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '暂无法温养：请先获得可装备的法宝。');
            return;
        }
        const result = EquipmentForgeSystem.warm(
            this.activeSave,
            weapon.id,
        );
        this.mapHintLabel &&
            (this.mapHintLabel.string = result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
    }

    private applyForgePending(accept: boolean): void {
        if (!this.activeSave) {
            return;
        }
        const result = EquipmentForgeSystem.applyPending(
            this.activeSave,
            accept,
        );
        this.mapHintLabel &&
            (this.mapHintLabel.string = result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        if (
            result.success &&
            this.activeSave.tutorialEnabled &&
            this.activeSave.tutorialStep === 'chapter2_forge'
        ) {
            this.finishChapterGuide('chapter2');
        }
    }

    private watchCultivationAd(): void {
        if (!this.activeSave) {
            return;
        }
        const unavailable = EconomySystem.cultivationAdUnavailableReason(
            this.activeSave,
        );
        if (unavailable) {
            this.mapHintLabel && (this.mapHintLabel.string = unavailable);
            this.updateCharacterActionLabels();
            return;
        }
        this.openRewardedAction({
            placement: 'cultivation_support',
            title: '静修助益',
            body: '完整观看后，宗门阵法会在本次静修中额外引导灵气。',
            reward: '修为 +15，灵力 +20（每日最多 3 次）。',
            onComplete: () => this.claimCultivationAdReward(),
        });
    }

    private claimCultivationAdReward(): void {
        if (!this.activeSave) {
            return;
        }
        const result = EconomySystem.claimCultivationAd(this.activeSave);
        this.mapHintLabel && (this.mapHintLabel.string = result.message);
        this.updateRadarChart(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        this.updateCharacterActionLabels();
        const goal = ProgressionSystem.initializeGoalState(this.activeSave);
        if (goal.atCap) {
            this.openGoalPanel(
                result.success
                    ? '这次静修已经让修为满了，去看看下一步目标吧。'
                    : result.message,
            );
        }
    }

    private watchForgeMaterialAd(): void {
        if (!this.activeSave) {
            return;
        }
        if (this.activeSave.forgePending) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '请先处理当前淬炼结果，再领取材料。');
            this.updateForgePendingUi(this.activeSave);
            return;
        }
        const unavailable = EconomySystem.forgeMaterialAdUnavailableReason(
            this.activeSave,
        );
        if (unavailable) {
            this.mapHintLabel && (this.mapHintLabel.string = unavailable);
            this.updateCharacterActionLabels();
            return;
        }
        this.openRewardedAction({
            placement: 'forge_material_daily',
            title: '材料补给',
            body: '完整观看后，坊市会为本日温养与重淬补发一批基础材料。',
            reward: '淬炼材料 ×3（每日限 1 次）。',
            onComplete: () => this.claimForgeMaterialAdReward(),
        });
    }

    private claimForgeMaterialAdReward(): void {
        if (!this.activeSave) {
            return;
        }
        if (this.activeSave.forgePending) {
            this.mapHintLabel &&
                (this.mapHintLabel.string = '请先处理当前淬炼结果，再领取材料。');
            this.updateForgePendingUi(this.activeSave);
            return;
        }
        const result = EconomySystem.claimForgeMaterialAd(this.activeSave);
        this.mapHintLabel && (this.mapHintLabel.string = result.message);
        this.updateBagPanel(this.activeSave);
        this.updateCharacterSystemLabel(this.activeSave);
        this.updateCharacterActionLabels();
    }

    private updateCharacterActionLabels(): void {
        const save = this.activeSave;
        const goal = save
            ? ProgressionSystem.initializeGoalState(save)
            : null;
        const mainCultivateButton = this.characterLayer?.getChildByName(
            'CultivateButton',
        );
        const mainCultivateLabel = mainCultivateButton
            ?.getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (mainCultivateLabel) {
            mainCultivateLabel.string = goal?.atCap
                ? '修为已圆满'
                : '静修一次';
        }
        const mainCultivateControl = mainCultivateButton?.getComponent(Button);
        if (mainCultivateControl) {
            mainCultivateControl.interactable = Boolean(save);
        }
        const cultivationLabel = this.cultivationAdButton
            ?.getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (cultivationLabel) {
            if (!save) {
                cultivationLabel.string = '静修助益\n需先进入修行';
            } else if (goal?.atCap) {
                cultivationLabel.string = '修为已圆满\n查看突破目标';
            } else {
                EconomySystem.resetDailyLimits(save);
                const remaining = EconomySystem.cultivationAdRemaining(save);
                cultivationLabel.string = remaining > 0
                    ? `静修助益\n修为+15 灵力+20（余${remaining}）`
                    : '静修助益\n今日已用完';
            }
        }
        if (this.cultivationAdButton) {
            this.cultivationAdButton.active = Boolean(save && !goal?.atCap);
        }

        const forgeLabel = this.forgeMaterialAdButton
            ?.getChildByName('ButtonLabel')
            ?.getComponent(Label);
        if (forgeLabel && save) {
            forgeLabel.string =
                save.economy.forgeMaterialAdClaimed
                    ? '材料补给\n今日已领取'
                    : '材料补给\n淬炼材料 ×3';
        }
        if (this.forgeMaterialAdButton) {
            this.forgeMaterialAdButton.active =
                Boolean(save && SaveManager.isUnlocked(save, 'forge_system'));
        }
        this.updateForgePendingUi(save);
    }

    private updateForgePendingUi(save: LocalSave | null): void {
        const pending = save?.forgePending ?? null;
        const hasPending = Boolean(pending);
        const atCap = Boolean(
            save && ProgressionSystem.initializeGoalState(save).atCap,
        );
        if (this.forgePendingLabel) {
            this.forgePendingLabel.node.active = hasPending;
            if (pending) {
                const previous = pending.previousAffix
                    ? `替换目标：${pending.previousAffix.label} ${pending.previousAffix.tier}阶`
                    : '还没有旧词条，会直接加上第一条';
                this.forgePendingLabel.string =
                    `新结果：${pending.affix.label} ${pending.affix.tier}阶（${pending.affix.value}）\n` +
                    `${previous}。请选择是否替换。`;
            } else {
                this.forgePendingLabel.string = '';
            }
        }
        if (this.forgeAcceptButton) {
            this.forgeAcceptButton.active = hasPending;
        }
        if (this.forgeRejectButton) {
            this.forgeRejectButton.active = hasPending;
        }
        if (this.cultivationAdButton) {
            this.cultivationAdButton.active =
                Boolean(save) && !hasPending && !atCap;
        }
        if (this.forgeMaterialAdButton) {
            this.forgeMaterialAdButton.active =
                Boolean(
                    save &&
                    SaveManager.isUnlocked(save, 'forge_system') &&
                    !hasPending,
                );
        }
        const mainQuestButton = this.characterLayer?.getChildByName(
            'MainQuestFromCharacter',
        );
        if (mainQuestButton) {
            mainQuestButton.active = !hasPending;
        }
        const forgeButton = this.characterLayer?.getChildByName('ForgeButton');
        const forgeControl = forgeButton?.getComponent(Button);
        if (forgeControl) {
            forgeControl.interactable = Boolean(save) && !hasPending;
        }
    }

    private createMapLocation(
        name: string,
        assetId: string,
        label: string,
        x: number,
        y: number,
        locationText: string,
        hintText: string,
        locationId = '',
    ): void {
        if (!this.mapSceneLayer) {
            return;
        }
        const node = new Node(name);
        this.mapSceneLayer.addChild(node);
        this.mapLocationNodes.push(node);
        node.addComponent(UITransform).setContentSize(76, 74);
        node.setPosition(x, y, 0);
        node.addComponent(Button);
        node.on(
            Node.EventType.TOUCH_END,
            () => {
                if (this.mapDragMoved) {
                    this.mapDragMoved = false;
                    return;
                }
                if (!this.acceptTap()) {
                    return;
                }
                this.moveMapPlayerTo(x, y, locationText, hintText, locationId);
            },
            this,
        );

        const icon = this.createSprite(node, `${name}Icon`, 42, 42, 0, 13);
        this.loadMapAsset(assetId, icon);
        this.createLabel(
            node,
            `${name}Label`,
            label,
            12,
            76,
            20,
            0,
            -22,
            COLORS.ink,
        );
    }

    private createQuestMarker(
        parent: Node,
        name: string,
        assetId: string,
        x: number,
        y: number,
    ): void {
        const marker = this.createSprite(parent, name, 30, 30, x, y);
        this.loadMapAsset(assetId, marker);
    }

    private moveMapPlayerTo(
        x: number,
        y: number,
        locationText: string,
        hintText: string,
        locationId = '',
    ): void {
        if (!this.mapPlayerSprite) {
            return;
        }
        const current = this.mapPlayerSprite.node.position;
        this.mapMoveStartX = current.x;
        this.mapMoveStartY = current.y;
        this.mapMoveTargetX = x;
        this.mapMoveTargetY = y;
        this.mapDestinationLocation = locationId;
        this.mapMoveElapsed = 0;
        this.mapMoveDuration = 0.75;
        this.mapPlayerFrameElapsed = 0;
        this.mapPlayerFrameIndex = 0;
        const dx = x - current.x;
        const dy = y - current.y;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        this.mapMoveRow = horizontal ? 1 : dy > 0 ? 3 : 0;
        this.mapPlayerSprite.node.setScale(horizontal && dx > 0 ? -1 : 1, 1, 1);
        this.mapPlayerMoving = true;
        this.applyMapPlayerFrame();
        this.mapLocationLabel && (this.mapLocationLabel.string = locationText);
        this.mapHintLabel && (this.mapHintLabel.string = hintText);
    }

    private loadMapBackground(): void {
        const requestId = ++this.mapBackgroundRequestId;
        if (!this.mapBackgroundSprite) {
            return;
        }
        // 地图和剧情背景是两套资源。切回地图时先清掉上一幕的剧情底图，
        // 避免地图资源加载期间残留旧场景，或加载失败时误显示剧情画面。
        if (this.backgroundSprite) {
            this.backgroundSprite.node.active = false;
            this.backgroundSprite.spriteFrame = null;
        }
        this.mapBackgroundSprite.node.active = false;
        this.mapBackgroundSprite.spriteFrame = null;
        const region = GameContentRegistry.region(this.activeRegionId);
        const assetId = region?.backgroundAsset ?? 'bg_outer_courtyard_move';
        const bundleId = region?.backgroundBundle;
        this.loadSpriteFrame(
            assetId,
            bundleId,
            (frame) => {
                if (
                    requestId !== this.mapBackgroundRequestId ||
                    !this.mapBackgroundSprite
                ) {
                    return;
                }
                this.mapBackgroundSprite.spriteFrame = frame;
                this.mapBackgroundSprite.node.active = true;
            },
        );
    }

    private loadMapPlayer(): void {
        const requestId = ++this.mapPlayerRequestId;
        if (!this.mapPlayerSprite) {
            return;
        }
        resources.load('art/player_walk_4dir', Texture2D, (error, texture) => {
            if (
                error ||
                !texture ||
                requestId !== this.mapPlayerRequestId ||
                !this.mapPlayerSprite
            ) {
                return;
            }
            this.mapPlayerFrames = [];
            for (let row = 0; row < 4; row += 1) {
                for (let column = 0; column < 4; column += 1) {
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    frame.rect = new Rect(
                        column * 128,
                        (3 - row) * 128,
                        128,
                        128,
                    );
                    this.mapPlayerFrames.push(frame);
                }
            }
            this.mapPlayerSprite.node.active = true;
            this.applyMapPlayerFrame();
        });
    }

    private applyMapPlayerFrame(): void {
        if (!this.mapPlayerSprite || this.mapPlayerFrames.length === 0) {
            return;
        }
        this.mapPlayerSprite.spriteFrame =
            this.mapPlayerFrames[this.mapMoveRow * 4 + this.mapPlayerFrameIndex];
    }

    private loadMapAsset(assetId: string, target: Sprite): void {
        resources.load(`art/${assetId}`, SpriteFrame, (error, frame) => {
            if (error || !frame || !target) {
                return;
            }
            target.spriteFrame = frame;
            target.node.active = true;
        });
    }

    private loadUiAsset(assetId: string, target: Sprite): void {
        this.loadMapAsset(assetId, target);
    }

    private updateRadarChart(save: LocalSave): void {
        if (!this.radarGraphics) {
            return;
        }
        const root = save.spiritual_root;
        const days = Number(save.flags.cultivation_days ?? 0);
        const spirit = root?.scores[root.primary] ?? 35;
        const secondary = root?.secondary
            ? root.scores[root.secondary]
            : spirit - 8;
        const gradeBonus =
            root?.grade === 'heaven'
                ? 28
                : root?.grade === 'earth'
                  ? 18
                  : root?.grade === 'true'
                    ? 10
                    : 0;
        const values = [
            Math.min(96, 42 + days * 2 + gradeBonus),
            Math.min(96, spirit),
            Math.min(96, 46 + secondary / 2 + days),
            Math.min(96, 48 + days * 2),
            Math.min(96, 40 + spirit / 2 + gradeBonus / 2),
            Math.min(96, 38 + gradeBonus + days),
        ];
        const labels = ['攻击', '灵力', '防御', '心境', '洞察', '气运'];
        const centerX = 0;
        const centerY = 0;
        const radius = 82;
        const sides = values.length;
        const point = (index: number, scale: number): [number, number] => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sides;
            return [
                centerX + Math.cos(angle) * radius * scale,
                centerY + Math.sin(angle) * radius * scale,
            ];
        };

        const graphics = this.radarGraphics;
        graphics.clear();
        graphics.lineWidth = 1;
        graphics.strokeColor = new Color(163, 177, 174, 145);
        graphics.fillColor = new Color(84, 174, 143, 85);
        for (let ring = 1; ring <= 4; ring += 1) {
            graphics.circle(centerX, centerY, radius * ring / 4);
            graphics.stroke();
        }
        for (let index = 0; index < sides; index += 1) {
            const edge = point(index, 1);
            graphics.moveTo(centerX, centerY);
            graphics.lineTo(edge[0], edge[1]);
            graphics.stroke();
        }

        const firstValue = point(0, values[0] / 100);
        graphics.moveTo(firstValue[0], firstValue[1]);
        for (let index = 1; index < sides; index += 1) {
            const valuePoint = point(index, values[index] / 100);
            graphics.lineTo(valuePoint[0], valuePoint[1]);
        }
        graphics.close();
        graphics.fill();
        graphics.stroke();

        this.radarValueLabel &&
            (this.radarValueLabel.string = labels
                .map((label, index) => `${label} ${Math.round(values[index])}`)
                .join('  ·  '));
    }

    private renderText(node: StoryNode): void {
        if (!this.speakerLabel || !this.bodyLabel || !this.promptLabel) {
            return;
        }

        this.hideRewardItem();
        this.hideBattleEnemy();
        this.loadPortrait(node.portrait ?? '', node.position ?? 'right');
        this.loadStoryItemAsset(
            typeof node.item_art === 'string' ? node.item_art : '',
            typeof node.item_bundle === 'string'
                ? (node.item_bundle as MapBundleId)
                : undefined,
        );
        this.speakerLabel.string = node.type === 'say' ? node.speaker ?? '未知角色' : '旁白';
        this.bodyLabel.color = COLORS.ink;
        this.bodyLabel.string = node.text ?? '';
        this.promptLabel.string = '';
        this.layoutStoryText(false, node.position ?? 'right');
    }

    private renderChoices(node: StoryNode): void {
        if (!this.choiceLayer || !this.promptLabel) {
            return;
        }

        this.promptLabel.string = node.prompt ?? '请选择行动';
        this.choiceLayer.active = true;
        const options = node.options ?? [];
        const startY = -188;
        options.forEach((option, index) => {
            this.createButton(
                this.choiceLayer as Node,
                `Choice_${option.id}`,
                option.text,
                0,
                startY - index * 60,
                CONTENT_WIDTH,
                54,
                index % 2 === 0 ? COLORS.panelAlt : COLORS.ember,
                () => this.engine?.choose(option.id),
            );
        });
    }

    private renderBattle(node: StoryNode, save: LocalSave): void {
        this.hidePortrait();
        this.hideRewardItem();
        this.loadBattleEnemy(node);
        this.speakerLabel && (this.speakerLabel.string = node.speaker ?? '战斗对手');
        this.bodyLabel && (this.bodyLabel.string = '');
        this.layoutStoryText(false, 'right');
        this.beginBattle(
            save,
            node.stage_id ?? '',
            `主线战斗 · ${node.speaker ?? '战斗对手'}`,
            (victory) => this.engine?.battleResult(victory),
        );
    }

    private startExternalBattle(
        profileId: string,
        title: string,
        onFinish: (victory: boolean, state: BattleState) => void,
    ): void {
        const save = this.activeSave;
        if (!save) {
            return;
        }
        this.hideActionLayers();
        this.hidePortrait();
        this.hideRewardItem();
        this.hideBattleEnemy();
        this.speakerLabel && (this.speakerLabel.string = title);
        this.bodyLabel && (this.bodyLabel.string = '');
        this.layoutStoryText(false, 'right');
        this.beginBattle(save, profileId, title, onFinish);
    }

    private beginBattle(
        save: LocalSave,
        profileId: string,
        title: string,
        onFinish: (victory: boolean, state: BattleState) => void,
    ): void {
        if (
            !this.battleLayer ||
            !this.battleStageLabel ||
            !this.battleHpLabel ||
            !this.battleManaLabel
        ) {
            return;
        }
        this.clearBattleDynamicChildren();
        const gardenInsight = EconomySystem.consumeGardenInsight(save);
        this.battleState = BattleSystem.create(save, profileId, gardenInsight);
        this.battleFinishHandler = onFinish;
        this.battleLayer.active = true;
        this.battleLayer.setSiblingIndex(
            Math.max(0, (this.root?.children.length ?? 1) - 1),
        );
        this.battleStageLabel.string = title;
        const firstBattleBrief = !save.tutorialBattleBriefSeen;
        if (firstBattleBrief) {
            save.tutorialBattleBriefSeen = true;
            SaveManager.save(save);
        }
        if (this.promptLabel) {
            this.promptLabel.string = this.battleState.tutorialBattle
                ? '首战只记住三件事：蓄势时护体，敌方结界时洞察，灵力少了回气。前三回合伤害会减轻。'
                : firstBattleBrief
                ? '观察敌方意图：洞察可准备破势，护体最多维持两次敌方行动，回气会消耗一个回合。'
                : '敌方意图会在每个回合开始时显示。';
        }
        this.updateBattleLabels();
        const actions: Array<{
            id: string;
            label: string;
            action: BattleAction;
            color: Color;
            x: number;
        }> = [
            {
                id: 'AttackButton',
                label: '攻击',
                action: 'attack',
                color: COLORS.jade,
                x: -132,
            },
            {
                id: 'InsightButton',
                label: `洞察\n${BATTLE_RULES.insightCost}灵力`,
                action: 'insight',
                color: COLORS.ember,
                x: -44,
            },
            {
                id: 'GuardButton',
                label: `护体\n${BATTLE_RULES.guardCost}灵力`,
                action: 'guard',
                color: COLORS.panelAlt,
                x: 44,
            },
            {
                id: 'RecoverButton',
                label: `回气\n+${this.battleState.playerRecovery}灵力`,
                action: 'recover',
                color: COLORS.panelAlt,
                x: 132,
            },
        ];
        actions.forEach((item) => {
            const button = this.createButton(
                this.battleLayer as Node,
                item.id,
                item.label,
                item.x,
                -112,
                78,
                50,
                item.color,
                () => this.executeBattleAction(item.action),
            );
            this.setButtonLabelStyle(button, 12, 16);
        });
        this.updateBattleActionAvailability();
    }

    private executeBattleAction(action: BattleAction): void {
        const state = this.battleState;
        if (!state) {
            return;
        }
        const result = BattleSystem.act(state, action);
        this.updateBattleLabels();
        if (this.promptLabel) {
            const latestLog = state.log[state.log.length - 1] ?? result.message;
            this.promptLabel.string = result.accepted
                ? latestLog
                : result.message;
        }
        if (result.outcome === 'ongoing') {
            return;
        }

        const victory = result.outcome === 'victory';
        if (this.promptLabel) {
            this.promptLabel.string = victory
                ? `${state.enemyName}已溃散，点击结算继续。`
                : `战斗失败。${BattleSystem.failureAdvice(state).join(' ')}`;
        }
        this.clearBattleDynamicChildren();
        this.createButton(
            this.battleLayer as Node,
            'BattleReplayButton',
            '查看战报',
            -90,
            -112,
            152,
            50,
            COLORS.panelAlt,
            () => this.showBattleReplay(state),
        );
        this.createButton(
            this.battleLayer as Node,
            'BattleFinishButton',
            victory ? '结算胜利' : '返回调整',
            90,
            -112,
            152,
            50,
            victory ? COLORS.jade : COLORS.ember,
            () => this.finishCurrentBattle(victory),
        );
    }

    private showBattleReplay(state: BattleState): void {
        if (!this.promptLabel) {
            return;
        }
        const lines = BattleSystem.replayLines(state);
        const failureTags = BattleSystem.failureTags(state);
        this.promptLabel.string = [
            '战报',
            ...lines.slice(-3),
            failureTags.length ? `复盘标签：${failureTags.join('、')}` : '',
        ].filter(Boolean).join('\n');
    }

    private finishCurrentBattle(victory: boolean): void {
        const handler = this.battleFinishHandler;
        const state = this.battleState;
        let forgeRecommendation: ForgeRecommendation | null = null;
        if (state && this.activeSave) {
            BattleSystem.recordResult(this.activeSave, state);
            if (!victory) {
                forgeRecommendation = EquipmentForgeSystem.recommendOnce(
                    this.activeSave,
                    'battle_defeat',
                    { failureTags: BattleSystem.failureTags(state) },
                );
                this.pendingForgeRecommendation =
                    forgeRecommendation ?? this.pendingForgeRecommendation;
            }
            SaveManager.save(this.activeSave);
        }
        this.battleState = null;
        this.battleFinishHandler = null;
        if (this.battleLayer) {
            this.battleLayer.active = false;
            this.clearBattleDynamicChildren();
        }
        if (handler && state) {
            handler(victory, state);
        }
        if (forgeRecommendation && this.mapHintLabel) {
            this.mapHintLabel.string =
                `${forgeRecommendation.message} 已在背包中定位对应装备。`;
        }
    }

    private clearBattleDynamicChildren(): void {
        if (!this.battleLayer) {
            return;
        }
        this.clearDynamicChildren(this.battleLayer, [
            this.battleStageLabel?.node,
            this.battleHpLabel?.node,
            this.battlePlayerHpLabel?.node,
            this.battleManaLabel?.node,
            this.battleEnemySprite?.node,
            this.battleEnemyIntentLabel?.node,
            this.battleEnemyStatusLabel?.node,
        ]);
    }

    private updateBattleLabels(): void {
        const state = this.battleState;
        if (!state) {
            return;
        }
        if (this.battleStageLabel) {
            this.battleStageLabel.string = `第 ${state.round} 回合`;
        }
        if (this.battleEnemyIntentLabel) {
            this.battleEnemyIntentLabel.string =
                `即将行动：${BattleSystem.intentLabel(BattleSystem.currentIntent(state))}`;
        }
        if (this.battleEnemyStatusLabel) {
            const status = [
                state.enemyBarrier > 0
                    ? `结界 ${state.enemyBarrier}`
                    : '',
                state.weakPointReady
                    ? '破势就绪'
                    : state.obscuredTurns > 0
                      ? `迷障 ${state.obscuredTurns}`
                      : '',
                state.temporaryInsight > 0
                    ? `药圃洞察 +${state.temporaryInsight}`
                    : '',
            ].filter(Boolean).join(' · ');
            this.battleEnemyStatusLabel.string = status || '敌方机制等待触发';
        }
        if (this.battleHpLabel) {
            this.battleHpLabel.string =
                `${state.enemyName}：${state.enemyHp} / ${state.enemyMaxHp}` +
                (state.enemyBarrier > 0
                    ? `  ·  结界 ${state.enemyBarrier}`
                    : '');
        }
        if (this.battlePlayerHpLabel) {
            this.battlePlayerHpLabel.string =
                `我方气血：${state.playerHp} / ${state.playerMaxHp}` +
                (state.playerShield > 0
                    ? `  ·  护盾 ${state.playerShield}（余 ${state.shieldTurns} 次）`
                    : '');
        }
        if (this.battleManaLabel) {
            this.battleManaLabel.string =
                `战斗灵力：${state.playerMana} / ${state.playerMaxMana}  ·  回气 +${state.playerRecovery}` +
                (state.guardCooldown > 0
                    ? `  ·  护体冷却 ${state.guardCooldown}`
                    : '  ·  护体可用');
        }
        this.updateBattleActionAvailability();
    }

    private updateBattleActionAvailability(): void {
        const state = this.battleState;
        if (!state || !this.battleLayer) {
            return;
        }
        const ongoing = state.outcome === 'ongoing';
        const availability: Array<[string, boolean]> = [
            ['AttackButton', ongoing],
            [
                'InsightButton',
                ongoing && state.playerMana >= BATTLE_RULES.insightCost,
            ],
            [
                'GuardButton',
                ongoing &&
                    state.playerMana >= BATTLE_RULES.guardCost &&
                    state.guardCooldown === 0,
            ],
            ['RecoverButton', ongoing],
        ];
        availability.forEach(([name, enabled]) => {
            const button = this.battleLayer
                ?.getChildByName(name)
                ?.getComponent(Button);
            if (!button) {
                return;
            }
            button.interactable = enabled;
            const label = button.node
                .getChildByName('ButtonLabel')
                ?.getComponent(Label);
            if (label) {
                label.color = enabled ? COLORS.ink : COLORS.muted;
            }
        });
    }

    private renderReward(node: StoryNode): void {
        if (!this.speakerLabel || !this.bodyLabel || !this.promptLabel) {
            return;
        }

        this.hidePortrait();
        this.hideBattleEnemy();
        const rewardItemId = node.items?.[0]?.id;
        const rewardAssetId =
            rewardItemId === 'old_iron_sword'
                ? 'item_old_iron_sword'
                : rewardItemId === 'nameless_ledger_fragment'
                  ? 'item_nameless_ledger_fragment'
                  : rewardItemId === 'lamp_copper_shard'
                    ? 'item_lamp_copper_shard'
                    : rewardItemId === 'hui_qi_powder'
                      ? 'item_hui_qi_powder'
                      : rewardItemId === 'herb_garden_note'
                        ? 'item_herb_garden_note'
                : rewardItemId === 'gray_badge'
                  ? 'icon_map_gate'
                  : rewardItemId === 'qi_gathering_manual'
                    ? 'icon_map_library'
                    : '';
        this.loadStoryItemAsset(
            rewardAssetId,
            typeof node.item_bundle === 'string'
                ? (node.item_bundle as MapBundleId)
                : rewardItemId?.includes('nameless') ||
                    rewardItemId?.includes('lamp_') ||
                    rewardItemId?.includes('hui_') ||
                    rewardItemId?.includes('herb_')
                  ? 'common_items'
                  : undefined,
        );
        this.layoutRewardText();
        this.speakerLabel.string = '奖励结算';
        const lines = (node.items ?? []).map((item: StoryItem) => {
            const name =
                ITEM_DEFINITIONS[item.id]?.name ??
                EQUIPMENT_TEMPLATES[item.id]?.name ??
                item.id;
            return `${name} ×${item.count}`;
        });
        this.bodyLabel.string = lines.length > 0
            ? lines.join('\n')
            : '这里暂时没有奖励';
        this.promptLabel.string =
            '结算会记进存档；装备去背包里穿戴，凭证会自动检查。';
    }

    private openRewardedAction(action: RewardedAction): void {
        if (this.adBusy) {
            return;
        }
        this.activeRewardedAction = action;
        this.adError = '';
        this.renderRewardedAction();
    }

    private renderRewardedAction(): void {
        if (!this.adLayer || !this.activeRewardedAction) {
            return;
        }

        const action = this.activeRewardedAction;
        this.adLayer.active = true;
        this.adLayer.setSiblingIndex(this.root ? this.root.children.length - 1 : 0);
        this.adLayer.removeAllChildren();
        this.createPanel(
            this.adLayer,
            'RewardedActionBackdrop',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            new Color(7, 17, 24, 248),
        );
        this.createPanel(
            this.adLayer,
            'RewardedActionPanel',
            CONTENT_WIDTH,
            390,
            0,
            36,
            COLORS.panel,
        );
        this.createLabel(
            this.adLayer,
            'RewardedActionTitle',
            action.title,
            22,
            CONTENT_WIDTH - 32,
            36,
            0,
            190,
            COLORS.ink,
        );
        const body = this.createLabel(
            this.adLayer,
            'RewardedActionBody',
            action.body,
            16,
            CONTENT_WIDTH - 42,
            78,
            0,
            116,
            COLORS.ink,
        );
        body.enableWrapText = true;
        const reward = this.createLabel(
            this.adLayer,
            'RewardedActionReward',
            `观看奖励：${action.reward}`,
            14,
            CONTENT_WIDTH - 42,
            72,
            0,
            34,
            COLORS.jade,
        );
        reward.enableWrapText = true;
        const prompt = this.createLabel(
            this.adLayer,
            'RewardedActionPrompt',
            this.adBusy
                ? '广告加载中，请勿重复点击……'
                : this.adError
                  ? `${this.adError} 可重试或跳过。`
                  : RewardedAdService.hasProvider()
                    ? '完整观看广告后领取奖励。'
                    : '广告还没准备好，请稍后再试。',
            14,
            CONTENT_WIDTH - 42,
            70,
            0,
            -50,
            this.adError ? COLORS.danger : COLORS.muted,
        );
        prompt.enableWrapText = true;

        const acceptButton = this.createButton(
            this.adLayer,
            'RewardedActionAccept',
            '观看并领取',
            -84,
            -150,
            160,
            52,
            COLORS.ember,
            () => {
                void this.acceptRewardedAction();
            },
        );
        const skipButton = this.createButton(
            this.adLayer,
            'RewardedActionSkip',
            '暂不观看',
            84,
            -150,
            140,
            52,
            COLORS.panelAlt,
            () => this.skipRewardedAction(),
        );
        const acceptControl = acceptButton.getComponent(Button);
        const skipControl = skipButton.getComponent(Button);
        if (acceptControl) {
            acceptControl.interactable =
                !this.adBusy && RewardedAdService.hasProvider();
        }
        if (skipControl) {
            skipControl.interactable = !this.adBusy;
        }
    }

    private async acceptRewardedAction(): Promise<void> {
        const action = this.activeRewardedAction;
        if (!action || this.adBusy) {
            return;
        }

        this.adBusy = true;
        this.adError = '';
        this.renderRewardedAction();
        let result;
        try {
            result = await RewardedAdService.showRewarded(action.placement);
        } catch (error) {
            result = {
                completed: false,
                reason: 'failed' as const,
                error,
            };
        }

        if (this.activeRewardedAction !== action) {
            this.adBusy = false;
            return;
        }
        this.adBusy = false;
        if (result.completed) {
            this.activeRewardedAction = null;
            this.adError = '';
            if (this.adLayer) {
                this.adLayer.active = false;
                this.adLayer.removeAllChildren();
            }
            await action.onComplete();
            if (
                action.placement !== 'cultivation_support' &&
                action.placement !== 'forge_material_daily' &&
                action.placement !== 'commission_reward_double' &&
                action.placement !== 'garden_instant_care' &&
                action.placement !== 'companion_favor_settlement' &&
                action.placement !== 'breakthrough_failure_refund' &&
                action.placement !== 'breakthrough_failure_preserve' &&
                action.placement !== 'summon_current_pools_unlock'
            ) {
                this.recordAdResult(action.placement, 'success', true);
            }
            return;
        }

        this.recordAdResult(
            action.placement,
            result.reason ?? 'failed',
            false,
        );
        this.adError =
            result.reason === 'timeout'
                ? '广告加载超时。'
                : result.message ?? '广告加载失败。';
        this.renderRewardedAction();
    }

    private skipRewardedAction(): void {
        if (this.adBusy) {
            return;
        }
        const placement = this.activeRewardedAction?.placement;
        if (placement) {
            this.recordAdResult(placement, 'skipped', false);
        }
        this.activeRewardedAction = null;
        this.adError = '';
        if (this.adLayer) {
            this.adLayer.active = false;
            this.adLayer.removeAllChildren();
        }
    }

    private renderAd(node: StoryNode): void {
        if (!this.adLayer || !this.bodyLabel || !this.promptLabel) {
            return;
        }

        if (this.activeAdNode !== node && !this.adBusy) {
            this.adError = '';
        }
        this.activeAdNode = node;
        this.hidePortrait();
        this.hideBattleEnemy();
        this.hideRewardItem();
        this.layoutStoryText(false, 'right');
        this.adLayer.active = true;
        this.adLayer.setSiblingIndex(this.root ? this.root.children.length - 1 : 0);
        this.adLayer.removeAllChildren();
        this.createPanel(
            this.adLayer,
            'StoryAdBackdrop',
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            0,
            0,
            new Color(7, 17, 24, 248),
        );
        this.createPanel(
            this.adLayer,
            'StoryAdPanel',
            CONTENT_WIDTH,
            390,
            0,
            36,
            COLORS.panel,
        );
        this.createLabel(
            this.adLayer,
            'StoryAdTitle',
            '广告入口',
            22,
            CONTENT_WIDTH - 32,
            36,
            0,
            190,
            COLORS.ink,
        );
        const body = this.createLabel(
            this.adLayer,
            'StoryAdBody',
            node.dialogue_before ?? '你可以选择观看广告。',
            16,
            CONTENT_WIDTH - 42,
            86,
            0,
            112,
            COLORS.ink,
        );
        body.enableWrapText = true;
        const rewardText =
            node.ad_reward_text ??
            (node.ad_type === 'double_reward'
                ? '完整观看后额外获得一份结算奖励。'
                : '完整观看后获得一次战斗复起机会。');
        const providerText = RewardedAdService.hasProvider()
            ? rewardText
            : `${rewardText} 广告还没准备好，请稍后再试。`;
        const prompt = this.createLabel(
            this.adLayer,
            'StoryAdPrompt',
            this.adBusy
                ? '广告加载中，请勿重复点击……'
                : this.adError
                  ? `${this.adError} 可重试或跳过。`
                  : providerText,
            14,
            CONTENT_WIDTH - 42,
            82,
            0,
            30,
            this.adError ? COLORS.danger : COLORS.muted,
        );
        prompt.enableWrapText = true;

        const acceptButton = this.createButton(
            this.adLayer,
            'AcceptAdButton',
            '看广告并领取',
            -84,
            -170,
            160,
            54,
            COLORS.ember,
            () => {
                void this.acceptAd(node);
            },
        );
        const skipButton = this.createButton(
            this.adLayer,
            'SkipAdButton',
            '跳过',
            84,
            -170,
            140,
            54,
            COLORS.panelAlt,
            () => {
                if (!this.adBusy) {
                    this.recordAdResult(
                        node.ad_placement ?? node.ad_type ?? 'generic',
                        'skipped',
                        false,
                    );
                    this.activeAdNode = null;
                    this.engine?.skipAd();
                }
            },
        );
        const acceptControl = acceptButton.getComponent(Button);
        const skipControl = skipButton.getComponent(Button);
        if (acceptControl) {
            acceptControl.interactable =
                !this.adBusy && RewardedAdService.hasProvider();
        }
        if (skipControl) {
            skipControl.interactable = !this.adBusy;
        }
    }

    private async acceptAd(node: StoryNode): Promise<void> {
        if (this.adBusy || this.activeAdNode !== node) {
            return;
        }

        this.adBusy = true;
        this.adError = '';
        this.renderAd(node);
        let result;
        try {
            result = await RewardedAdService.showRewarded(
                node.ad_placement ?? node.ad_type ?? 'generic',
            );
        } catch (error) {
            result = {
                completed: false,
                reason: 'failed' as const,
                error,
            };
        }
        this.adBusy = false;

        if (result.completed) {
            this.activeAdNode = null;
            this.recordAdResult(
                node.ad_placement ?? node.ad_type ?? 'generic',
                'success',
                true,
            );
            this.engine?.acceptAd();
            return;
        }

        this.recordAdResult(
            node.ad_placement ?? node.ad_type ?? 'generic',
            result.reason ?? 'failed',
            false,
        );
        this.adError =
            result.reason === 'timeout'
                ? '广告加载超时。'
                : result.message ?? '广告加载失败。';
        this.renderAd(node);
    }

    private recordAdResult(
        placement: string,
        outcome: string,
        rewardGranted: boolean,
    ): void {
        if (!this.activeSave) {
            return;
        }
        TelemetryService.record(this.activeSave, 'ad_result', {
            placement,
            outcome,
            rewardGranted,
        });
        SaveManager.save(this.activeSave);
    }

    private renderEnd(node: StoryNode): void {
        if (!this.speakerLabel || !this.bodyLabel || !this.promptLabel) {
            return;
        }

        this.hidePortrait();
        this.hideBattleEnemy();
        this.hideRewardItem();
        this.layoutStoryText(false, 'right');
        this.speakerLabel.string = '章节完成';
        this.bodyLabel.string = node.text ?? '第 1 章完成。';
        this.promptLabel.string = `已解锁：${(node.unlock ?? []).join('、') || '暂无'}`;
        this.showContinue(() => {
            if (this.storyStartedFromMap) {
                this.storyStartedFromMap = false;
                if (this.activeSave && this.activeChapter) {
                    this.renderMapHub(this.activeSave, this.activeChapter);
                    this.startPendingChapterGuide(this.activeSave);
                }
                return;
            }
            this.engine?.restart();
        });
        if (this.continueButton) {
            const label = this.continueButton.getChildByName('ButtonLabel')?.getComponent(Label);
            if (label) {
                label.string = this.storyStartedFromMap ? '返回地图' : '重新体验';
            }
        }
    }

    private updateStatus(save: LocalSave, chapter: ChapterData): void {
        if (this.chapterLabel) {
            this.chapterLabel.string = `${chapter.title}  |  离线修行`;
        }
        if (this.statusLabel) {
            const spirit = save.flags.ling_shi ?? save.inventory.ling_shi ?? 0;
            const favor = save.flags.su_wan_chao_favor ?? 0;
            const root = save.spiritual_root;
            const rootText = root
                ? `${root.grade_label}/${SpiritualRootSystem.elementLabel(root.primary)}`
                : '灵根待定';
            this.statusLabel.string = `灵根${rootText}  灵石${spirit}  好感${favor}`;
        }
    }

    private showContinue(callback: () => void): void {
        if (!this.continueButton) {
            return;
        }
        this.continueButton.active = true;
        this.continueHandler = callback;
        const label = this.continueButton.getChildByName('ButtonLabel')?.getComponent(Label);
        if (label) {
            label.string = '继续';
        }
    }

    private hideActionLayers(): void {
        this.hideTutorialOverlay();
        if (this.mapLayer) {
            this.mapLayer.active = false;
        }
        if (this.characterLayer) {
            this.characterLayer.active = false;
        }
        if (this.bagLayer) {
            this.bagLayer.active = false;
        }
        if (this.activityLayer) {
            this.activityLayer.active = false;
            this.activityLayer.removeAllChildren();
        }
        if (this.worldMapLayer) {
            this.worldMapLayer.active = false;
        }
        if (this.eventPromptLayer) {
            this.eventPromptLayer.active = false;
        }
        if (this.settingsLayer) {
            this.settingsLayer.active = false;
        }
        if (this.continueButton) {
            this.continueButton.active = false;
        }
        this.continueHandler = null;
        if (this.choiceLayer) {
            this.choiceLayer.active = false;
            this.choiceLayer.removeAllChildren();
        }
        if (this.battleLayer) {
            this.battleLayer.active = false;
            this.clearBattleDynamicChildren();
        }
        this.battleState = null;
        this.battleFinishHandler = null;
        if (this.adLayer) {
            this.adLayer.active = false;
            this.adLayer.removeAllChildren();
        }
        this.activeAdNode = null;
        this.activeRewardedAction = null;
        if (this.rootLayer) {
            this.rootLayer.active = false;
        }
        this.hideVisuals();
    }

    private hideVisuals(): void {
        this.hidePortrait();
        this.hideBattleEnemy();
        this.hideRewardItem();
    }

    private hidePortrait(): void {
        if (this.portraitSprite) {
            this.portraitSprite.node.active = false;
            this.portraitSprite.spriteFrame = null;
        }
    }

    private hideBattleEnemy(): void {
        if (this.battleEnemySprite) {
            this.battleEnemySprite.node.active = false;
            this.battleEnemySprite.spriteFrame = null;
        }
    }

    private hideRewardItem(): void {
        if (this.rewardItemSprite) {
            this.rewardItemSprite.node.active = false;
            this.rewardItemSprite.spriteFrame = null;
        }
    }

    private clearDynamicChildren(parent: Node, keep: Array<Node | undefined>): void {
        const keepSet = new Set(keep.filter((node): node is Node => Boolean(node)));
        for (const child of [...parent.children]) {
            if (!keepSet.has(child)) {
                child.destroy();
            }
        }
    }

    private loadBackground(assetId: string): void {
        const requestId = ++this.backgroundRequestId;
        if (!this.backgroundSprite) {
            return;
        }

        this.backgroundSprite.node.active = false;
        this.backgroundSprite.spriteFrame = null;
        if (!assetId) {
            return;
        }

        // This loader is reserved for story/battle scenes. Map screens use
        // loadMapBackground() so action-map art never becomes a story backdrop.
        const isActionMapBackground = assetId.includes('_action_map_v2');
        const resolvedAssetId = isActionMapBackground
            ? STORY_BACKGROUND_FALLBACK
            : assetId;
        const bundleId = isActionMapBackground
            ? undefined
            : this.activeChapter?.background_bundle as
            | MapBundleId
            | undefined;
        this.loadSpriteFrame(
            resolvedAssetId,
            bundleId,
            (frame) => {
                if (
                    requestId !== this.backgroundRequestId ||
                    !this.backgroundSprite
                ) {
                    return;
                }
                this.backgroundSprite.spriteFrame = frame;
                this.backgroundSprite.node.active = true;
            },
        );
    }

    private loadPortrait(assetId: string, position: string): void {
        const requestId = ++this.portraitRequestId;
        this.hidePortrait();
        if (!assetId || !this.portraitSprite) {
            return;
        }

        resources.load(`art/${assetId}`, SpriteFrame, (error, frame) => {
            if (
                requestId !== this.portraitRequestId ||
                error ||
                !frame ||
                !this.portraitSprite
            ) {
                return;
            }
            this.portraitSprite.spriteFrame = frame;
            this.portraitSprite.node.active = true;
            this.layoutStoryText(true, position);
        });
    }

    private loadBattleEnemy(node: StoryNode): void {
        const requestId = ++this.battleRequestId;
        this.hideBattleEnemy();
        if (!this.battleEnemySprite) {
            return;
        }

        const assetId =
            typeof node.enemy_art === 'string' && node.enemy_art
                ? node.enemy_art
                : node.stage_id?.includes('wooden')
                  ? 'enemy_wooden_puppet_basic'
                  : '';
        if (!assetId) {
            return;
        }
        const bundleId = typeof node.enemy_bundle === 'string'
            ? (node.enemy_bundle as MapBundleId)
            : undefined;
        this.loadSpriteFrame(
            assetId,
            bundleId,
            (frame) => {
                if (
                    requestId !== this.battleRequestId ||
                    !this.battleEnemySprite
                ) {
                    return;
                }
                this.battleEnemySprite.spriteFrame = frame;
                this.battleEnemySprite.node.active = true;
            },
        );
    }

    private loadStoryItemAsset(
        assetId: string,
        bundleId?: MapBundleId,
    ): void {
        const requestId = ++this.rewardRequestId;
        this.hideRewardItem();
        if (!this.rewardItemSprite) {
            return;
        }
        if (!assetId) {
            return;
        }

        this.loadSpriteFrame(
            assetId,
            bundleId,
            (frame) => {
                if (
                    requestId !== this.rewardRequestId ||
                    !this.rewardItemSprite
                ) {
                    return;
                }
                this.rewardItemSprite.spriteFrame = frame;
                this.rewardItemSprite.node.active = true;
            },
        );
    }

    private loadSpriteFrame(
        assetId: string,
        bundleId: MapBundleId | undefined,
        onLoaded: (frame: SpriteFrame) => void,
    ): void {
        const path = `art/${assetId}`;
        if (!bundleId) {
            resources.load(path, SpriteFrame, (error, frame) => {
                if (!error && frame) {
                    onLoaded(frame);
                }
            });
            return;
        }

        void MapBundleManager.load(bundleId)
            .then((bundle) => MapBundleManager.loadAsset(
                bundle,
                path,
                SpriteFrame,
            ))
            .then(onLoaded)
            .catch(() => {
                // Keep development builds usable while a generated bundle is
                // still being copied into the project.
                resources.load(path, SpriteFrame, (error, frame) => {
                    if (!error && frame) {
                        onLoaded(frame);
                    }
                });
            });
    }

    private layoutStoryText(hasPortrait: boolean, position: string): void {
        if (!this.speakerLabel || !this.bodyLabel || !this.promptLabel) {
            return;
        }

        const speakerTransform = this.speakerLabel.node.getComponent(UITransform);
        const bodyTransform = this.bodyLabel.node.getComponent(UITransform);
        const promptTransform = this.promptLabel.node.getComponent(UITransform);
        if (!speakerTransform || !bodyTransform || !promptTransform) {
            return;
        }

        if (hasPortrait) {
            // Keep the portrait attached to the dialogue panel instead of
            // competing with the text in a side-by-side layout.
            this.portraitSprite?.node.setPosition(0, 360, 0);
            speakerTransform.setContentSize(CONTENT_WIDTH, 32);
            this.speakerLabel.node.setPosition(0, 226, 0);
            bodyTransform.setContentSize(CONTENT_WIDTH, 214);
            this.bodyLabel.node.setPosition(0, 120, 0);
            promptTransform.setContentSize(CONTENT_WIDTH, 90);
            this.promptLabel.node.setPosition(0, -48, 0);
            return;
        }

        speakerTransform.setContentSize(CONTENT_WIDTH, 32);
        this.speakerLabel.node.setPosition(0, 226, 0);
        bodyTransform.setContentSize(CONTENT_WIDTH, 220);
        this.bodyLabel.node.setPosition(0, 120, 0);
        promptTransform.setContentSize(CONTENT_WIDTH, 90);
        this.promptLabel.node.setPosition(0, -48, 0);
    }

    private layoutRewardText(): void {
        this.layoutStoryText(false, 'right');
        const rewardTextX = -54;
        const rewardTextWidth = 226;
        const speakerTransform = this.speakerLabel?.node.getComponent(UITransform);
        const bodyTransform = this.bodyLabel?.node.getComponent(UITransform);
        const promptTransform = this.promptLabel?.node.getComponent(UITransform);
        if (!speakerTransform || !bodyTransform || !promptTransform) {
            return;
        }

        speakerTransform.setContentSize(rewardTextWidth, 32);
        this.speakerLabel?.node.setPosition(rewardTextX, 226, 0);
        bodyTransform.setContentSize(rewardTextWidth, 220);
        this.bodyLabel?.node.setPosition(rewardTextX, 120, 0);
        promptTransform.setContentSize(rewardTextWidth, 90);
        this.promptLabel?.node.setPosition(rewardTextX, -48, 0);
    }

    private createRootCandidateCard(
        parent: Node,
        candidate: SpiritualRootCandidate,
        index: number,
    ): void {
        const card = this.createButton(
            parent,
            `RootCandidate_${candidate.id}`,
            '',
            0,
            160 - index * 160,
            CONTENT_WIDTH - 20,
            145,
            index === 1 ? COLORS.ember : COLORS.panelAlt,
            () => {
                this.engine?.lockSpiritualRoot(index);
                const save = this.activeSave ?? this.engine?.getSave();
                if (save?.root_roll_locked) {
                    this.startPostRootTutorial(save);
                    this.renderTutorialOverlay();
                }
            },
        );
        const label = card.getChildByName('ButtonLabel')?.getComponent(Label);
        if (!label) {
            return;
        }

        const primary = SpiritualRootSystem.elementLabel(candidate.primary);
        const secondary = candidate.secondary
            ? SpiritualRootSystem.elementLabel(candidate.secondary)
            : '无';
        label.string = [
            `${candidate.grade_label} · ${primary}/${secondary}`,
            `五行倾向：${primary}/${secondary}`,
            `${candidate.trait_label}：${candidate.combat_description}`,
            '点击锁定',
        ].join('\n');
        label.fontSize = 14;
        label.lineHeight = 20;
        label.enableWrapText = true;
    }

    private createPanel(
        parent: Node,
        name: string,
        width: number,
        height: number,
        x: number,
        y: number,
        color: Color,
    ): Node {
        const node = new Node(name);
        parent.addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        node.setPosition(x, y, 0);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        return node;
    }

    private createSprite(
        parent: Node,
        name: string,
        width: number,
        height: number,
        x: number,
        y: number,
    ): Sprite {
        const node = new Node(name);
        parent.addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        node.setPosition(x, y, 0);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.active = false;
        return sprite;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        fontSize: number,
        width: number,
        height: number,
        x: number,
        y: number,
        color: Color,
    ): Label {
        const node = new Node(name);
        parent.addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.45);
        label.color = color;
        return label;
    }

    private createNumericInput(
        parent: Node,
        name: string,
        placeholder: string,
        x: number,
        y: number,
        width: number,
        height: number,
        initialValue: string,
    ): EditBox {
        const node = this.createPanel(
            parent,
            name,
            width,
            height,
            x,
            y,
            COLORS.panelAlt,
        );
        const input = node.addComponent(EditBox);
        input.inputMode = EditBox.InputMode.NUMERIC;
        input.maxLength = 3;
        input.textLabel = this.createLabel(
            node,
            'TextLabel',
            initialValue,
            14,
            width - 14,
            height - 8,
            0,
            0,
            COLORS.ink,
        );
        input.placeholderLabel = this.createLabel(
            node,
            'PlaceholderLabel',
            placeholder,
            14,
            width - 14,
            height - 8,
            0,
            0,
            COLORS.muted,
        );
        input.string = initialValue;
        return input;
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        color: Color,
        callback: () => void,
    ): Node {
        const node = this.createPanel(parent, name, width, height, x, y, color);
        const button = node.addComponent(Button);
        const stopTouchPropagation = (event: EventTouch): void => {
            event.propagationStopped = true;
        };
        node.on(
            Node.EventType.TOUCH_START,
            stopTouchPropagation,
            this,
        );
        node.on(
            Node.EventType.TOUCH_MOVE,
            stopTouchPropagation,
            this,
        );
        node.on(
            Node.EventType.TOUCH_CANCEL,
            stopTouchPropagation,
            this,
        );
        node.on(
            Node.EventType.TOUCH_END,
            (event: EventTouch) => {
                event.propagationStopped = true;
                if (button.interactable && this.acceptTap()) {
                    callback();
                }
            },
            this,
        );
        this.createLabel(
            node,
            'ButtonLabel',
            text,
            16,
            width - 24,
            height - 10,
            0,
            0,
            COLORS.ink,
        );
        return node;
    }

    private acceptTap(): boolean {
        const now = Date.now();
        if (now < this.tapLockUntil) {
            return false;
        }
        this.tapLockUntil = now + 220;
        return true;
    }

    private setButtonLabelStyle(
        button: Node,
        fontSize: number,
        lineHeight: number,
    ): void {
        const label = button.getChildByName('ButtonLabel')?.getComponent(Label);
        if (!label) {
            return;
        }
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.enableWrapText = true;
    }
}
