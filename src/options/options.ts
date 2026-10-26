import { DEFAULTS, loadState, saveDisabledSites, saveSettings } from '../shared/settings';

const sites = document.getElementById('sites') as HTMLUListElement;
const empty = document.getElementById('empty') as HTMLElement;
const status = document.getElementById('reset-status') as HTMLElement;

async function renderSites(): Promise<void> {
  const { disabledSites } = await loadState();
  sites.replaceChildren();
  empty.hidden = disabledSites.length > 0;
  for (const host of disabledSites) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = host;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Turn back on';
    remove.addEventListener('click', async () => {
      await saveDisabledSites(disabledSites.filter((h) => h !== host));
      await renderSites();
    });
    li.append(name, remove);
    sites.append(li);
  }
}

document.getElementById('reset')?.addEventListener('click', async () => {
  await saveSettings({ ...DEFAULTS });
  await saveDisabledSites([]);
  status.textContent = 'Settings reset.';
  await renderSites();
});

void renderSites();
