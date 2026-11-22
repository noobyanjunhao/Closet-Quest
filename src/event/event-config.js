// Public event settings. Nothing here is secret. This is a build-time switch:
// changing `enabled` needs a rebuild and redeploy, it is not an instant kill switch.
export const eventConfig = Object.freeze({
  enabled: true,
  eventId: 'campus-demo',
  // Leave both empty until the event name and date are confirmed; the card omits them.
  displayName: '',
  displayDate: '',
  sceneIds: Object.freeze(['coffee-break', 'campus-walk', 'after-talks']),
  rendererVersion: 'cq-pixel-v1',
  maxVisitors: 20
});
