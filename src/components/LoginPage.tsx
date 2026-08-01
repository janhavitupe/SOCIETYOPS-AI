import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Mail, Phone, UserPlus } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    flatNumber: '',
    phone: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Prepare sanitized payload
    const payload = {
      flatNumber: formData.flatNumber?.toString().trim(),
      // keep + if provided then digits only
      phone: formData.phone?.toString().replace(/[^0-9+]/g, '').trim(),
      password: formData.password,
    };

    // Try primary relative API first, then fall back to common localhost ports if network fails
    const attemptUrls = ['/api/auth/login', 'http://localhost:3000/api/auth/login', 'http://localhost:3001/api/auth/login'];
    let lastError: any = null;
    let response: Response | null = null;

    for (const url of attemptUrls) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // If we get a response (even 4xx), stop trying further fallbacks
        if (response) break;
      } catch (err) {
        lastError = err;
        // try next fallback
      }
    }

    try {
      if (!response) {
        throw new Error('Unable to reach backend. Start the dev server and try again.');
      }

      const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));

      if (!response.ok) {
        throw new Error(data.error || `Login failed (status ${response.status})`);
      }

      // Login successful
      login(data.token, data.resident);
      setSuccess('Login successful! Redirecting...');

      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      // Prefer server message, else network/fallback error
      setError(err.message || lastError?.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">SocietyOps AI</h1>
          <p className="text-slate-600 dark:text-slate-400">Secure Maintenance Coordination System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="flatNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Flat Number
            </label>
            <input
              type="text"
              id="flatNumber"
              name="flatNumber"
              value={formData.flatNumber}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your flat number (e.g., B-402)"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your phone number (e.g., +91 98210 99887)"
              autoComplete="tel"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-all"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-sm">
            <svg className="flex-shrink-0 h-4 w-4 text-rose-500 dark:text-rose-400" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"></path>
            </svg>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm">
            <svg className="flex-shrink-0 h-4 w-4 text-emerald-500 dark:text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1 0a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm4.93-4.07l-2.76-3.17a1 1 0 0 0-1.42 0l-1.28 1.34a1 1 0 0 0 1.13 1.13l1.62 1.62a1 1 0 0 1 1.42 0l3.42-3.77a1 1 0 0 0 0-1.42Z"></path>
            </svg>
            <span>{success}</span>
          </div>
        )}

        <div className="text-center text-sm">
          <p className="text-slate-500 dark:text-slate-400">
            Demo Accounts:
          </p>
            <div className="space-y-1 mt-2">
            <p className="flex items-center justify-center text-sm font-mono">
              Vikram Mehta (B-402): <span className="ml-1 text-blue-500">vikram123</span>
            </p>
            <p className="flex items-center justify-center text-sm font-mono">
              Mrs. Ananya Sharma (A-101): <span className="ml-1 text-blue-500">ananya123</span>
            </p>
            <p className="flex items-center justify-center text-sm font-mono">
              Mr. Arvind Sharma (Maint): <span className="ml-1 text-blue-500">arvind123</span>
            </p>
            <p className="flex items-center justify-center text-sm font-mono">
              Admin Desk (Admin): <span className="ml-1 text-blue-500">admin123</span>
            </p>
          </div>
        </div>

        <div className="border-t pt-4 text-center text-slate-500 dark:text-slate-400">
          New to SocietyOps AI?{" "}
          <a href="/register" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 underline">
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
};
