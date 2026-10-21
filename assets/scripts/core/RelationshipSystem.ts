import { LocalSave, RelationshipState } from './StoryTypes';
import { SaveManager } from './SaveManager';

const FAVOR_LEVELS = [
    { min: 0, label: '陌生' },
    { min: 10, label: '初识' },
    { min: 20, label: '相知' },
    { min: 30, label: '熟悉' },
    { min: 40, label: '亲近' },
    { min: 50, label: '知交' },
] as const;

export class RelationshipSystem {
    public static refresh(save: LocalSave): void {
        Object.keys(save.relationships).forEach((npcId) => {
            const relationship = save.relationships[npcId];
            relationship.favor = Math.max(
                0,
                Math.floor(Number(relationship.favor) || 0),
            );
            const level = [...FAVOR_LEVELS]
                .reverse()
                .findIndex((entry) => relationship.favor >= entry.min);
            const normalizedIndex =
                level < 0 ? 0 : FAVOR_LEVELS.length - 1 - level;
            relationship.level = normalizedIndex;
            relationship.levelLabel =
                FAVOR_LEVELS[normalizedIndex]?.label ?? '初识';
        });
        SaveManager.save(save);
    }

    public static addFavor(
        save: LocalSave,
        npcId: string,
        amount: number,
    ): RelationshipState | null {
        const relationship = save.relationships[npcId];
        if (!relationship) {
            return null;
        }
        relationship.favor = Math.max(
            0,
            Math.floor(Number(relationship.favor) || 0) +
                Math.floor(Number(amount) || 0),
        );
        this.refresh(save);
        return relationship;
    }

    public static summary(save: LocalSave): RelationshipState[] {
        this.refresh(save);
        return Object.keys(save.relationships)
            .map((npcId) => save.relationships[npcId])
            .sort(
            (a, b) => b.favor - a.favor,
            );
    }
}
