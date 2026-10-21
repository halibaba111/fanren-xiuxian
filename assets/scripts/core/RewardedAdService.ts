export interface LampsRewardedVideoResult {
    ok?: boolean;
    success?: boolean;
    code?: string | number;
    message?: string;
}

export interface LampsPlatform {
    showRewardedVideo: (options?: {
        source?: string;
        forward_source?: string;
    }) => Promise<LampsRewardedVideoResult> | LampsRewardedVideoResult;
}

export interface RewardedAdResult {
    completed: boolean;
    preview?: boolean;
    message?: string;
    reason?: 'busy' | 'failed' | 'timeout' | 'not_completed';
    error?: unknown;
}

type XiuxianGlobal = typeof globalThis & {
    LampsPlatform?: LampsPlatform;
    location?: {
        hostname?: string;
    };
};

function getLampsPlatform(): LampsPlatform | undefined {
    return (globalThis as XiuxianGlobal).LampsPlatform;
}

function isPreviewEnvironment(): boolean {
    const hostname = (globalThis as XiuxianGlobal).location?.hostname ?? '';
    return /^(localhost|127\.0\.0\.1)$/.test(hostname);
}

function isSuccessfulRewardedVideoResult(
    result: LampsRewardedVideoResult | null | undefined,
): boolean {
    if (!result) {
        return false;
    }
    if (result.ok === false || result.success === false) {
        return false;
    }
    if (result.ok === true || result.success === true) {
        return true;
    }
    return (
        result.code === 0 ||
        result.code === 200 ||
        result.code === '0' ||
        result.code === '200'
    );
}

export class RewardedAdService {
    private static readonly TIMEOUT_MS = 10000;
    private static busy = false;

    public static hasProvider(): boolean {
        return isPreviewEnvironment() ||
            typeof getLampsPlatform()?.showRewardedVideo === 'function';
    }

    public static isBusy(): boolean {
        return this.busy;
    }

    public static async showRewarded(
        placement = 'generic',
    ): Promise<RewardedAdResult> {
        if (this.busy) {
            return {
                completed: false,
                reason: 'busy',
            };
        }

        this.busy = true;
        try {
            if (isPreviewEnvironment()) {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 450);
                });
                return {
                    completed: true,
                    preview: true,
                    message: '预览广告模拟完成。',
                };
            }

            const lampsPlatform = getLampsPlatform();
            if (!lampsPlatform || !this.hasProvider()) {
                return {
                    completed: false,
                    reason: 'failed',
                    message: '广告接口尚未就绪，请稍后重试。',
                    error: new Error('lamps_ad_unavailable'),
                };
            }

            try {
                const result = await new Promise<LampsRewardedVideoResult>(
                    (resolve, reject) => {
                        const timeoutId = setTimeout(
                            () => reject(new Error('ad_timeout')),
                            this.TIMEOUT_MS,
                        );
                        let pendingResult:
                            | Promise<LampsRewardedVideoResult>
                            | LampsRewardedVideoResult;
                        try {
                            pendingResult = lampsPlatform.showRewardedVideo({
                                source: placement,
                            });
                        } catch (error) {
                            clearTimeout(timeoutId);
                            reject(error);
                            return;
                        }
                        Promise.resolve(pendingResult).then(
                            (response) => {
                                clearTimeout(timeoutId);
                                resolve(response);
                            },
                            (error) => {
                                clearTimeout(timeoutId);
                                reject(error);
                            },
                        );
                    },
                );
                if (isSuccessfulRewardedVideoResult(result)) {
                    return { completed: true };
                }
                return {
                    completed: false,
                    reason: 'not_completed',
                    message: result?.message,
                    error: result,
                };
            } catch (error) {
                return {
                    completed: false,
                    reason:
                        error instanceof Error &&
                        error.message === 'ad_timeout'
                            ? 'timeout'
                            : 'failed',
                    message:
                        error instanceof Error ? error.message : undefined,
                    error,
                };
            }
        } finally {
            this.busy = false;
        }
    }
}
