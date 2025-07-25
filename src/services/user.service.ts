// src/services/user.service.ts
import api from '@/lib/api';
import { AxiosError } from 'axios';
import { User } from '@/services/auth.service'; // Assuming User interface is defined in auth.service.ts

// Define interfaces for user-specific settings
export interface UserNotificationSettings {
  email: boolean;
  push: boolean;
  workflow: boolean;
  errors: boolean;
}

export interface UserAISettings {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface UserDatabaseSettings {
  type: string;
  host: string;
  port: number;
  name: string;
}

export interface UserPerformanceSettings {
  maxConcurrentTasks: number;
  timeout: number;
  retryAttempts: number;
}

// Full settings object as stored/retrieved from backend
export interface UserSettings {
  notifications: UserNotificationSettings;
  ai: UserAISettings; // Renamed from 'model' to avoid conflict with 'model' property in AI settings
  database: UserDatabaseSettings;
  performance: UserPerformanceSettings;
}

// DTO for updating user profile
export interface UpdateUserProfileDto {
  name?: string;
  email?: string; // Though email changes usually require re-verification
  theme?: 'light' | 'dark' | 'system';
}

// DTO for updating user settings
export interface UpdateUserSettingsDto extends Partial<UserSettings> {}

export class UserService {
  /**
   * Updates the user's profile information.
   * @param userId The ID of the user to update.
   * @param updates Partial user profile data.
   * @returns A Promise that resolves with the updated User object.
   * @throws An error if the update fails.
   */
  static async updateUserProfile(userId: string, updates: UpdateUserProfileDto): Promise<User> {
    try {
      const response = await api.put<User>(`/api/users/profile`, updates); // Assuming PUT to /api/users/profile
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update profile.');
    }
  }

  /**
   * Fetches the current user's settings.
   * @returns A Promise that resolves with the UserSettings object.
   * @throws An error if fetching settings fails.
   */
  static async getUserSettings(): Promise<UserSettings> {
    try {
      const response = await api.get<UserSettings>('/api/users/settings'); // Assuming GET from /api/users/settings
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      console.error('UserService: Failed to fetch user settings:', axiosError.message, axiosError.response?.data);
      // Return default settings or throw, depending on desired behavior
      return {
        notifications: { email: true, push: true, workflow: true, errors: true },
        ai: { provider: 'ollama', model: 'llama3', temperature: 0.7, maxTokens: 768 },
        database: { type: 'sqlite', host: 'localhost', port: 5432, name: 'excelflow' },
        performance: { maxConcurrentTasks: 5, timeout: 300, retryAttempts: 3 }
      };
      // throw new Error(axiosError.response?.data?.message || 'Failed to load settings.');
    }
  }

  /**
   * Updates the user's settings.
   * @param updates Partial UserSettings data.
   * @returns A Promise that resolves with the updated UserSettings object.
   * @throws An error if the update fails.
   */
  static async updateUserSettings(updates: UpdateUserSettingsDto): Promise<UserSettings> {
    try {
      const response = await api.put<UserSettings>('/api/users/settings', updates); // Assuming PUT to /api/users/settings
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to save settings.');
    }
  }

  /**
   * Sends a request to upgrade the user's subscription plan.
   * @param plan The new plan to upgrade to ('pro' or 'enterprise').
   * @returns A Promise that resolves when the upgrade is successful.
   * @throws An error if the upgrade fails.
   */
  static async upgradeSubscription(plan: 'pro' | 'enterprise'): Promise<void> {
    try {
      await api.post('/api/users/upgrade', { plan }); // Assuming POST to /api/users/upgrade
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to upgrade subscription.');
    }
  }

  /**
   * Updates the user's password.
   * @param currentPassword The user's current password.
   * @param newPassword The new password.
   * @returns A Promise that resolves when the password is successfully updated.
   * @throws An error if the password update fails.
   */
  static async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await api.put('/api/users/password', { currentPassword, newPassword }); // Assuming PUT to /api/users/password
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update password.');
    }
  }

  /**
   * Simulates a test connection to a database or AI model.
   * @param config The configuration to test.
   * @returns A Promise that resolves if the connection is successful.
   * @throws An error if the connection fails.
   */
  static async testConnection(config: any): Promise<void> {
    try {
      // This would be a real API call to a backend endpoint that tests the connection
      await api.post('/api/system/test-connection', config);
      return;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Connection test failed.');
    }
  }
}