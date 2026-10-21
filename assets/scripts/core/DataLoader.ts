import { JsonAsset, resources } from 'cc';
import { ChapterData } from './StoryTypes';

export class DataLoader {
    public static loadChapter(chapterId: string): Promise<ChapterData> {
        return new Promise((resolve, reject) => {
            resources.load(
                `chapters/${chapterId}`,
                JsonAsset,
                (error: Error | null, asset: JsonAsset) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(asset.json as ChapterData);
                },
            );
        });
    }
}
