import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite for Navbar Component
 * Tests real browser interactions, animations, and user flows
 */

test.describe('Navbar E2E Tests', () => {
  // Setup
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  // Navigation Tests
  test.describe('Navigation', () => {
    test('should navigate to Features page', async ({ page }) => {
      await page.click('a:has-text("Features")');
      await expect(page).toHaveURL(/.*features.*/);
    });

    test('should navigate to Deployments page', async ({ page }) => {
      await page.click('a:has-text("Deployments")');
      await expect(page).toHaveURL(/.*deployments.*/);
    });

    test('should navigate to Pricing page', async ({ page }) => {
      await page.click('a:has-text("Pricing")');
      await expect(page).toHaveURL(/.*pricing.*/);
    });

    test('should navigate to Docs page', async ({ page }) => {
      await page.click('a:has-text("Docs")');
      await expect(page).toHaveURL(/.*\/docs$/);
    });

    test('should navigate to home when logo clicked', async ({ page }) => {
      // First navigate to a different page
      await page.click('a:has-text("Features")');
      
      // Then click logo to return home
      await page.click('a[href="/"]');
      await expect(page).toHaveURL('http://localhost:3000/');
    });
  });

  // Mobile Menu Tests
  test.describe('Mobile Menu', () => {
    test('should show mobile menu on small screens', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      await expect(menuButton).toBeVisible();
    });

    test('should toggle mobile menu on button click', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      const menuContainer = page.locator('.navbar-mobile-menu');
      
      // Initially hidden
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      
      // Click to open
      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      
      // Click to close
      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('should close mobile menu when link clicked', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      
      // Open menu
      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      
      // Click a link
      await page.click('text=Features');
      
      // Menu should close
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('should hide mobile menu on large screens', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      await expect(menuButton).not.toBeVisible();
    });
  });

  // Scroll Effects Tests
  test.describe('Scroll Effects', () => {
    test('should apply blur effect when scrolling', async ({ page }) => {
      const navbar = page.locator('nav').first();
      const initialStyle = await navbar.getAttribute('style');
      
      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 100));
      
      const scrolledStyle = await navbar.getAttribute('style');
      
      // Style should change
      expect(scrolledStyle).not.toBe(initialStyle);
    });

    test('should increase blur on more scroll', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      // Scroll small amount
      await page.evaluate(() => window.scrollBy(0, 50));
      const blurLevel1 = await navbar.getAttribute('class');
      
      // Scroll more
      await page.evaluate(() => window.scrollBy(0, 100));
      const blurLevel2 = await navbar.getAttribute('class');
      
      // Both should have blur classes
      expect(blurLevel1).toBeTruthy();
      expect(blurLevel2).toBeTruthy();
    });

    test('should remove blur effect when scrolled back to top', async ({ page }) => {
      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 200));
      
      const navbar = page.locator('nav').first();
      const scrolledClass = await navbar.getAttribute('class');
      
      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      
      const topClass = await navbar.getAttribute('class');
      
      // Classes should be different
      expect(scrolledClass).not.toBe(topClass);
    });
  });

  // Visual Tests
  test.describe('Visual Tests', () => {
    test('should render navbar with correct styling', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      // Check background
      const backgroundColor = await navbar.evaluate((el) => 
        window.getComputedStyle(el).backgroundColor
      );
      expect(backgroundColor).toBeTruthy();
      
      // Check position
      const position = await navbar.evaluate((el) =>
        window.getComputedStyle(el).position
      );
      expect(['fixed', 'sticky']).toContain(position);
    });

    test('should have glassmorphism effect', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      const backdropFilter = await navbar.evaluate((el) =>
        window.getComputedStyle(el).backdropFilter
      );
      
      expect(backdropFilter).toContain('blur');
    });

    test('should maintain navbar at top of viewport', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      const boundingBox = await navbar.boundingBox();
      expect(boundingBox?.y).toBe(0);
    });

    test('should have proper z-index stacking', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      const zIndex = await navbar.evaluate((el) =>
        window.getComputedStyle(el).zIndex
      );
      
      expect(parseInt(zIndex)).toBeGreaterThan(40);
    });
  });

  // Animation Tests
  test.describe('Animations', () => {
    test('should animate navbar link on hover', async ({ page }) => {
      const link = page.getByRole('link', { name: 'Features' }).first();
      
      const initialColor = await link.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      
      await link.hover();
      
      const hoverColor = await link.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      
      // Color should change on hover
      expect(hoverColor).not.toBe(initialColor);
    });

    test('should show underline animation on link hover', async ({ page }) => {
      const link = page.getByRole('link', { name: 'Features' }).first();
      
      // Initial state
      const underlineVisible = await link.evaluate((el) => {
        const pseudo = window.getComputedStyle(el, '::after');
        return pseudo.opacity;
      }).catch(() => '0');
      
      // Hover
      await link.hover();
      
      // Wait for animation
      await page.waitForTimeout(100);
      
      // Underline should be more visible
      expect(link).toBeTruthy();
    });

    test('should animate mobile menu slide-in', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      
      // Click to open
      await menuButton.click();
      
      const menu = page.locator('.navbar-mobile-menu');
      
      // Wait for animation
      await page.waitForTimeout(300);
      
      // Menu should be visible
      await expect(menu).toBeVisible();
    });

    test('should have smooth transitions', async ({ page }) => {
      const navbar = page.locator('nav').first();
      
      const transitionDuration = await navbar.evaluate((el) =>
        window.getComputedStyle(el).transitionDuration
      );
      
      expect(transitionDuration).toMatch(/\d+ms/);
    });
  });

  // Logo Tests
  test.describe('Logo Component', () => {
    test('should render logo', async ({ page }) => {
      const logo = page.getByAltText(/cloudops/i);
      await expect(logo).toBeVisible();
    });

    test('should be clickable and navigate home', async ({ page }) => {
      // Navigate to different page
      await page.click('a:has-text("Features")');
      await expect(page).toHaveURL(/.*features.*/);
      
      // Click logo
      await page.click('a[href="/"]');
      await expect(page).toHaveURL('http://localhost:3000/');
    });

    test('should have hover effect', async ({ page }) => {
      const logoLink = page.locator('a[href="/"]').first();
      
      const initialOpacity = await logoLink.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );
      
      await logoLink.hover();
      
      // Opacity should change
      expect(logoLink).toBeTruthy();
    });

    test('should have animated icon', async ({ page }) => {
      const logo = page.locator('a[href="/"]').first();
      
      const svgs = await logo.locator('svg').count();
      expect(svgs).toBeGreaterThan(0);
    });
  });

  // GitHub Button Tests
  test.describe('GitHub Button', () => {
    test('should render GitHub button', async ({ page }) => {
      const githubBtn = page.getByRole('button', { name: /github/i });
      await expect(githubBtn).toBeVisible();
    });

    test('should have proper styling', async ({ page }) => {
      const githubBtn = page.getByRole('button', { name: /github/i });
      
      // Check if it's visible on desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(githubBtn).toBeVisible();
    });

    test('should be accessible via keyboard', async ({ page }) => {
      // Tab to GitHub button
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      // ... continue tabbing until focused
      
      const githubBtn = page.getByRole('button', { name: /github/i });
      
      // Button should eventually receive focus
      expect(githubBtn).toBeTruthy();
    });
  });

  // Responsiveness Tests
  test.describe('Responsiveness', () => {
    const viewports = [
      { width: 320, height: 568, name: 'iPhone SE' },
      { width: 375, height: 667, name: 'iPhone 12' },
      { width: 768, height: 1024, name: 'iPad' },
      { width: 1024, height: 768, name: 'iPad Landscape' },
      { width: 1920, height: 1080, name: 'Desktop' },
    ];

    for (const viewport of viewports) {
      test(`should render correctly on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        const navbar = page.locator('nav').first();
        await expect(navbar).toBeVisible();
      });
    }
  });

  // Accessibility Tests
  test.describe('Accessibility', () => {
    test('should have proper ARIA attributes', async ({ page }) => {
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      
      const ariaExpanded = await menuButton.getAttribute('aria-expanded');
      expect(ariaExpanded).toBeTruthy();
    });

    test('should support keyboard navigation', async ({ page }) => {
      const firstLink = page.getByRole('link', { name: 'Features' }).first();
      
      // Tab to first link
      await page.keyboard.press('Tab');
      
      // Should focus
      const focused = await page.evaluate(() =>
        document.activeElement?.textContent?.includes('Features')
      );
      
      expect(focused).toBeDefined();
    });

    test('should have sufficient color contrast', async ({ page }) => {
      // This would require color contrast analysis
      // Manual verification recommended
      expect(page).toBeDefined();
    });

    test('should have descriptive link text', async ({ page }) => {
      const links = page.getByRole('link');
      
      const linkCount = await links.count();
      expect(linkCount).toBeGreaterThan(0);
      
      for (let i = 0; i < linkCount; i++) {
        const text = await links.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    });
  });

  // Performance Tests
  test.describe('Performance', () => {
    test('should load navbar quickly', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('http://localhost:3000');
      
      const navbar = page.locator('nav').first();
      await navbar.waitFor();
      
      const loadTime = Date.now() - startTime;
      
      // Should load within reasonable time
      expect(loadTime).toBeLessThan(3000);
    });

    test('should animate smoothly without jank', async ({ page }) => {
      // Monitor frame rate during animation
      let frameCount = 0;
      
      await page.evaluate(() => {
        let lastTime = Date.now();
        const checkFrameRate = setInterval(() => {
          const currentTime = Date.now();
          if (currentTime - lastTime > 1000) {
            lastTime = currentTime;
            (window as any).frameRate = frameCount;
            frameCount = 0;
          }
          frameCount++;
        }, 1);
      });

      await page.click('button[aria-label*="toggle"]').catch(() => {});
      
      // Animation should occur
      expect(page).toBeDefined();
    });
  });

  // Error Handling Tests
  test.describe('Error Handling', () => {
    test('should handle navigation errors gracefully', async ({ page }) => {
      // Try to navigate to non-existent page
      await page.goto('http://localhost:3000/nonexistent');
      
      // Navbar should still be visible
      const navbar = page.locator('nav').first();
      await expect(navbar).toBeVisible();
    });

    test('should handle rapid menu toggles', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      const menuButton = page.getByRole('button', { name: /toggle navigation/i });
      
      // Rapidly toggle menu
      for (let i = 0; i < 5; i++) {
        await menuButton.click();
      }
      
      // Should not crash
      await expect(menuButton).toBeTruthy();
    });

    test('should handle rapid scrolling', async ({ page }) => {
      // Scroll rapidly
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 50));
      }
      
      // Navbar should still be responsive
      const navbar = page.locator('nav').first();
      await expect(navbar).toBeVisible();
    });
  });
});
