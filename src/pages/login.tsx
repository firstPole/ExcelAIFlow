import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Zap, Mail, Lock, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { analyticsService } from '@/services/analytics.service'; // Import analytics service

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('rememberedEmail') || ''); // Load remembered email
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('rememberedEmail')); // Set based on remembered email
  const [error, setError] = useState('');
  const { login, isLoading, user } = useAuth(); // Get user from auth context
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/'); // Redirect to dashboard or home page
      toast.info('You are already logged in.');
    }
    // Track page view for analytics
    analyticsService.trackPageView('login');
  }, [user, navigate]); // Depend on user to trigger redirect

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    analyticsService.track('login_attempt', { email }); // Track login attempt

    if (!email || !password) {
      setError('Please fill in all fields.');
      analyticsService.trackError('login_validation_failed', { field: 'all', email });
      return;
    }

    try {
      await login(email, password);
      // toast.success('Login successful!'); // AuthContext already shows this toast
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      analyticsService.track('login_success', { email, rememberMe }); // Track successful login
      navigate('/'); // Navigate to dashboard
    } catch (err: any) {
      const errorMessage = err.message || 'Invalid email or password.';
      setError(errorMessage);
      // toast.error('Login failed'); // AuthContext already shows this toast
      analyticsService.trackError('login_failed', { email, error: errorMessage }); // Track failed login
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    analyticsService.track('demo_login_attempt'); // Track demo login attempt
    try {
      await login('demo@excelflow.ai', 'demo123');
      // toast.success('Demo login successful!'); // AuthContext already shows this toast
      analyticsService.track('demo_login_success');
      navigate('/');
    } catch (err: any) {
      const errorMessage = err.message || 'Demo login failed.';
      setError(errorMessage);
      analyticsService.trackError('demo_login_failed', { error: errorMessage });
      // toast.error('Demo login failed'); // AuthContext already shows this toast
    }
  };

  const handleProductOwnerLogin = async () => {
    setError('');
    analyticsService.track('product_owner_login_attempt'); // Track product owner login attempt
    try {
      await login('owner@excelflow.ai', 'owner123!');
      // toast.success('Product Owner login successful!'); // AuthContext already shows this toast
      analyticsService.track('product_owner_login_success');
      navigate('/');
    } catch (err: any) {
      const errorMessage = err.message || 'Product Owner login failed.';
      setError(errorMessage);
      analyticsService.trackError('product_owner_login_failed', { error: errorMessage });
      // toast.error('Product Owner login failed'); // AuthContext already shows this toast
    }
  };

  return (
    // Centering the content:
    // The 'min-h-screen flex items-center justify-center' on the parent div
    // already centers its direct child.
    // The 'w-full max-w-md' on the child ensures it doesn't stretch too wide.
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-8"> {/* Added py-8 for vertical padding on smaller screens */}
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="text-center">
            <motion.div
              className="flex items-center justify-center space-x-2 mb-6"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <div className="p-2 bg-primary rounded-lg">
                <Zap className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold">ExcelFlow AI</h1>
                <p className="text-xs text-muted-foreground">Production Ready</p>
              </div>
            </motion.div>
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p className="text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          {/* Login Form */}
          <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => {
                        // Ensure checked is a boolean
                        setRememberMe(!!checked);
                      }}
                      disabled={isLoading}
                    />
                    <Label htmlFor="remember" className="text-sm">
                      Remember me
                    </Label>
                  </div>
                  <Button variant="link" className="px-0 text-sm" disabled={isLoading}>
                    Forgot password?
                  </Button>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              <div className="mt-4">
                <Separator className="my-4" />
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleDemoLogin}
                    disabled={isLoading}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Try Demo Account
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleProductOwnerLogin}
                    disabled={isLoading}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Product Owner Access
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Button variant="link" className="px-0">
                Sign up
              </Button>
            </p>
          </div>

          {/* Demo Instructions */}
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Test Accounts</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <strong>Demo User:</strong> demo@excelflow.ai / demo123
                </div>
                <div>
                  <strong>Product Owner:</strong> owner@excelflow.ai / owner123!
                </div>
                <p className="text-xs mt-2">
                  Product Owner has exclusive access to Advanced Analytics
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}