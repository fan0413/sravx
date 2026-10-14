import { ref, readonly } from 'vue';
import { parseAdminChannel, workspaceStorageKey, type AdminChannel } from './admin-workspace';
function initialChannel(): AdminChannel {
  // UI preference only; unavailable browser storage must not block administration.
  try { return parseAdminChannel(localStorage.getItem(workspaceStorageKey)) || 'common'; }
  catch { return 'common'; }
}
const selectedChannel = ref<AdminChannel>(initialChannel());
export function useAdminWorkspace() {
  function setChannel(channel: AdminChannel) {
    selectedChannel.value = channel;
    try { localStorage.setItem(workspaceStorageKey, channel); }
    catch { /* Private-mode/storage restrictions: retain the preference in memory. */ }
  }
  return { channel: readonly(selectedChannel), setChannel };
}
