import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  User as UserIcon, // Renamed to avoid conflict with imported User type
  Settings as SettingsIcon,
  Database,
  Bot,
  Bell,
  Shield,
  Monitor,
  Zap,
  Save,
  RefreshCw,
  Loader2, // For loading indicators
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PricingPlans } from '@/components/pricing/pricing-plans'; // Assuming this component exists
import { UsageMeter } from '@/components/usage/usage-meter'; // Assuming this component exists
import { analyticsService } from '@/services/analytics.service';
import { useTheme } from '@/components/theme-provider'; // Assuming this context exists
import { toast } from 'sonner';
import {
  UserService,
  UserSettings,
  UpdateUserProfileDto,
  UpdateUserSettingsDto,
  UserNotificationSettings,
  UserAISettings,
  UserDatabaseSettings,
  UserPerformanceSettings
} from '@/services/user.service'; // Import UserService and types

export default function Settings() {
  const { user, hasPermission, isLoading: isLoadingAuth, refreshUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [showPricing, setShowPricing] = useState(false);

  // Profile Form States
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Settings states, initialized with defaults or fetched data
  const [userSettings, setUserSettings] = useState<UserSettings>({
    notifications: { email: true, push: true, workflow: true, errors: true },
    ai: { provider: 'ollama', model: 'llama3', temperature: 0.7, maxTokens: 2048 },
    database: { type: 'sqlite', host: 'localhost', port: 5432, name: 'excelflow' },
    performance: { maxConcurrentTasks: 5, timeout: 300, retryAttempts: 3 }
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Password Change States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Fetch user settings on component mount or when user changes
  useEffect(() => {
    const fetchSettings = async () => {
      if (user) {
        try {
          const fetchedSettings = await UserService.getUserSettings();
          setUserSettings(fetchedSettings);
        } catch (error) {
          console.error('Failed to fetch user settings:', error);
          toast.error('Failed to load your settings. Defaults are applied.');
          // If fetching fails, keep default state or handle specifically
        }
      }
    };
    if (!isLoadingAuth) { // Only fetch settings once auth state is known
      fetchSettings();
    }
  }, [user, isLoadingAuth]); // Re-fetch if user object or auth loading state changes

  // Update profile form fields when user object changes (e.g., after refresh)
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
    }
  }, [user]);

  // Usage data for UsageMeter component
  const usage = {
    files: { current: user?.usage?.processedFiles || 0, limit: user?.subscription === 'free' ? 3 : -1, label: 'Files Processed', unit: 'files' },
    workflows: { current: user?.usage?.workflowsCreated || 0, limit: user?.subscription === 'free' ? 5 : -1, label: 'Workflows Created', unit: 'workflows' },
    storage: { current: user?.usage?.storageUsed || 0, limit: user?.subscription === 'free' ? 100 : user?.subscription === 'pro' ? 10000 : 100000, label: 'Storage Used', unit: 'MB' }
  };

  // Handlers for profile updates
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to update your profile.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const updates: UpdateUserProfileDto = {
        name: profileName.trim(),
        // Email changes usually require re-verification, so often handled separately or made read-only
        // email: profileEmail.trim(),
      };
      await UserService.updateUserProfile(user.id, updates);
      await refreshUserProfile(); // Refresh user data in AuthContext
      toast.success('Profile updated successfully!');
      analyticsService.track('profile_updated', { userId: user.id });
    } catch (error: any) {
      console.error('Profile update failed:', error);
      toast.error(error.message || 'Failed to update profile.');
      analyticsService.trackError('profile_update_failed', { userId: user.id, error: error.message });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handler for settings updates
  const updateSetting = useCallback((category: keyof UserSettings, key: string, value: any) => {
    setUserSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
  }, []);

  const saveSettings = async () => {
    if (!user) {
      toast.error('You must be logged in to save settings.');
      return;
    }
    setIsSavingSettings(true);
    try {
      await UserService.updateUserSettings(userSettings);
      toast.success('Settings saved successfully!');
      analyticsService.track('settings_saved', { userId: user.id, settings: userSettings });
    } catch (error: any) {
      console.error('Save settings failed:', error);
      toast.error(error.message || 'Failed to save settings.');
      analyticsService.trackError('settings_save_failed', { userId: user.id, error: error.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to change your password.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all password fields.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await UserService.updatePassword(currentPassword, newPassword);
      toast.success('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      analyticsService.track('password_updated', { userId: user.id });
    } catch (error: any) {
      console.error('Password update failed:', error);
      toast.error(error.message || 'Failed to update password. Please check your current password.');
      analyticsService.trackError('password_update_failed', { userId: user.id, error: error.message });
    } finally {
      setIsUpdatingPassword(false);
    }
  };


  const testConnection = async () => {
    setIsTestingConnection(true);
    toast.info('Testing connection...');
    try {
      // Pass the relevant config based on the active tab for testing
      let configToTest: any = {};
      if (activeTab === 'model') {
        configToTest = userSettings.ai;
      } else if (activeTab === 'database') {
        configToTest = userSettings.database;
      } else {
        toast.error('No specific connection to test for this tab.');
        setIsTestingConnection(false);
        return;
      }

      await UserService.testConnection(configToTest);
      toast.success('Connection successful!');
      analyticsService.track('connection_test_success', { userId: user?.id, configType: activeTab });
    } catch (error: any) {
      console.error('Connection test failed:', error);
      toast.error(error.message || 'Connection failed!');
      analyticsService.trackError('connection_test_failed', { userId: user?.id, configType: activeTab, error: error.message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handlePlanSelect = async (planId: string) => {
    if (!user) {
      toast.error('You must be logged in to change your plan.');
      return;
    }
    try {
      await UserService.upgradeSubscription(planId as 'pro' | 'enterprise'); // Cast as appropriate
      await refreshUserProfile(); // Refresh user data to reflect new plan
      toast.success(`Successfully upgraded to ${planId} plan!`);
      analyticsService.trackPlanInteraction('plan_selected', planId);
      setShowPricing(false); // Hide pricing plans after selection
    } catch (error: any) {
      console.error('Plan upgrade failed:', error);
      toast.error(error.message || 'Failed to upgrade plan.');
      analyticsService.trackError('plan_upgrade_failed', { userId: user.id, plan: planId, error: error.message });
    }
  };

  const handleUpgrade = () => {
    setShowPricing(true);
    analyticsService.trackPlanInteraction('view_pricing');
  };

  // Display loading state if auth is still loading
  if (isLoadingAuth) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading User Data...
      </div>
    );
  }

  // If user is null after loading, redirect to login (or show login message)
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-lg text-muted-foreground p-4">
        <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
        <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground mb-4">Please log in to view your settings.</p>
        <Button onClick={() => window.location.href = '/login'}>Go to Login</Button>
      </div>
    );
  }

  // Check if user has permission for advanced settings (e.g., 'product_owner' or 'enterprise')
  // Assuming 'advanced_settings' permission is for 'product_owner' or 'enterprise' roles.
  // This needs to align with your `hasPermission` logic in `auth-context.tsx`.
  const canAccessAdvancedSettings = hasPermission('product_owner') || user.subscription === 'enterprise';


  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure your ExcelFlow AI preferences and system settings
          </p>
        </div>

        {/* Save Changes button, only visible if not on billing tab and not showing pricing */}
        {activeTab !== 'billing' || !showPricing ? (
          <Button onClick={saveSettings} disabled={isSavingSettings || isUpdatingPassword || isSavingProfile}>
            {isSavingSettings || isUpdatingPassword || isSavingProfile ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSavingSettings ? 'Saving...' : 'Save Changes'}
          </Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid w-full ${canAccessAdvancedSettings ? 'grid-cols-6' : 'grid-cols-3'}`}>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing & Usage</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {canAccessAdvancedSettings && (
            <>
              <TabsTrigger value="ai">AI Model</TabsTrigger> {/* Changed value to 'ai' */}
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <UserIcon className="mr-2 h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={isSavingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileEmail}
                      disabled // Email often read-only or requires special flow
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={(value: any) => setTheme(value)} disabled={isSavingProfile}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="flex items-center space-x-2">
                    <Badge variant={user?.subscription === 'enterprise' ? 'default' : 'secondary'}>
                      {user?.subscription || 'Free'}
                    </Badge>
                    {user?.subscription !== 'enterprise' && (
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('billing')}>
                        Upgrade Plan
                      </Button>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isSavingProfile ? 'Saving Profile...' : 'Save Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing & Usage Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                Manage your subscription and view usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold capitalize">{user?.subscription || 'Free'} Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    {user?.subscription === 'free' ? 'Perfect for getting started' :
                      user?.subscription === 'pro' ? 'Great for professionals' :
                      'Enterprise-grade features'}
                  </p>
                </div>
                {user?.subscription === 'free' && (
                  <Button onClick={handleUpgrade} data-analytics="settings-upgrade-button">
                    Upgrade Plan
                  </Button>
                )}
              </div>

              <UsageMeter
                usage={usage}
                plan={user?.subscription || 'free'}
                onUpgrade={handleUpgrade}
              />

              {showPricing && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Choose Your Plan</h3>
                  <PricingPlans
                    currentPlan={user?.subscription}
                    onPlanSelect={handlePlanSelect}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="mr-2 h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about workflow updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive email updates about workflow status
                    </p>
                  </div>
                  <Switch
                    checked={userSettings.notifications.email}
                    onCheckedChange={(checked) => updateSetting('notifications', 'email', checked)}
                    disabled={isSavingSettings}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Get instant notifications in your browser
                    </p>
                  </div>
                  <Switch
                    checked={userSettings.notifications.push}
                    onCheckedChange={(checked) => updateSetting('notifications', 'push', checked)}
                    disabled={isSavingSettings}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Workflow Completions</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when workflows finish processing
                    </p>
                  </div>
                  <Switch
                    checked={userSettings.notifications.workflow}
                    onCheckedChange={(checked) => updateSetting('notifications', 'workflow', checked)}
                    disabled={isSavingSettings}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Error Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when errors occur
                    </p>
                  </div>
                  <Switch
                    checked={userSettings.notifications.errors}
                    onCheckedChange={(checked) => updateSetting('notifications', 'errors', checked)}
                    disabled={isSavingSettings}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage your security preferences and authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={isUpdatingPassword}
                  />
                </div>

                <Button type="submit" variant="outline" disabled={isUpdatingPassword}>
                  {isUpdatingPassword ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </Button>
              </form>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Add an extra layer of security to your account
                </p>
                <Button variant="outline" disabled={true}> {/* Disable for now, implement later */}
                  Enable 2FA (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Model Tab (Advanced Settings) */}
        {canAccessAdvancedSettings && (
          <TabsContent value="ai" className="space-y-4"> {/* Changed value to 'ai' */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="mr-2 h-5 w-5" />
                  AI Model Configuration
                </CardTitle>
                <CardDescription>
                  Configure the AI model and parameters for your workflows (Enterprise Only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Model Provider</Label>
                    <Select
                      value={userSettings.ai.provider}
                      onValueChange={(value) => updateSetting('ai', 'provider', value)}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                        <SelectItem value="mistral">Mistral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={userSettings.ai.model}
                      onValueChange={(value) => updateSetting('ai', 'model', value)}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llama3">LLaMA 3</SelectItem>
                        <SelectItem value="llama3:70b">LLaMA 3 70B</SelectItem>
                        <SelectItem value="mistral">Mistral 7B</SelectItem>
                        <SelectItem value="codellama">Code Llama</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature: {userSettings.ai.temperature}</Label>
                  <Input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={userSettings.ai.temperature}
                    onChange={(e) => updateSetting('ai', 'temperature', parseFloat(e.target.value))}
                    disabled={isSavingSettings}
                  />
                  <p className="text-sm text-muted-foreground">
                    Lower values make the model more focused and deterministic
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={userSettings.ai.maxTokens}
                    onChange={(e) => updateSetting('ai', 'maxTokens', parseInt(e.target.value))}
                    disabled={isSavingSettings}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-green-600">
                    <Monitor className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                  <Button variant="outline" size="sm" onClick={testConnection} disabled={isTestingConnection}>
                    {isTestingConnection ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    {isTestingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Database Tab (Advanced Settings) */}
        {canAccessAdvancedSettings && (
          <TabsContent value="database" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5" />
                  Database Configuration
                </CardTitle>
                <CardDescription>
                  Configure your database connection and settings (Enterprise Only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dbType">Database Type</Label>
                  <Select
                    value={userSettings.database.type}
                    onValueChange={(value) => updateSetting('database', 'type', value)}
                    disabled={isSavingSettings}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqlite">SQLite (Local)</SelectItem>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {userSettings.database.type !== 'sqlite' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dbHost">Host</Label>
                      <Input
                        id="dbHost"
                        value={userSettings.database.host}
                        onChange={(e) => updateSetting('database', 'host', e.target.value)}
                        disabled={isSavingSettings}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dbPort">Port</Label>
                      <Input
                        id="dbPort"
                        type="number"
                        value={userSettings.database.port}
                        onChange={(e) => updateSetting('database', 'port', parseInt(e.target.value))}
                        disabled={isSavingSettings}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="dbName">Database Name</Label>
                  <Input
                    id="dbName"
                    value={userSettings.database.name}
                    onChange={(e) => updateSetting('database', 'name', e.target.value)}
                    disabled={isSavingSettings}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-green-600">
                    <Monitor className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                  <Button variant="outline" size="sm" onClick={testConnection} disabled={isTestingConnection}>
                    {isTestingConnection ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    {isTestingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Performance Tab (Advanced Settings) */}
        {canAccessAdvancedSettings && (
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="mr-2 h-5 w-5" />
                  Performance Settings
                </CardTitle>
                <CardDescription>
                  Configure performance and resource usage settings (Enterprise Only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxTasks">Max Concurrent Tasks</Label>
                  <Input
                    id="maxTasks"
                    type="number"
                    value={userSettings.performance.maxConcurrentTasks}
                    onChange={(e) => updateSetting('performance', 'maxConcurrentTasks', parseInt(e.target.value))}
                    disabled={isSavingSettings}
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum number of tasks that can run simultaneously
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeout">Task Timeout (seconds)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={userSettings.performance.timeout}
                    onChange={(e) => updateSetting('performance', 'timeout', parseInt(e.target.value))}
                    disabled={isSavingSettings}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retries">Retry Attempts</Label>
                  <Input
                    id="retries"
                    type="number"
                    value={userSettings.performance.retryAttempts}
                    onChange={(e) => updateSetting('performance', 'retryAttempts', parseInt(e.target.value))}
                    disabled={isSavingSettings}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}