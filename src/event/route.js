// Exact route matching for the public event. Only these two paths are the event;
// query strings never change route identity and no other /event/* path matches.
export const PIXEL_PASSPORT_PATH = '/event/pixel-passport';
export const PIXEL_PASSPORT_PATHS = Object.freeze([PIXEL_PASSPORT_PATH, `${PIXEL_PASSPORT_PATH}/`]);

export function isPixelPassportPath(pathname) {
  return typeof pathname === 'string' && PIXEL_PASSPORT_PATHS.includes(pathname);
}
