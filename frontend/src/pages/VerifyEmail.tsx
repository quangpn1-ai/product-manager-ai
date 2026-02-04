import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid verification link');
      return;
    }

    const verifyEmail = async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setError(err.response?.data?.error?.message || 'Failed to verify email');
      }
    };

    verifyEmail();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <Loader2 className="h-12 w-12 text-blue-500 mx-auto animate-spin" />
          <h2 className="text-xl font-medium text-gray-700">
            Verifying your email...
          </h2>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-800 mb-2">
              Verification Failed
            </h2>
            <p className="text-red-700 mb-4">
              {error}
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-green-800 mb-2">
            Email Verified!
          </h2>
          <p className="text-green-700 mb-4">
            Your email has been verified successfully. You can now login to your account.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
