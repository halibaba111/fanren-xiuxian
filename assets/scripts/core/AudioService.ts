import { AudioClip, AudioSource, Node, resources } from 'cc';

export type AudioMusicKind = 'explore' | 'battle';
export type AudioSfxKind =
    | 'tap'
    | 'confirm'
    | 'reward'
    | 'error'
    | 'loading'
    | 'battle';

const MUSIC_PATHS: Record<AudioMusicKind, string> = {
    explore: 'audio/bgm_sect_mystery_loop',
    battle: 'audio/bgm_trial_battle_loop',
};

const SFX_PATHS: Record<AudioSfxKind, string> = {
    tap: 'audio/sfx_ui_tick',
    confirm: 'audio/sfx_confirm_reward',
    reward: 'audio/sfx_confirm_reward',
    error: 'audio/sfx_error_fail',
    loading: 'audio/sfx_ui_tick',
    battle: 'audio/sfx_combat_impact',
};

export class GameAudioService {
    private musicSource: AudioSource | null = null;
    private sfxSource: AudioSource | null = null;
    private readonly clips = new Map<string, AudioClip>();
    private musicKind: AudioMusicKind | '' = '';
    private enabled = true;

    public attach(root: Node): void {
        this.musicSource = root.addComponent(AudioSource);
        this.sfxSource = root.addComponent(AudioSource);
        this.musicSource.loop = true;
        this.musicSource.playOnAwake = false;
        this.sfxSource.playOnAwake = false;
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.stopMusic();
        }
    }

    public playMusic(kind: AudioMusicKind, volume = 0.22): void {
        if (!this.enabled || !this.musicSource || this.musicKind === kind) {
            if (this.enabled && this.musicSource && this.musicKind === kind) {
                this.musicSource.volume = volume;
            }
            return;
        }

        this.musicKind = kind;
        this.musicSource.stop();
        this.load(MUSIC_PATHS[kind], (clip) => {
            if (!this.enabled || !this.musicSource || this.musicKind !== kind) {
                return;
            }
            this.musicSource.clip = clip;
            this.musicSource.loop = true;
            this.musicSource.volume = volume;
            this.musicSource.play();
        });
    }

    public stopMusic(): void {
        this.musicKind = '';
        this.musicSource?.stop();
        if (this.musicSource) {
            this.musicSource.clip = null;
        }
    }

    public playSfx(kind: AudioSfxKind): void {
        if (!this.enabled || !this.sfxSource) {
            return;
        }
        this.load(SFX_PATHS[kind], (clip) => {
            if (!this.enabled || !this.sfxSource) {
                return;
            }
            this.sfxSource.playOneShot(clip, kind === 'battle' ? 0.7 : 0.8);
        });
    }

    private load(path: string, callback: (clip: AudioClip) => void): void {
        const cached = this.clips.get(path);
        if (cached) {
            callback(cached);
            return;
        }
        resources.load(path, AudioClip, (error, clip) => {
            if (error || !clip) {
                return;
            }
            this.clips.set(path, clip);
            callback(clip);
        });
    }
}
