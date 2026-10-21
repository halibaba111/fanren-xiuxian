import {
    LocalSave,
    SpiritualElement,
    SpiritualRootCandidate,
    SpiritualRootGrade,
} from './StoryTypes';

const ELEMENTS: SpiritualElement[] = ['metal', 'wood', 'water', 'fire', 'earth'];

const ELEMENT_LABELS: Record<SpiritualElement, string> = {
    metal: '金',
    wood: '木',
    water: '水',
    fire: '火',
    earth: '土',
};

const GRADE_CONFIG: Array<{
    grade: SpiritualRootGrade;
    label: string;
    minRate: number;
    maxRate: number;
    weight: number;
}> = [
    { grade: 'mixed', label: '杂灵根', minRate: 0.95, maxRate: 1.05, weight: 62 },
    { grade: 'true', label: '真灵根', minRate: 1.08, maxRate: 1.15, weight: 28 },
    { grade: 'earth', label: '地灵根', minRate: 1.18, maxRate: 1.28, weight: 9 },
    { grade: 'heaven', label: '天灵根', minRate: 1.35, maxRate: 1.45, weight: 1 },
];

const ELEMENT_TRAITS: Record<
    SpiritualElement,
    { trait: string; label: string; description: string }
> = {
    metal: {
        trait: 'sharp_edge',
        label: '锋芒',
        description: '穿透和暴击小幅提高，适合快速解决精英敌人。',
    },
    wood: {
        trait: 'steady_recovery',
        label: '回春',
        description: '生命恢复更稳定，适合持续战斗和容错。',
    },
    water: {
        trait: 'flowing_step',
        label: '流步',
        description: '闪避和技能循环更顺，适合观察后反击。',
    },
    fire: {
        trait: 'ember_force',
        label: '炽劲',
        description: '主动技能伤害更高，适合主动压制敌人。',
    },
    earth: {
        trait: 'stone_guard',
        label: '镇岳',
        description: '生命和防御更高，失败后的恢复成本更低。',
    },
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function randomElement(random: () => number): SpiritualElement {
    return ELEMENTS[Math.floor(random() * ELEMENTS.length)];
}

function chooseGrade(random: () => number): (typeof GRADE_CONFIG)[number] {
    const roll = random() * 100;
    let cursor = 0;
    for (const config of GRADE_CONFIG) {
        cursor += config.weight;
        if (roll < cursor) {
            return config;
        }
    }
    return GRADE_CONFIG[0];
}

function chooseSecondary(
    random: () => number,
    primary: SpiritualElement,
    grade: SpiritualRootGrade,
): SpiritualElement | null {
    if (grade === 'heaven') {
        return null;
    }

    let secondary = randomElement(random);
    while (secondary === primary) {
        secondary = randomElement(random);
    }
    return secondary;
}

function createScores(
    random: () => number,
    primary: SpiritualElement,
    secondary: SpiritualElement | null,
    grade: SpiritualRootGrade,
): Record<SpiritualElement, number> {
    const scores = {} as Record<SpiritualElement, number>;
    for (const element of ELEMENTS) {
        scores[element] = 10 + Math.floor(random() * 31);
    }

    const primaryScore =
        grade === 'heaven'
            ? 82 + Math.floor(random() * 15)
            : grade === 'earth'
              ? 65 + Math.floor(random() * 16)
              : grade === 'true'
                ? 52 + Math.floor(random() * 16)
                : 32 + Math.floor(random() * 24);
    scores[primary] = primaryScore;

    if (secondary) {
        scores[secondary] =
            grade === 'mixed'
                ? 35 + Math.floor(random() * 20)
                : 42 + Math.floor(random() * 18);
    }

    return scores;
}

function createCandidate(
    random: () => number,
    index: number,
    forcedGrade?: SpiritualRootGrade,
): SpiritualRootCandidate {
    const config =
        GRADE_CONFIG.find((candidate) => candidate.grade === forcedGrade) ??
        chooseGrade(random);
    const primary = randomElement(random);
    const secondary = chooseSecondary(random, primary, config.grade);
    const elementTrait = ELEMENT_TRAITS[primary];
    const rate = round(
        config.minRate + random() * (config.maxRate - config.minRate),
        2,
    );

    return {
        id: `root_${index + 1}`,
        seed: Math.floor(random() * 1000000),
        grade: config.grade,
        grade_label: config.label,
        primary,
        secondary,
        scores: createScores(random, primary, secondary, config.grade),
        cultivation_rate: rate,
        trait: elementTrait.trait,
        trait_label: elementTrait.label,
        combat_description: elementTrait.description,
    };
}

export class SpiritualRootSystem {
    public static ensureCandidates(save: LocalSave): SpiritualRootCandidate[] {
        if (save.spiritual_root_candidates.length === 3) {
            return save.spiritual_root_candidates;
        }

        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const random = createRandom(seed);
        save.spiritual_root_candidates = [0, 1, 2].map((index) =>
            createCandidate(random, index),
        );
        return save.spiritual_root_candidates;
    }

    public static lock(save: LocalSave, candidateIndex: number): boolean {
        if (save.root_roll_locked) {
            return false;
        }

        const candidate = save.spiritual_root_candidates[candidateIndex];
        if (!candidate) {
            return false;
        }

        save.spiritual_root = candidate;
        save.root_roll_locked = true;
        return true;
    }

    public static reroll(
        save: LocalSave,
        guaranteeRare = false,
    ): boolean {
        if (save.root_roll_locked || save.spiritual_root_rerolls >= 4) {
            return false;
        }

        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const random = createRandom(seed);
        const candidates = [0, 1, 2].map((index) =>
            createCandidate(random, index),
        );
        if (
            guaranteeRare &&
            !candidates.some(
                (candidate) =>
                    candidate.grade === 'earth' ||
                    candidate.grade === 'heaven',
            )
        ) {
            candidates[0] = createCandidate(random, 0, 'earth');
        }

        save.spiritual_root_candidates = candidates;
        save.spiritual_root_rerolls += 1;
        return true;
    }

    public static elementLabel(element: SpiritualElement): string {
        return ELEMENT_LABELS[element];
    }

    public static formatScore(score: number): number {
        return clamp(Math.round(score), 0, 100);
    }
}
