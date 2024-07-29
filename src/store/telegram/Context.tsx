import { createContext } from "react";
import { TelegramContextType } from "./types";

export const initialUserProfileData = {
    user: {
        referral_code: "123456789",
    }
}

const TelegramContext = createContext<TelegramContextType>({
    telegram: null,
    user: null,
    userProfile: initialUserProfileData
});

export default TelegramContext;
