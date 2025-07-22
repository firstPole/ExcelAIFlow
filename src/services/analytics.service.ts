import { api } from '@/lib/api'; // Assuming 'api' is an Axios instance configured with interceptors
import { AxiosError } from 'axios';
import { toast } from 'sonner'; // For user notifications, if needed for analytics service itself

// --- Type Definitions ---

export interface AnalyticsEvent {
  event: string;
  properties: Record<string, any>;
  userId?: string; // Added userId to the event structure
  sessionId: string; // Ensure sessionId is always part of the event sent to backend
  timestamp: string; // Ensure timestamp is always part of the event sent to backend
  // Add other common properties like url, userAgent, viewport if they are always present
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface UserBehavior {
  pageViews: Record<string, number>;
  featureUsage: Record<string, number>;
  timeSpent: Record<string, number>;
  conversionFunnel: {
    signUp: boolean;
    firstUpload: boolean;
    firstWorkflow: boolean;
    planUpgrade: boolean;
  };
}

// --- Analytics Service Class ---

class AnalyticsService {
  private sessionId: string;
  private startTime: number;
  private userId: string | null = null; // To store the current authenticated user ID
  private userPlan: string = 'free'; // To store the current user's plan

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.initializeTracking();
    // Attempt to load user ID and plan from localStorage if available on service instantiation
    this.loadUserContext();
  }

  private generateSessionId(): string {
    // Generate a unique session ID, persist in sessionStorage to survive tab refreshes
    let storedSessionId = sessionStorage.getItem('analyticsSessionId');
    if (!storedSessionId) {
      storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('analyticsSessionId', storedSessionId);
    }
    return storedSessionId;
  }

  // Load user context (ID, plan) from a persistent source (e.g., localStorage or AuthContext)
  // This needs to be called after authentication state is known.
  public setUserContext(userId: string | null, userPlan: string = 'free') {
    this.userId = userId;
    this.userPlan = userPlan;
    // Optionally, persist this in sessionStorage for the session duration
    if (userId) {
      sessionStorage.setItem('analyticsUserId', userId);
      sessionStorage.setItem('analyticsUserPlan', userPlan);
    } else {
      sessionStorage.removeItem('analyticsUserId');
      sessionStorage.removeItem('analyticsUserPlan');
    }
  }

  private loadUserContext() {
    const storedUserId = sessionStorage.getItem('analyticsUserId');
    const storedUserPlan = sessionStorage.getItem('analyticsUserPlan');
    if (storedUserId) {
      this.userId = storedUserId;
      this.userPlan = storedUserPlan || 'free';
    }
  }

  private initializeTracking() {
    // Ensure tracking is only initialized once
    if (window.__analyticsServiceInitialized) {
      return;
    }
    window.__analyticsServiceInitialized = true;

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.track('page_hidden', { sessionDuration: Date.now() - this.startTime });
      } else {
        this.track('page_visible');
        this.startTime = Date.now(); // Reset start time on visibility to track active duration
      }
    });

    // Track user interactions (clicks on elements with data-analytics attribute)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.analytics) {
        this.track('element_clicked', {
          element: target.dataset.analytics,
          text: target.textContent?.slice(0, 100), // Limit text length
          position: { x: e.clientX, y: e.clientY }
        });
      }
    });

    // Track beforeunload to capture session duration on tab close/navigation
    window.addEventListener('beforeunload', () => {
      this.track('session_end', { sessionDuration: Date.now() - this.startTime });
    });
  }

  // Core tracking method
  async track(event: string, properties: Record<string, any> = {}, retries = 3) {
    // In a real app, you might check for user consent here
    // if (!this.hasUserConsent()) return;

    const analyticsEvent: AnalyticsEvent = {
      event,
      properties: {
        ...properties,
        sessionId: this.sessionId,
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      userId: this.userId || undefined, // Attach userId if available
      timestamp: new Date().toISOString(),
    };

    try {
      await api.post('/api/analytics/track', analyticsEvent);
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      console.warn(`Analytics tracking failed for event '${event}'. Retries left: ${retries - 1}`, axiosError);

      if (retries > 0 && axiosError.response?.status !== 401 && axiosError.response?.status !== 403) {
        // Retry on network errors or 5xx, but not on auth errors
        setTimeout(() => this.track(event, properties, retries - 1), 1000 * (4 - retries)); // Exponential backoff
      } else {
        // Log final failure, maybe send to an external error monitoring service
        console.error(`Final analytics tracking failure for event '${event}':`, axiosError.message);
        // toast.error('Failed to send analytics data.'); // Avoid spamming user with toasts for background analytics
      }
    }
  }

  // --- Specific Tracking Methods ---

  async trackPageView(page: string, additionalProps: Record<string, any> = {}) {
    await this.track('page_view', {
      page,
      referrer: document.referrer,
      ...additionalProps
    });
  }

  async trackFeatureUsage(feature: string, action: string, metadata: Record<string, any> = {}) {
    await this.track('feature_usage', {
      feature,
      action,
      ...metadata
    });
  }

  async trackConversion(step: string, metadata: Record<string, any> = {}) {
    await this.track('conversion', {
      step,
      funnelPosition: this.getFunnelPosition(step),
      ...metadata
    });
  }

  async trackPlanInteraction(action: 'view_pricing' | 'upgrade_clicked' | 'plan_selected' | 'payment_started' | 'payment_completed', planType?: string) {
    await this.track('plan_interaction', {
      action,
      planType,
      currentPlan: this.userPlan // Use the stored user plan
    });
  }

  async trackLimitReached(limitType: 'files' | 'workflows' | 'storage', currentUsage: number, limit: number) {
    await this.track('limit_reached', {
      limitType,
      currentUsage,
      limit,
      utilizationPercentage: (currentUsage / limit) * 100
    });
  }

  async trackError(error: string, context: Record<string, any> = {}) {
    await this.track('error_occurred', {
      error,
      stack: context.stack,
      component: context.component,
      severity: context.severity || 'medium',
      // Include more context like current route, user ID (already added to base event)
    });
  }

  // --- Helper Methods ---

  private getFunnelPosition(step: string): number {
    const funnelSteps = ['signup', 'first_upload', 'first_workflow', 'plan_upgrade'];
    return funnelSteps.indexOf(step) + 1;
  }

  // This method is now public and set externally
  // private getCurrentUserPlan(): string {
  //   return this.userPlan;
  // }

  // --- Data Fetching for Analytics Dashboard (if applicable) ---
  // These methods would be called by your analytics dashboard component, not for tracking events.

  async getDashboardSummary(timeframe: string): Promise<any> {
    try {
      // You'll need to pass the authentication token for this protected route
      const token = sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken');
      if (!token) throw new Error('Authentication token not found for analytics data.');

      const response = await api.get(`/api/analytics/dashboard-summary?timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      throw new Error(`Failed to fetch dashboard summary: ${axiosError.message || 'Unknown error'}`);
    }
  }

  async getUserBehavior(userId: string): Promise<UserBehavior> {
    try {
      const token = sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken');
      if (!token) throw new Error('Authentication token not found for analytics data.');

      const response = await api.get(`/api/analytics/user/${userId}/behavior`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      throw new Error(`Failed to fetch user behavior: ${axiosError.message || 'Unknown error'}`);
    }
  }

  async getConversionMetrics(): Promise<any> {
    try {
      const token = sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken');
      if (!token) throw new Error('Authentication token not found for analytics data.');

      const response = await api.get('/api/analytics/conversion-metrics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      throw new Error(`Failed to fetch conversion metrics: ${axiosError.message || 'Unknown error'}`);
    }
  }
}

// Ensure only one instance of AnalyticsService is created
declare global {
  interface Window {
    __analyticsServiceInitialized: boolean;
  }
}

export const analyticsService = new AnalyticsService();

// You need to call analyticsService.setUserContext from your AuthContext
// or a root component once the user's authentication status is known.
// Example in AuthContext:
// useEffect(() => {
//   if (user) {
//     analyticsService.setUserContext(user.id, user.subscription);
//   } else {
//     analyticsService.setUserContext(null);
//   }
// }, [user]);