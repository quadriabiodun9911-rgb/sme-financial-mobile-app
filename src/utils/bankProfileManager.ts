/**
 * Bank Profile Manager
 * Saves and retrieves column mappings for different banks
 * Enables users to quickly re-import from same bank without remapping
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColumnMapping } from './flexibleBankStatementParser';

const BANK_PROFILES_STORAGE_KEY = '@smeApp_bankProfiles';

export interface BankProfile {
  id: string;
  bankName: string;
  columnMapping: ColumnMapping;
  headerSignature: string;
  createdDate: string;
  lastUsedDate: string;
  importCount: number;
}

/**
 * Create a signature from CSV headers for matching
 * Joins header names with | to create a unique signature
 */
export function createHeaderSignature(headers: string[]): string {
  return headers
    .map(h => h.toLowerCase().trim())
    .join('|');
}

/**
 * Save a bank profile to storage
 */
export async function saveBankProfile(
  bankName: string,
  columnMapping: ColumnMapping,
  headers: string[]
): Promise<BankProfile> {
  try {
    const profiles = await loadBankProfiles();

    const signature = createHeaderSignature(headers);

    // Check if profile with same signature already exists
    const existingIndex = profiles.findIndex(p => p.headerSignature === signature);

    const newProfile: BankProfile = {
      id: existingIndex >= 0 ? profiles[existingIndex].id : `bank-${Date.now()}`,
      bankName,
      columnMapping,
      headerSignature: signature,
      createdDate: existingIndex >= 0 ? profiles[existingIndex].createdDate : new Date().toISOString(),
      lastUsedDate: new Date().toISOString(),
      importCount: (existingIndex >= 0 ? profiles[existingIndex].importCount : 0) + 1,
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = newProfile;
    } else {
      profiles.push(newProfile);
    }

    await AsyncStorage.setItem(BANK_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    return newProfile;
  } catch (error) {
    console.error('Error saving bank profile:', error);
    throw error;
  }
}

/**
 * Load all saved bank profiles
 */
export async function loadBankProfiles(): Promise<BankProfile[]> {
  try {
    const data = await AsyncStorage.getItem(BANK_PROFILES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading bank profiles:', error);
    return [];
  }
}

/**
 * Find a matching profile by CSV headers
 * Returns the profile if headers match a saved bank format
 */
export async function findMatchingProfile(headers: string[]): Promise<BankProfile | null> {
  try {
    const profiles = await loadBankProfiles();
    const signature = createHeaderSignature(headers);

    // Find exact match by signature
    const match = profiles.find(p => p.headerSignature === signature);
    return match || null;
  } catch (error) {
    console.error('Error finding matching profile:', error);
    return null;
  }
}

/**
 * Get a specific profile by ID
 */
export async function getBankProfile(profileId: string): Promise<BankProfile | null> {
  try {
    const profiles = await loadBankProfiles();
    return profiles.find(p => p.id === profileId) || null;
  } catch (error) {
    console.error('Error getting bank profile:', error);
    return null;
  }
}

/**
 * Update a bank profile
 */
export async function updateBankProfile(
  profileId: string,
  updates: Partial<BankProfile>
): Promise<BankProfile | null> {
  try {
    const profiles = await loadBankProfiles();
    const index = profiles.findIndex(p => p.id === profileId);

    if (index < 0) return null;

    profiles[index] = { ...profiles[index], ...updates };
    await AsyncStorage.setItem(BANK_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    return profiles[index];
  } catch (error) {
    console.error('Error updating bank profile:', error);
    throw error;
  }
}

/**
 * Delete a bank profile
 */
export async function deleteBankProfile(profileId: string): Promise<boolean> {
  try {
    const profiles = await loadBankProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);

    if (filtered.length === profiles.length) return false; // Not found

    await AsyncStorage.setItem(BANK_PROFILES_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting bank profile:', error);
    throw error;
  }
}

/**
 * Update last used date for a profile
 */
export async function updateProfileLastUsed(profileId: string): Promise<void> {
  try {
    const profile = await getBankProfile(profileId);
    if (profile) {
      await updateBankProfile(profileId, {
        lastUsedDate: new Date().toISOString(),
        importCount: profile.importCount + 1,
      });
    }
  } catch (error) {
    console.error('Error updating profile last used:', error);
  }
}

/**
 * Get all profiles sorted by most recently used
 */
export async function getProfilesSortedByUsage(): Promise<BankProfile[]> {
  try {
    const profiles = await loadBankProfiles();
    return profiles.sort((a, b) =>
      new Date(b.lastUsedDate).getTime() - new Date(a.lastUsedDate).getTime()
    );
  } catch (error) {
    console.error('Error getting sorted profiles:', error);
    return [];
  }
}

/**
 * Format profile info for display
 */
export function formatProfileInfo(profile: BankProfile): {
  displayName: string;
  lastUsed: string;
  usageCount: string;
} {
  const date = new Date(profile.lastUsedDate);
  const today = new Date();
  const daysDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  let lastUsed = '';
  if (daysDiff === 0) lastUsed = 'Today';
  else if (daysDiff === 1) lastUsed = 'Yesterday';
  else if (daysDiff < 7) lastUsed = `${daysDiff} days ago`;
  else if (daysDiff < 30) lastUsed = `${Math.floor(daysDiff / 7)} weeks ago`;
  else lastUsed = `${Math.floor(daysDiff / 30)} months ago`;

  return {
    displayName: profile.bankName,
    lastUsed,
    usageCount: `Used ${profile.importCount} ${profile.importCount === 1 ? 'time' : 'times'}`,
  };
}
