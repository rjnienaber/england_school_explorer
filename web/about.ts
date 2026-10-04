// The "About this map" dialog: where it links to, and how it opens and closes.
// The text itself is static, in index.html; the data sources list inside it is filled in by main.ts.

/** The one place the repository address is written. A rename or move is a one-line change here. */
export const REPO_URL = 'https://github.com/rjnienaber/england_school_explorer';

/**
 * The licence of the code, for the About page. `null` shows nothing: the owner hasn't chosen one yet (there is
 * no LICENSE file), so the page makes no claim. Set it (for example 'MIT') once a LICENSE file is added.
 */
export const CODE_LICENCE: string | null = null;

/** The sentence about the code's licence, or an empty string when none is set. */
export function codeLicenceLine(licence: string | null = CODE_LICENCE): string {
  return licence ? `The source code is released under the ${licence} licence.` : '';
}

/** Address of a page in the repository (`/issues/new`, `/releases/latest`), or of the README section after `#`. */
export function repoUrl(path = '', repo = REPO_URL): string {
  return `${repo}${path}`;
}

/** Wires up the About dialog: the header button, any "open About" link, Esc, the backdrop and `?about`. */
export function bindAbout(): void {
  const dialog = document.getElementById('about-dialog') as HTMLDialogElement;

  // Every link into the repository is built from REPO_URL and opens in a new tab
  for (const a of dialog.querySelectorAll<HTMLAnchorElement>('a[data-repo]')) {
    a.href = repoUrl(a.dataset.repo);
    a.target = '_blank';
    a.rel = 'noopener';
  }
  const licence = codeLicenceLine();
  const licenceEl = document.getElementById('about-code-licence')!;
  licenceEl.textContent = licence;
  licenceEl.hidden = !licence;

  /** Keeps `?about` in the address while the dialog is open, so the page can be linked to. */
  const setParam = (open: boolean) => {
    const params = new URLSearchParams(location.search);
    if (open) params.set('about', '');
    else params.delete('about');
    const query = params.toString().replace(/(^|&)about=(?=&|$)/, '$1about').replaceAll('%2C', ',');
    try {
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    } catch {
      // some embedded browsers refuse
    }
  };
  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    dialog.querySelector('.about-body')?.scrollTo(0, 0);
    setParam(true);
  };

  for (const el of document.querySelectorAll('[data-open-about]')) el.addEventListener('click', open);
  dialog.addEventListener('close', () => setParam(false));
  dialog.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // The close button, or a click on the backdrop (which lands on the dialog element itself)
    if (target === dialog || target.closest('[data-close-about]')) dialog.close();
  });

  const params = new URLSearchParams(location.search);
  if (params.has('about') || location.hash === '#about') open();
}
