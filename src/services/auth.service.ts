import api from '@/lib/api'; // Assuming 'api' is an Axios instance configured with interceptors
import { AxiosError } from 'axios';

// --- Type Definitions ---

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'product_owner'; // Consistent with 'auth-context.tsx'
  subscription: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  // Add usage properties if they are part of the user object from '/api/auth/me'
  usage?: {
    processedFiles: number;
    workflowsCreated: number;
    storageUsed: number;
  };
}

export interface LoginResponse {
  user: User;
  token: string;
  expiresAt: string; // This should be a Date string or timestamp
}

// --- AuthService Class ---

export class AuthService {

  /**
   * Logs in a user and stores authentication tokens.
   * @param email User's email.
   * @param password User's password.
   * @returns A promise that resolves with LoginResponse containing user data and token.
   * @throws An error if login fails.
   */
  static async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await api.post('/api/auth/login', { email, password });

      const { token, user, expiresAt } = response.data;

      // Store token securely. localStorage is okay for JWTs, but consider HttpOnly cookies for more security.
      // For this setup, localStorage is fine but be aware of XSS risks.
      localStorage.setItem('jwtToken', token); // Using 'jwtToken' for consistency with auth-context.tsx
      localStorage.setItem('excelflow-user', JSON.stringify(user));
      // Optionally store expiresAt if you want to proactively check token expiry client-side
      localStorage.setItem('jwtExpiresAt', expiresAt);

      return { user, token, expiresAt };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      // Propagate more specific error from backend if available
      throw new Error(axiosError.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  }

  /**
   * Registers a new user and logs them in.
   * @param email User's email.
   * @param password User's password.
   * @param name User's name.
   * @returns A promise that resolves with LoginResponse.
   * @throws An error if registration fails.
   */
  static async register(email: string, password: string, name: string): Promise<LoginResponse> {
    try {
      const response = await api.post('/api/auth/register', { email, password, name });

      const { token, user, expiresAt } = response.data;

      localStorage.setItem('jwtToken', token); // Consistent naming
      localStorage.setItem('excelflow-user', JSON.stringify(user));
      localStorage.setItem('jwtExpiresAt', expiresAt);

      return { user, token, expiresAt };
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Registration failed. Please try again.');
    }
  }

  /**
   * Logs out the current user. Clears local storage and invalidates server-side session/token.
   * It attempts to call the logout API but clears local storage regardless of API success.
   */
  static async logout(): Promise<void> {
    try {
      // Send a request to the backend to invalidate the token/session
      // The backend should clear any server-side session or blacklist the JWT.
      await api.post('/api/auth/logout');
    } catch (error: unknown) {
      // Log the error but proceed with client-side logout, as the primary goal is to clear local state.
      console.warn("Logout API call failed, but client-side token will be cleared:", error);
    } finally {
      // Always clear client-side stored tokens and user data
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('excelflow-user');
      localStorage.removeItem('jwtExpiresAt');
      // Potentially clear sessionStorage items if they are used for user-specific data
      sessionStorage.clear(); // Use with caution, clears everything
    }
  }

  /**
   * Fetches the current authenticated user's profile.
   * @returns A promise that resolves with the User object or null if not authenticated/failed.
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      // The API call for '/api/auth/me' should use the stored token implicitly via Axios interceptors.
      const response = await api.get('/api/auth/me');
      // Ensure the 'user' object from backend matches the 'User' interface.
      const user: User = response.data.user; // Assuming response.data contains a 'user' property

      // Update localStorage with the latest user data (e.g., usage, subscription changes)
      localStorage.setItem('excelflow-user', JSON.stringify(user));

      return user;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      // If 401/403, it means the token is invalid or expired.
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        console.warn("Authentication failed for getCurrentUser. Token might be invalid or expired.");
        // Consider proactively logging out the user if token is invalid/expired
        // AuthService.logout(); // Call this in your AuthProvider's useEffect, not directly here
      } else {
        console.error("Failed to fetch current user:", axiosError.message, axiosError.response?.data);
      }
      return null;
    }
  }

  /**
   * Refreshes the authentication token.
   * @returns A promise that resolves with the new token.
   * @throws An error if token refresh fails.
   */
  static async refreshToken(): Promise<string> {
    try {
      const response = await api.post('/api/auth/refresh');
      const newToken = response.data.token;
      const newExpiresAt = response.data.expiresAt; // Assuming backend sends new expiresAt

      localStorage.setItem('jwtToken', newToken);
      localStorage.setItem('jwtExpiresAt', newExpiresAt); // Update expiration time

      return newToken;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      console.error("Token refresh API call failed:", axiosError.message, axiosError.response?.data);
      // It's critical to throw an error here so the calling context (e.g., Axios interceptor)
      // knows to handle the failed refresh (e.g., force logout).
      throw new Error(axiosError.response?.data?.message || 'Token refresh failed. Please log in again.');
    }
  }

  /**
   * Retrieves the current JWT token from localStorage.
   * @returns The JWT token string or null if not found.
   */
  static getToken(): string | null {
    return localStorage.getItem('jwtToken');
  }

  /**
   * Retrieves the stored user data from localStorage.
   * @returns The User object or null if not found or invalid.
   */
  static getStoredUser(): User | null {
    const userData = localStorage.getItem('excelflow-user');
    if (userData) {
      try {
        return JSON.parse(userData) as User;
      } catch (e) {
        console.error("Failed to parse stored user data:", e);
        return null;
      }
    }
    return null;
  }

  /**
   * Checks if the stored token is expired (client-side check based on stored expiresAt).
   * This is a quick check, server-side validation is definitive.
   */
  static isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem('jwtExpiresAt');
    if (!expiresAt) {
      return true; // No expiration time, assume expired or never set
    }
    const expiryDate = new Date(expiresAt);
    return expiryDate.getTime() < Date.now();
  }
}