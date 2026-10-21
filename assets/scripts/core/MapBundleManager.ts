import {
    Asset,
    AssetManager,
    Constructor,
    assetManager,
} from 'cc';

export type MapBundleId =
    | 'world_map'
    | 'common_items'
    | 'map_outer'
    | 'map_library'
    | 'map_market'
    | 'map_rear_mountain'
    | 'map_inner_sect'
    | 'system_forge'
    | 'system_summon';

/**
 * Keeps common bundles resident and releases only the area-specific bundle
 * that is no longer needed.
 */
export class MapBundleManager {
    private static readonly LOAD_TIMEOUT_MS = 8000;
    private static readonly ASSET_TIMEOUT_MS = 8000;
    private static readonly loaded = new Map<
        MapBundleId,
        AssetManager.Bundle
    >();
    private static readonly pending = new Map<
        MapBundleId,
        Promise<AssetManager.Bundle>
    >();

    public static load(bundleId: MapBundleId): Promise<AssetManager.Bundle> {
        const cached = this.loaded.get(bundleId);
        if (cached) {
            return Promise.resolve(cached);
        }

        const pending = this.pending.get(bundleId);
        if (pending) {
            return pending;
        }

        const request = new Promise<AssetManager.Bundle>((resolve, reject) => {
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const finish = (
                error: Error | null,
                bundle?: AssetManager.Bundle,
            ): void => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
                if (error || !bundle) {
                    reject(
                        error ??
                            new Error(`Failed to load asset bundle: ${bundleId}`),
                    );
                    return;
                }
                this.loaded.set(bundleId, bundle);
                resolve(bundle);
            };

            timeoutId = setTimeout(() => {
                finish(
                    new Error(
                        `Timed out loading asset bundle: ${bundleId}`,
                    ),
                );
            }, this.LOAD_TIMEOUT_MS);

            assetManager.loadBundle(bundleId, (error, bundle) => {
                if (settled) {
                    if (
                        bundle &&
                        !this.loaded.has(bundleId) &&
                        !this.pending.has(bundleId)
                    ) {
                        bundle.releaseAll();
                        assetManager.removeBundle(bundle);
                    }
                    return;
                }
                finish(error, bundle);
            });
        });

        this.pending.set(bundleId, request);
        request.then(
            () => this.pending.delete(bundleId),
            () => this.pending.delete(bundleId),
        );
        return request;
    }

    public static async preload(
        bundleIds: readonly MapBundleId[],
    ): Promise<void> {
        await Promise.all(bundleIds.map((bundleId) => this.load(bundleId)));
    }

    public static async loadAsset<T extends Asset>(
        bundle: AssetManager.Bundle,
        path: string,
        type: Constructor<T>,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const finish = (error: Error | null, asset?: T): void => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
                if (error || !asset) {
                    reject(
                        error ??
                            new Error(
                                `Failed to load "${path}" from bundle`,
                            ),
                    );
                    return;
                }
                resolve(asset);
            };

            timeoutId = setTimeout(() => {
                finish(
                    new Error(
                        `Timed out loading asset "${path}" from bundle`,
                    ),
                );
            }, this.ASSET_TIMEOUT_MS);

            bundle.load(path, type, (error, asset) => {
                finish(error, asset);
            });
        });
    }

    public static release(bundleId: MapBundleId): void {
        if (bundleId === 'world_map' || bundleId === 'common_items') {
            return;
        }

        const bundle = this.loaded.get(bundleId);
        if (!bundle) {
            return;
        }

        bundle.releaseAll();
        assetManager.removeBundle(bundle);
        this.loaded.delete(bundleId);
    }

    public static releaseAreaBundles(
        keepBundleId?: MapBundleId,
    ): void {
        const areaBundles: MapBundleId[] = [
            'map_outer',
            'map_library',
            'map_market',
            'map_rear_mountain',
            'map_inner_sect',
            'system_forge',
            'system_summon',
        ];
        areaBundles.forEach((bundleId) => {
            if (bundleId !== keepBundleId) {
                this.release(bundleId);
            }
        });
    }

    public static isLoaded(bundleId: MapBundleId): boolean {
        return this.loaded.has(bundleId);
    }
}
