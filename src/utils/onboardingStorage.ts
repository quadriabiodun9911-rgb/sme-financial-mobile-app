import AsyncStorage from '@react-native-async-storage/async-storage';

export const setOnboardingCompleted = async (completed: boolean) => {
    try {
        await AsyncStorage.setItem('@onboarding_completed', JSON.stringify(completed));
    } catch (e) {
        console.error('Failed to save onboarding status', e);
    }
};

export const getOnboardingCompleted = async (): Promise<boolean> => {
    try {
        const value = await AsyncStorage.getItem('@onboarding_completed');
        return value ? JSON.parse(value) : false;
    } catch (e) {
        console.error('Failed to get onboarding status', e);
        return false;
    }
};