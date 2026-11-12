/**
 * Navbar Showcase Component
 * Demonstrates all navbar features and animations
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout';
import { ArrowRight, Zap, Shield, Gauge } from 'lucide-react';

const NavbarShowcase: React.FC = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  };

  const features = [
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Optimized for performance with smooth animations',
    },
    {
      icon: Shield,
      title: 'Secure',
      description: 'Built with security best practices in mind',
    },
    {
      icon: Gauge,
      title: 'Responsive',
      description: 'Perfect on desktop, tablet, and mobile devices',
    },
  ];

  return (
    <div className="w-full">
      {/* Navbar is fixed, so content starts below */}
      <Navbar />

      {/* Hero Section */}
      <section className="min-h-screen bg-gradient-to-b from-background via-surface to-background pt-32 pb-20">
        <motion.div
          className="container"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="text-center mb-8">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-gradient">
              CloudOps Navbar
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Modern, responsive SaaS navbar built with React, Tailwind CSS, and Framer Motion.
              Scroll down to see the blur effect in action.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="flex justify-center gap-md">
            <button className="btn btn-primary">Get Started</button>
            <button className="btn btn-secondary">Learn More</button>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-20 border-t border-border">
        <motion.div
          className="container"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <motion.h2
            variants={itemVariants}
            className="text-4xl font-bold mb-12 text-center"
          >
            Navbar Features
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="card p-lg"
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <motion.div
                    className="mb-4 inline-flex p-md rounded-lg"
                    style={{
                      background: 'linear-gradient(135deg, rgba(36, 88, 211, 0.1), rgba(36, 88, 211, 0.05))',
                      border: '1px solid var(--color-border)',
                    }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <Icon size={28} color="#2458D3" />
                  </motion.div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-text-secondary">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Implementation Section */}
      <section className="py-20 border-t border-border">
        <motion.div
          className="container max-w-3xl"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold mb-8">
            Quick Implementation
          </motion.h2>

          <motion.div variants={itemVariants} className="card p-lg">
            <p className="text-text-secondary mb-4">
              Import and use the Navbar component in your app:
            </p>
            <div className="bg-surface-elevated rounded-lg p-lg overflow-x-auto">
              <pre className="font-mono text-sm text-text-primary">
                {`import { Navbar } from '@/components/layout';

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        {/* Your page content */}
      </main>
    </>
  );
}`}
              </pre>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-8">
            <p className="text-text-secondary mb-4">
              Or use the Layout wrapper component for convenience:
            </p>
            <div className="card p-lg">
              <div className="bg-surface-elevated rounded-lg p-lg overflow-x-auto">
                <pre className="font-mono text-sm text-text-primary">
                  {`import { Layout } from '@/components/layout';

export default function HomePage() {
  return (
    <Layout>
      {/* Navbar is included automatically */}
    </Layout>
  );
}`}
                </pre>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Interactions Guide */}
      <section className="py-20 border-t border-border">
        <motion.div
          className="container max-w-3xl"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold mb-8">
            Interactive Elements
          </motion.h2>

          <div className="space-y-md">
            <motion.div variants={itemVariants} className="card p-lg">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-md">
                <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
                Hover Effects
              </h3>
              <p className="text-text-secondary">
                Hover over the navigation links to see the smooth underline animation. The logo also has a subtle scale effect on hover.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="card p-lg">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-md">
                <span className="inline-block w-2 h-2 rounded-full bg-accent"></span>
                Scroll Effect
              </h3>
              <p className="text-text-secondary">
                Scroll up and down to see the navbar's glassmorphism effect enhance with blur and shadow as you scroll.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="card p-lg">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-md">
                <span className="inline-block w-2 h-2 rounded-full bg-success"></span>
                Mobile Menu
              </h3>
              <p className="text-text-secondary">
                Resize your window to see the responsive mobile menu. On mobile, tap the hamburger icon to reveal the navigation links.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="card p-lg">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-md">
                <span className="inline-block w-2 h-2 rounded-full bg-warning"></span>
                GitHub Integration
              </h3>
              <p className="text-text-secondary">
                The login button is ready to be connected to your GitHub OAuth flow. Click it to initiate authentication.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="py-20 border-t border-border">
        <motion.div
          className="container max-w-2xl text-center"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold mb-4">
            Ready to build with CloudOps?
          </motion.h2>
          <motion.p variants={itemVariants} className="text-xl text-text-secondary mb-8">
            Start deploying smarter today with our intuitive platform.
          </motion.p>
          <motion.button
            variants={itemVariants}
            className="btn btn-primary gap-md"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Get Started Now
            <ArrowRight size={20} />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer spacer */}
      <div className="py-10 border-t border-border text-center text-text-secondary">
        <p>&copy; 2026 CloudOps. All rights reserved.</p>
      </div>
    </div>
  );
};

export default NavbarShowcase;
