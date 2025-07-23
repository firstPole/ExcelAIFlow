  import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
  import { toast } from 'sonner';
  import { AuthService, User } from '@/services/auth.service'; // Assuming AuthService is in services/auth.service.ts
  import { analyticsService } from '@/services/analytics.service'; // Assuming an analytics service for tracking events

  // Define the AuthContextType
  interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    hasPermission: (requiredRole: 'user' | 'product_owner') => boolean;
    refreshUserProfile: () => Promise<void>;
  }

  const AuthContext = createContext<AuthContextType | undefined>(undefined);

  interface AuthProviderProps {
    children: ReactNode;
  }

  export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Initial loading state for the entire auth context

    // --- Helper to fetch user profile ---
    // This function fetches the user data from the backend.
    // It's memoized with useCallback to prevent unnecessary re-creations.
    const fetchUserProfile = useCallback(async () => {
      try {
        // AuthService.getCurrentUser() is expected to make an API call
        // with the current token (likely handled by an Axios interceptor).
        const userData = await AuthService.getCurrentUser();

        if (userData) {
          setUser(userData);
          // Analytics: Track user login or session restoration
          analyticsService.track('user_session_restored', { userId: userData.id, role: userData.role });
        } else {
          // If userData is null, it means the token was invalid or expired on the backend,
          // or the user simply doesn't exist for the given token.
          // Clear local storage and state to ensure a clean slate.
          localStorage.removeItem('jwtToken');
          setToken(null);
          setUser(null);
          toast.error('Your session has expired or is invalid. Please log in again.');
          analyticsService.trackError('session_expired_or_invalid', { component: 'AuthContext', severity: 'high' });
        }
      } catch (error) {
        console.error('AuthContext: Failed to fetch user profile:', error);
        // Clear token if fetching user profile fails, implying a persistent token issue
        localStorage.removeItem('jwtToken');
        setToken(null);
        setUser(null);
        toast.error('Failed to retrieve session data. Please log in.');
        analyticsService.trackError('fetch_profile_failed', { component: 'AuthContext', error: (error as Error).message, severity: 'high' });
      } finally {
        // Ensure loading state is false after attempting to fetch profile
        setIsLoading(false);
      }
    }, []); // Empty dependency array as it doesn't depend on any external state/props

    // --- Initial Authentication Check and Persistence ---
    useEffect(() => {
      const storedToken = localStorage.getItem('jwtToken');
      if (storedToken) {
        setToken(storedToken);
        // Attempt to fetch user profile using the stored token
        fetchUserProfile();
      } else {
        // No token found, so no need to load. Set loading to false.
        setIsLoading(false);
      }
    }, [fetchUserProfile]); // `fetchUserProfile` is a stable callback, so it's safe to include

    // --- Login Function ---
    const login = async (email: string, password: string) => {
      setIsLoading(true); // Set loading true during login attempt
      try {
        // Use AuthService for login. It's expected to return a new token and user data.
        const { token: newToken, user: userData } = await AuthService.login(email, password);

        setToken(newToken);
        localStorage.setItem('jwtToken', newToken); // Store the token (consider HTTP-only cookies in production for better security)
        setUser(userData); // Set user data received directly from login response

        toast.success('Login successful!');
        analyticsService.track('user_login', { userId: userData.id, role: userData.role }); // Analytics tracking
      } catch (error: any) {
        // AuthService should throw specific errors, catch them here
        toast.error(error.message || 'Login failed. Please check your credentials.');
        analyticsService.trackError('login_failed', { email, error: error.message, severity: 'medium' });
        throw error; // Re-throw to allow component (e.g., Login.tsx) to catch and set local error state
      } finally {
        setIsLoading(false); // Set loading false after login attempt (success or failure)
      }
    };

    // --- Logout Function ---
    const logout = async () => {
      try {
        await AuthService.logout(); // Call the logout API on the backend
      } catch (error) {
        console.error('AuthContext: Error during logout API call:', error);
        analyticsService.trackError('logout_api_failed', { userId: user?.id, error: (error as Error).message, severity: 'low' });
        // Even if API call fails, proceed with client-side logout to clear sensitive data
      } finally {
        setToken(null);
        setUser(null);
        localStorage.removeItem('jwtToken'); // Clear the token from local storage
        toast.info('You have been logged out.');
        analyticsService.track('user_logout', { userId: user?.id }); // Analytics tracking
      }
    };

    // --- Permission Check Function ---
    const hasPermission = useCallback((requiredRole: 'user' | 'product_owner'): boolean => {
      if (!user) return false;
      // 'user' role is the base access, 'product_owner' is an elevated role
      if (requiredRole === 'user') return true;
      return user.role === 'product_owner';
    }, [user]); // Depends on the user object to determine permissions

    // --- Refresh User Profile Function ---
    // This can be called by other components to force a refresh of user data (e.g., after an upgrade)
    const refreshUserProfile = async () => {
      if (token) {
        setIsLoading(true); // Set loading true during profile refresh
        await fetchUserProfile(); // Re-fetch the user profile
      } else {
        // If there's no token, ensure loading state is false as there's nothing to refresh
        setIsLoading(false);
      }
    };

    // --- Context Value ---
    const contextValue: AuthContextType = {
      user,
      token,
      isLoading,
      login,
      logout,
      hasPermission,
      refreshUserProfile,
    };

    return (
      <AuthContext.Provider value={contextValue}>
        {children}
      </AuthContext.Provider>
    );
  };

  // --- Custom Hook to Use Auth Context ---
  export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
      throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
  };