import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Hero from '../Hero';

function renderHero() {
  return render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>
  );
}

describe('Hero', () => {
  it('explains the GitHub-to-cloud deployment workflow', () => {
    renderHero();

    expect(screen.getByRole('heading', { level: 1, name: /push to main.*go live/i })).toBeInTheDocument();
    expect(screen.getByText(/ship from github to aws or azure/i)).toBeInTheDocument();
  });

  it('shows the source, build, and deploy stages', () => {
    renderHero();

    expect(screen.getByText('SOURCE')).toBeInTheDocument();
    expect(screen.getByText('BUILD')).toBeInTheDocument();
    expect(screen.getByText('DEPLOY')).toBeInTheDocument();
    expect(screen.getByText('AWS · production')).toBeInTheDocument();
  });

  it('provides GitHub and documentation actions', () => {
    renderHero();

    expect(screen.getByRole('button', { name: /connect github/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore the docs/i })).toBeInTheDocument();
  });
});
