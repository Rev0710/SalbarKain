export const ILOILO_CENTER = [10.7450, 122.5500];
export const ILOILO_MAX_BOUNDS = [[10.4000, 122.0500], [11.6000, 123.3500]];
export const ILOILO_MAP_OPTIONS = {
  minZoom: 11,
  maxZoom: 18,
  maxBounds: ILOILO_MAX_BOUNDS,
  maxBoundsViscosity: 1.0,
};

export function isWithinIloilo(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= ILOILO_MAX_BOUNDS[0][0]
    && latitude <= ILOILO_MAX_BOUNDS[1][0]
    && longitude >= ILOILO_MAX_BOUNDS[0][1]
    && longitude <= ILOILO_MAX_BOUNDS[1][1];
}
