export type TelegramUser = {
    id: number | null
    is_bot: boolean | null
    first_name: string
    last_name: string
    username: string
    photo_url: string
} | null;

export type TelegramUserProfile = {
    user: {
        referral_code: string
    }
}

export interface TelegramContextType {
    telegram: any;
    user: TelegramUser;
    userProfile: TelegramUserProfile;
}
