import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/app/providers/auth-provider';
import { Layout } from '@/components/layout';
import LoginCard from '@/components/auth/LoginCard';
import { AUTH_TOKEN_KEY } from '@/lib/constants';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      login({ token }).then((success) => {
        if (success) navigate('/dashboard');
        else localStorage.removeItem(AUTH_TOKEN_KEY);
      });
    }
  }, [searchParams, login, navigate]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!loading && isAuthenticated && !token) navigate('/dashboard');
  }, [isAuthenticated, loading, navigate, searchParams]);

  return (
    <Layout showNavbar={false}>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <h1 className="font-display text-2xl font-bold text-foreground">Sign in to CloudOps</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect GitHub to manage deployments and infrastructure.
            </p>
          </div>
          <LoginCard />
        </motion.div>
      </div>
    </Layout>
  );
};

export default LoginPage;
