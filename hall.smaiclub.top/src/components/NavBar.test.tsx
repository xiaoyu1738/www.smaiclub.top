import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  beforeEach(() => {
    window.CommonAuth = {
      init: vi.fn()
    };
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    delete window.CommonAuth;
  });

  function renderNavBar(showArtistSearch = true) {
    const onSearchTextChange = vi.fn();

    render(
      <MemoryRouter initialEntries={['/artists']}>
        <NavBar
          showArtistSearch={showArtistSearch}
          searchText=""
          onSearchTextChange={onSearchTextChange}
        />
      </MemoryRouter>
    );

    return { onSearchTextChange };
  }

  it('does not render the search input until the search panel is opened', async () => {
    const user = userEvent.setup();
    renderNavBar(true);

    expect(screen.queryByRole('searchbox', { name: '搜索乐队' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '展开搜索框' }));

    const searchInput = screen.getByRole('searchbox', { name: '搜索乐队' });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '收起搜索框' }));

    expect(screen.queryByRole('searchbox', { name: '搜索乐队' })).not.toBeInTheDocument();
  });

  it('removes the mobile drawer from the document when closed and locks body scroll when open', async () => {
    const user = userEvent.setup();
    renderNavBar(true);

    expect(screen.queryByRole('navigation', { name: '移动端导航' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    await user.click(screen.getByRole('button', { name: '打开菜单' }));

    expect(screen.getByRole('navigation', { name: '移动端导航' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: '关闭菜单' }));

    expect(screen.queryByRole('navigation', { name: '移动端导航' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('clears search state when artist search is disabled', () => {
    const onSearchTextChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/artists']}>
        <NavBar
          showArtistSearch
          searchText="slint"
          onSearchTextChange={onSearchTextChange}
        />
      </MemoryRouter>
    );

    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <NavBar
          showArtistSearch={false}
          searchText="slint"
          onSearchTextChange={onSearchTextChange}
        />
      </MemoryRouter>
    );

    expect(onSearchTextChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('searchbox', { name: '搜索乐队' })).not.toBeInTheDocument();
  });
});
